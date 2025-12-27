import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import type { SyncStatusDto } from '@/application/dtos';
import { SyncLog, SyncStatus } from '@/domain/models';
import type { SyncLogRepository } from '@/domain/repositories/sync-log.repository.interface';
import { SYNC_LOG_REPOSITORY } from '@/domain/repositories/sync-log.repository.interface';
import type { ILogger } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import type { SyncJobData } from '@/infrastructure/queue';
import { SYNC_JOB_NAME, SYNC_QUEUE_NAME } from '@/infrastructure/queue';

export interface TriggerSyncResult {
  syncLogId: number | undefined;
  message: string;
  alreadyRunning: boolean;
}

export interface ResetSyncResult {
  syncLogId: number | undefined;
  previousStatus: SyncStatus;
  message: string;
}

/**
 * Service for synchronization with the legacy system.
 * Handles triggering, monitoring, history, and automatic recovery of syncs.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  constructor(
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
    private readonly configService: ConfigService,
    @Inject(LOGGER_SERVICE)
    private readonly logger: ILogger,
  ) {}

  private get batchSize(): number {
    return this.configService.get<number>('SYNC_BATCH_SIZE', 1000);
  }

  private get workerConcurrency(): number {
    return this.configService.get<number>('SYNC_WORKER_CONCURRENCY', 1);
  }

  private get staleSyncThresholdMinutes(): number {
    return this.configService.get<number>('SYNC_STALE_THRESHOLD_MINUTES', 30);
  }

  private get estimatedTotalRecords(): number {
    return this.configService.get<number>('SYNC_ESTIMATED_TOTAL_RECORDS', 1_000_000);
  }

  /** Marks orphan syncs as FAILED on application startup. */
  async onModuleInit(): Promise<void> {
    const orphanedCount = await this.syncLogRepository.markStaleAsFailed(
      0, // Any sync in progress is considered orphan on startup
      'Sync interrupted: application restarted',
    );

    if (orphanedCount > 0) {
      this.logger.warn('Orphan syncs marked as FAILED on startup', {
        count: orphanedCount,
      });
    }
  }

  /**
   * Triggers a new sync (idempotent - won't start if already running).
   * Automatically marks stale syncs as FAILED before checking.
   */
  async triggerSync(): Promise<TriggerSyncResult> {
    // First, check and mark stale syncs as FAILED (automatic timeout)
    const staleCount = await this.syncLogRepository.markStaleAsFailed(
      this.staleSyncThresholdMinutes,
      `Sync stale: timeout after ${this.staleSyncThresholdMinutes} minutes`,
    );

    if (staleCount > 0) {
      this.logger.warn('Stale syncs marked as FAILED', {
        count: staleCount,
        thresholdMinutes: this.staleSyncThresholdMinutes,
      });
    }

    const latestSync = await this.syncLogRepository.findLatest();

    if (SyncLog.isInProgress(latestSync)) {
      this.logger.log('Sync already in progress', {
        syncLogId: latestSync!.id,
        status: latestSync!.status,
      });

      return {
        syncLogId: latestSync!.id,
        message: 'Sync already in progress',
        alreadyRunning: true,
      };
    }

    const syncLog = await this.syncLogRepository.create({
      status: SyncStatus.PENDING,
    });

    this.logger.log('Enqueueing sync job', {
      syncLogId: syncLog.id,
    });

    await this.syncQueue.add(
      SYNC_JOB_NAME,
      { syncLogId: syncLog.id! },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      syncLogId: syncLog.id!,
      message: 'Sync started',
      alreadyRunning: false,
    };
  }

  /** Returns the most recent sync log, or null if none exist. */
  async getLatestSync(): Promise<SyncLog | null> {
    return this.syncLogRepository.findLatest();
  }

  /** Returns detailed status with computed metrics (progress, throughput, ETA). */
  async getLatestSyncStatus(): Promise<SyncStatusDto | null> {
    const syncLog = await this.syncLogRepository.findLatest();
    if (!syncLog) return null;

    const now = Date.now();
    const startTime = new Date(syncLog.startedAt).getTime();
    const elapsedMs = syncLog.durationMs ?? now - startTime;
    const elapsedSeconds = elapsedMs / 1000;

    const recordsPerSecond =
      elapsedSeconds > 0 ? Math.round((syncLog.totalProcessed / elapsedSeconds) * 10) / 10 : null;

    const progressPercent =
      syncLog.status === SyncStatus.COMPLETED
        ? 100
        : Math.min(Math.round((syncLog.totalProcessed / this.estimatedTotalRecords) * 1000) / 10, 99.9);

    let estimatedTimeRemaining: string | null = null;
    if (
      recordsPerSecond &&
      recordsPerSecond > 0 &&
      syncLog.status !== SyncStatus.COMPLETED &&
      syncLog.status !== SyncStatus.FAILED
    ) {
      const remaining = this.estimatedTotalRecords - syncLog.totalProcessed;
      const secondsRemaining = remaining / recordsPerSecond;
      estimatedTimeRemaining = this.formatDuration(secondsRemaining * 1000);
    }

    return {
      id: syncLog.id!,
      status: syncLog.status,
      startedAt: syncLog.startedAt,
      finishedAt: syncLog.finishedAt,
      totalProcessed: syncLog.totalProcessed,
      errorMessage: syncLog.errorMessage,
      durationMs: syncLog.durationMs ?? elapsedMs,
      durationFormatted: this.formatDuration(elapsedMs),
      recordsPerSecond,
      estimatedTimeRemaining,
      progressPercent,
      batchSize: this.batchSize,
      workerConcurrency: this.workerConcurrency,
    };
  }

  /** Formats milliseconds to human-readable string (e.g., "5m 30s"). */
  private formatDuration(ms: number): string {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  /** Returns sync history, ordered by most recent first. */
  async getSyncHistory(limit: number = 10): Promise<SyncLog[]> {
    return this.syncLogRepository.findAll(limit);
  }

  /** Scheduled sync - runs every 6 hours via cron. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleScheduledSync(): Promise<void> {
    this.logger.log('Running scheduled sync');
    await this.triggerSync();
  }

  /** Manually cancels a stuck sync, marking it as FAILED. */
  async resetCurrentSync(): Promise<ResetSyncResult | null> {
    const latestSync = await this.syncLogRepository.findLatest();

    if (!latestSync) {
      return null;
    }

    // Only allows reset of syncs in progress
    if (!SyncLog.isInProgress(latestSync)) {
      return null;
    }

    const previousStatus = latestSync.status;

    await this.syncLogRepository.update(latestSync.id!, {
      status: SyncStatus.FAILED,
      finishedAt: new Date(),
      errorMessage: 'Sync manually cancelled via API',
    });

    this.logger.warn('Sync manually reset', {
      syncLogId: latestSync.id!,
      previousStatus,
    });

    return {
      syncLogId: latestSync.id!,
      previousStatus,
      message: 'Sync reset successfully',
    };
  }
}
