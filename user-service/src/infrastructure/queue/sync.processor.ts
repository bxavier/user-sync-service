import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  SYNC_QUEUE_NAME,
  SYNC_BATCH_QUEUE_NAME,
  SYNC_BATCH_JOB_NAME,
  BATCH_SIZE,
} from './sync.constants';
import { LoggerService } from '../logger';
import { LegacyApiClient } from '../legacy';
import type { LegacyUser } from '../legacy';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncStatus } from '../../domain/entities';
import type { SyncBatchJobData } from './sync-batch.processor';

export interface SyncJobData {
  syncLogId: number;
}

export interface SyncJobResult {
  syncLogId: number;
  totalBatches: number;
  totalEnqueued: number;
  status: SyncStatus;
  durationMs: number;
}

@Processor(SYNC_QUEUE_NAME)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new LoggerService(SyncProcessor.name);

  constructor(
    private readonly legacyApiClient: LegacyApiClient,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
    @InjectQueue(SYNC_BATCH_QUEUE_NAME)
    private readonly batchQueue: Queue<SyncBatchJobData>,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { syncLogId } = job.data;
    const startTime = Date.now();
    let totalEnqueued = 0;
    let batchNumber = 0;
    let currentBatch: LegacyUser[] = [];
    let lastProgressUpdate = Date.now();

    this.logger.log('Iniciando job de sincronização (orquestrador)', {
      syncLogId,
      jobId: job.id,
      batchSize: BATCH_SIZE,
    });

    await this.syncLogRepository.update(syncLogId, {
      status: SyncStatus.RUNNING,
    });

    try {
      // Callback chamado para cada batch de usuários recebido via streaming
      const onBatch = async (users: LegacyUser[]): Promise<void> => {
        for (const user of users) {
          currentBatch.push(user);

          // Quando atingir BATCH_SIZE, enfileira o batch
          if (currentBatch.length >= BATCH_SIZE) {
            await this.enqueueBatch(syncLogId, batchNumber, currentBatch);
            totalEnqueued += currentBatch.length;
            batchNumber++;
            currentBatch = [];

            // Atualiza progresso a cada 10 segundos
            const now = Date.now();
            if (now - lastProgressUpdate > 10000) {
              await this.syncLogRepository.update(syncLogId, {
                totalProcessed: totalEnqueued,
              });
              await job.updateProgress({ totalEnqueued, batchNumber });
              this.logger.log('Progresso do streaming', {
                syncLogId,
                totalEnqueued,
                batchNumber,
              });
              lastProgressUpdate = now;
            }
          }
        }
      };

      // Executa streaming com enfileiramento de batches
      await this.legacyApiClient.fetchUsersStreaming(onBatch);

      // Enfileira o último batch (se houver registros restantes)
      if (currentBatch.length > 0) {
        await this.enqueueBatch(syncLogId, batchNumber, currentBatch);
        totalEnqueued += currentBatch.length;
        batchNumber++;
      }

      const durationMs = Date.now() - startTime;

      // Marca como PROCESSING - os batches ainda estão sendo processados
      await this.syncLogRepository.update(syncLogId, {
        status: SyncStatus.PROCESSING,
        totalProcessed: totalEnqueued,
        durationMs,
      });

      this.logger.log('Streaming concluído, batches enfileirados', {
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Erro no streaming', {
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

      throw error;
    }
  }

  private async enqueueBatch(
    syncLogId: number,
    batchNumber: number,
    users: LegacyUser[],
  ): Promise<void> {
    const jobData: SyncBatchJobData = {
      syncLogId,
      batchNumber,
      users: users.map((u) => ({
        id: u.id,
        userName: u.userName,
        email: u.email,
        createdAt: u.createdAt,
        deleted: u.deleted,
      })),
    };

    await this.batchQueue.add(SYNC_BATCH_JOB_NAME, jobData, {
      removeOnComplete: 100,
      removeOnFail: 1000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    this.logger.debug('Batch enfileirado', {
      syncLogId,
      batchNumber,
      usersCount: users.length,
    });
  }
}
