import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { SyncLog, SyncStatus } from '@/domain/models';
import type { SyncLogRepository } from '@/domain/repositories/sync-log.repository.interface';
import { SYNC_LOG_REPOSITORY } from '@/domain/repositories/sync-log.repository.interface';
import type { ILegacyApiClient, ILogger, LegacyUser } from '@/domain/services';
import { LEGACY_API_CLIENT, LOGGER_SERVICE } from '@/domain/services';
import type { SyncBatchJobData } from './sync-batch.processor';
import {
  SYNC_BATCH_JOB_NAME,
  SYNC_BATCH_QUEUE_NAME,
  SYNC_JOB_NAME,
  SYNC_QUEUE_NAME,
  SYNC_RETRY_DELAY_MS,
} from './sync.constants';

/** Data passed to the sync orchestrator job */
export interface SyncJobData {
  syncLogId: number;
}

/** Result returned by the sync orchestrator job */
export interface SyncJobResult {
  syncLogId: number;
  totalBatches: number;
  totalEnqueued: number;
  status: SyncStatus;
  durationMs: number;
}

/**
 * Sync orchestrator - streams from legacy API and enqueues batch jobs.
 * Coordinates work across multiple batch workers.
 */
@Processor(SYNC_QUEUE_NAME)
export class SyncProcessor extends WorkerHost {
  private readonly batchSize: number;

  constructor(
    @Inject(LEGACY_API_CLIENT)
    private readonly legacyApiClient: ILegacyApiClient,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
    @InjectQueue(SYNC_BATCH_QUEUE_NAME)
    private readonly batchQueue: Queue<SyncBatchJobData>,
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    private readonly configService: ConfigService,
    @Inject(LOGGER_SERVICE)
    private readonly logger: ILogger,
  ) {
    super();
    this.batchSize = this.configService.get<number>('SYNC_BATCH_SIZE', 1000);
  }

  /** Main job processor - orchestrates streaming and batch enqueueing. */
  async process(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { syncLogId } = job.data;
    const startTime = Date.now();
    let totalEnqueued = 0;
    let batchNumber = 0;
    let currentBatch: LegacyUser[] = [];
    let lastProgressUpdate = Date.now();

    this.logger.log('Starting sync job (orchestrator)', {
      syncLogId,
      jobId: job.id,
      batchSize: this.batchSize,
    });

    await this.syncLogRepository.update(syncLogId, {
      status: SyncStatus.RUNNING,
    });

    try {
      const onBatch = async (users: LegacyUser[]): Promise<void> => {
        for (const user of users) {
          currentBatch.push(user);

          if (currentBatch.length >= this.batchSize) {
            totalEnqueued += currentBatch.length;
            await this.enqueueBatch(syncLogId, batchNumber, currentBatch, totalEnqueued);
            batchNumber++;
            currentBatch = [];

            // Updates progress every 10 seconds
            const now = Date.now();
            if (now - lastProgressUpdate > 10000) {
              await this.syncLogRepository.update(syncLogId, {
                totalProcessed: totalEnqueued,
              });
              await job.updateProgress({ totalEnqueued, batchNumber });
              lastProgressUpdate = now;
            }
          }
        }
      };

      // Execute streaming with batch enqueueing
      await this.legacyApiClient.fetchUsersStreaming(onBatch);

      // Enqueue the last batch (if there are remaining records)
      if (currentBatch.length > 0) {
        totalEnqueued += currentBatch.length;
        await this.enqueueBatch(syncLogId, batchNumber, currentBatch, totalEnqueued);
        batchNumber++;
      }

      const durationMs = Date.now() - startTime;

      // Marks as PROCESSING - batches are still being processed
      await this.syncLogRepository.update(syncLogId, {
        status: SyncStatus.PROCESSING,
        totalProcessed: totalEnqueued,
        durationMs,
      });

      this.logger.log('Streaming completed, batches enqueued', {
        syncLogId,
        totalBatches: batchNumber,
        totalEnqueued,
        durationMs,
      });

      return {
        syncLogId,
        totalBatches: batchNumber,
        totalEnqueued,
        status: SyncStatus.PROCESSING,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Streaming error', {
        syncLogId,
        error: errorMessage,
        totalEnqueued,
        durationMs,
      });

      await this.syncLogRepository.update(syncLogId, {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        totalProcessed: totalEnqueued,
        errorMessage,
        durationMs,
      });

      // Schedule retry in background
      this.scheduleRetry(syncLogId, errorMessage).catch((retryError) => {
        this.logger.warn('Failed to schedule retry', {
          syncLogId,
          error: retryError instanceof Error ? retryError.message : 'Unknown error',
        });
      });

      throw error;
    }
  }

  /** Enqueues a batch of users for processing by batch workers. */
  private async enqueueBatch(
    syncLogId: number,
    batchNumber: number,
    users: LegacyUser[],
    totalEnqueued: number,
  ): Promise<void> {
    this.logger.log('Batch enqueued', {
      syncLogId,
      batchNumber,
      usersInBatch: users.length,
      totalEnqueued,
    });

    await this.batchQueue.add(
      SYNC_BATCH_JOB_NAME,
      { syncLogId, batchNumber, users },
      {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  /** Schedules a retry sync after failure (prevents duplicates). */
  private async scheduleRetry(syncLogId: number, reason: string): Promise<void> {
    // Checks if retry is already pending (avoid duplicates)
    const delayed = await this.syncQueue.getDelayed();
    if (delayed.length > 0) {
      this.logger.log('Retry already scheduled, ignoring request', {
        syncLogId,
        existingJobId: delayed[0].id,
      });
      return;
    }

    // Checks if sync is already in progress
    const latestSync = await this.syncLogRepository.findLatest();
    if (SyncLog.isInProgress(latestSync)) {
      this.logger.log('Retry ignored: sync already in progress', {
        currentSyncLogId: latestSync!.id,
      });
      return;
    }

    // Creates new sync log for retry
    const newSyncLog = await this.syncLogRepository.create({
      status: SyncStatus.PENDING,
    });

    await this.syncQueue.add(
      SYNC_JOB_NAME,
      { syncLogId: newSyncLog.id! },
      {
        delay: SYNC_RETRY_DELAY_MS,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log('Retry scheduled', {
      originalSyncLogId: syncLogId,
      newSyncLogId: newSyncLog.id!,
      reason,
      delayMs: SYNC_RETRY_DELAY_MS,
      delayMinutes: SYNC_RETRY_DELAY_MS / 60000,
    });
  }
}
