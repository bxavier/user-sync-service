import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import {
  SYNC_QUEUE_NAME,
  SYNC_BATCH_QUEUE_NAME,
  SYNC_BATCH_JOB_NAME,
  SYNC_JOB_NAME,
  SYNC_RETRY_DELAY_MS,
} from './sync.constants';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncLog, SyncStatus } from '../../domain/models';
import {
  LEGACY_API_CLIENT,
  LOGGER_SERVICE,
} from '../../domain/services';
import type { ILegacyApiClient, LegacyUser, ILogger } from '../../domain/services';
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

            // Atualiza progresso a cada 10 segundos
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

      // Executa streaming com enfileiramento de batches
      await this.legacyApiClient.fetchUsersStreaming(onBatch);

      // Enfileira o último batch (se houver registros restantes)
      if (currentBatch.length > 0) {
        totalEnqueued += currentBatch.length;
        await this.enqueueBatch(syncLogId, batchNumber, currentBatch, totalEnqueued);
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

      // Agenda retry em background
      this.scheduleRetry(syncLogId, errorMessage).catch((retryError) => {
        this.logger.warn('Falha ao agendar retry', {
          syncLogId,
          error:
            retryError instanceof Error
              ? retryError.message
              : 'Unknown error',
        });
      });

      throw error;
    }
  }

  private async enqueueBatch(
    syncLogId: number,
    batchNumber: number,
    users: LegacyUser[],
    totalEnqueued: number,
  ): Promise<void> {
    this.logger.log('Batch enfileirado', {
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

  private async scheduleRetry(
    syncLogId: number,
    reason: string,
  ): Promise<void> {
    // Verifica se já existe retry pendente (evita duplicatas)
    const delayed = await this.syncQueue.getDelayed();
    if (delayed.length > 0) {
      this.logger.log('Retry já agendado, ignorando nova solicitação', {
        syncLogId,
        existingJobId: delayed[0].id,
      });
      return;
    }

    // Verifica se já existe sync em andamento
    const latestSync = await this.syncLogRepository.findLatest();
    if (SyncLog.isInProgress(latestSync)) {
      this.logger.log('Retry ignorado: sync já em andamento', {
        currentSyncLogId: latestSync!.id,
      });
      return;
    }

    // Cria novo sync log para o retry
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

    this.logger.log('Retry agendado', {
      originalSyncLogId: syncLogId,
      newSyncLogId: newSyncLog.id!,
      reason,
      delayMs: SYNC_RETRY_DELAY_MS,
      delayMinutes: SYNC_RETRY_DELAY_MS / 60000,
    });
  }
}
