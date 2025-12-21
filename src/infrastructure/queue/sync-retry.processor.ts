import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_RETRY_QUEUE_NAME } from './sync.constants';
import { LoggerService } from '../logger';
import { SyncService } from '../../application/services';

export interface SyncRetryJobData {
  reason: string;
  originalSyncLogId: number;
  scheduledAt: string;
}

@Processor(SYNC_RETRY_QUEUE_NAME)
export class SyncRetryProcessor extends WorkerHost {
  private readonly logger = new LoggerService(SyncRetryProcessor.name);

  constructor(
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
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
      const result = await this.syncService.triggerSync();

      if (result.alreadyRunning) {
        this.logger.log('Retry ignorado: sync já em andamento', {
          currentSyncLogId: result.syncLogId,
        });
        return;
      }

      this.logger.log('Retry disparou nova sync com sucesso', {
        newSyncLogId: result.syncLogId,
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
