import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '../../infrastructure/logger';
import { SYNC_QUEUE_NAME, SYNC_JOB_NAME } from '../../infrastructure/queue';
import type { SyncJobData } from '../../infrastructure/queue';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncLog, SyncStatus } from '../../domain/entities';
import type { SyncStatusDto } from '../dtos';

export interface TriggerSyncResult {
  syncLogId: number;
  message: string;
  alreadyRunning: boolean;
}

export interface ResetSyncResult {
  syncLogId: number;
  previousStatus: SyncStatus;
  message: string;
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new LoggerService(SyncService.name);
  private readonly batchSize: number;
  private readonly workerConcurrency: number;
  private readonly staleSyncThresholdMinutes: number;
  private readonly estimatedTotalRecords: number;

  constructor(
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('SYNC_BATCH_SIZE', 1000);
    this.workerConcurrency = this.configService.get<number>(
      'SYNC_WORKER_CONCURRENCY',
      1,
    );
    this.staleSyncThresholdMinutes = this.configService.get<number>(
      'SYNC_STALE_THRESHOLD_MINUTES',
      30,
    );
    this.estimatedTotalRecords = this.configService.get<number>(
      'SYNC_ESTIMATED_TOTAL_RECORDS',
      1_000_000,
    );
  }

  /**
   * Recovery no startup: marca syncs órfãs como FAILED
   * (Se a aplicação reiniciou, qualquer sync em andamento foi interrompida)
   */
  async onModuleInit(): Promise<void> {
    const orphanedCount = await this.syncLogRepository.markStaleAsFailed(
      0, // Qualquer sync em andamento é considerada órfã no startup
      'Sync interrompida: aplicação reiniciada',
    );

    if (orphanedCount > 0) {
      this.logger.warn('Syncs órfãs marcadas como FAILED no startup', {
        count: orphanedCount,
      });
    }
  }

  async triggerSync(): Promise<TriggerSyncResult> {
    // Primeiro, verifica e marca syncs travadas como FAILED (timeout automático)
    const staleCount = await this.syncLogRepository.markStaleAsFailed(
      this.staleSyncThresholdMinutes,
      `Sync travada: timeout após ${this.staleSyncThresholdMinutes} minutos`,
    );

    if (staleCount > 0) {
      this.logger.warn('Syncs travadas marcadas como FAILED', {
        count: staleCount,
        thresholdMinutes: this.staleSyncThresholdMinutes,
      });
    }

    const latestSync = await this.syncLogRepository.findLatest();

    if (SyncLog.isInProgress(latestSync)) {
      this.logger.log('Sincronização já em andamento', {
        syncLogId: latestSync!.id,
        status: latestSync!.status,
      });

      return {
        syncLogId: latestSync!.id,
        message: 'Sincronização já em andamento',
        alreadyRunning: true,
      };
    }

    const syncLog = await this.syncLogRepository.create({
      status: SyncStatus.PENDING,
    });

    this.logger.log('Enfileirando job de sincronização', {
      syncLogId: syncLog.id,
    });

    await this.syncQueue.add(
      SYNC_JOB_NAME,
      { syncLogId: syncLog.id },
      {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return {
      syncLogId: syncLog.id,
      message: 'Sincronização iniciada',
      alreadyRunning: false,
    };
  }

  async getLatestSync(): Promise<SyncLog | null> {
    return this.syncLogRepository.findLatest();
  }

  async getLatestSyncStatus(): Promise<SyncStatusDto | null> {
    const syncLog = await this.syncLogRepository.findLatest();
    if (!syncLog) return null;

    const now = Date.now();
    const startTime = new Date(syncLog.startedAt).getTime();
    const elapsedMs = syncLog.durationMs ?? now - startTime;
    const elapsedSeconds = elapsedMs / 1000;

    const recordsPerSecond =
      elapsedSeconds > 0
        ? Math.round((syncLog.totalProcessed / elapsedSeconds) * 10) / 10
        : null;

    const progressPercent =
      syncLog.status === SyncStatus.COMPLETED
        ? 100
        : Math.min(
            Math.round(
              (syncLog.totalProcessed / this.estimatedTotalRecords) * 1000,
            ) / 10,
            99.9,
          );

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
      id: syncLog.id,
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

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  async getSyncHistory(limit: number = 10): Promise<SyncLog[]> {
    return this.syncLogRepository.findAll(limit);
  }

  @Cron(CronExpression.EVERY_6_HOURS) // A cada 6 horas
  async handleScheduledSync(): Promise<void> {
    this.logger.log('Executando sincronização agendada');
    await this.triggerSync();
  }

  /**
   * Reset manual: força a sync atual (se travada) a ser marcada como FAILED
   */
  async resetCurrentSync(): Promise<ResetSyncResult | null> {
    const latestSync = await this.syncLogRepository.findLatest();

    if (!latestSync) {
      return null;
    }

    // Só permite reset de syncs em andamento
    if (!SyncLog.isInProgress(latestSync)) {
      return null;
    }

    const previousStatus = latestSync.status;

    await this.syncLogRepository.update(latestSync.id, {
      status: SyncStatus.FAILED,
      finishedAt: new Date(),
      errorMessage: 'Sync cancelada manualmente via API',
    });

    this.logger.warn('Sync resetada manualmente', {
      syncLogId: latestSync.id,
      previousStatus,
    });

    return {
      syncLogId: latestSync.id,
      previousStatus,
      message: 'Sincronização resetada com sucesso',
    };
  }
}
