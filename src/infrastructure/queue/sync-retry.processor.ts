import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { SYNC_RETRY_QUEUE_NAME, SYNC_QUEUE_NAME, SYNC_JOB_NAME } from './sync.constants';
import type { SyncJobData } from './sync.processor';
import { LoggerService } from '../logger';
import { Inject } from '@nestjs/common';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncLog, SyncStatus } from '../../domain/entities';

export interface SyncRetryJobData {
  reason: string;
  originalSyncLogId: number;
  scheduledAt: string;
}

@Processor(SYNC_RETRY_QUEUE_NAME)
export class SyncRetryProcessor extends WorkerHost {
  private readonly logger = new LoggerService(SyncRetryProcessor.name);

  constructor(
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
  ) {
    super();
  }

  async process(job: Job<SyncRetryJobData>): Promise<void> {
    const { reason, originalSyncLogId } = job.data;

    this.logger.log('Processando retry de sync', {
      jobId: job.id,
      reason,
      originalSyncLogId,
    });

    try {
      // Verifica se já existe sync em andamento
      const latestSync = await this.syncLogRepository.findLatest();

      if (SyncLog.isInProgress(latestSync)) {
        this.logger.log('Retry ignorado: sync já em andamento', {
          currentSyncLogId: latestSync!.id,
        });
        return;
      }

      // Cria novo sync log
      const syncLog = await this.syncLogRepository.create({
        status: SyncStatus.PENDING,
      });

      // Enfileira job de sync diretamente
      await this.syncQueue.add(
        SYNC_JOB_NAME,
        { syncLogId: syncLog.id },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      this.logger.log('Retry disparou nova sync com sucesso', {
        newSyncLogId: syncLog.id,
        originalSyncLogId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Erro ao processar retry de sync', {
        error: errorMessage,
        originalSyncLogId,
      });

      throw error;
    }
  }
}
