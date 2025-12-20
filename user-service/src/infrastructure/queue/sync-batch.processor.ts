import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_BATCH_QUEUE_NAME, WORKER_CONCURRENCY } from './sync.constants';
import { LoggerService } from '../logger';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';

export interface SyncBatchJobData {
  syncLogId: number;
  batchNumber: number;
  users: Array<{
    id: number;
    userName: string;
    email: string;
    createdAt: string;
    deleted: boolean;
  }>;
}

export interface SyncBatchJobResult {
  syncLogId: number;
  batchNumber: number;
  processedCount: number;
  durationMs: number;
}

@Processor(SYNC_BATCH_QUEUE_NAME, {
  concurrency: WORKER_CONCURRENCY,
})
export class SyncBatchProcessor extends WorkerHost {
  private readonly logger = new LoggerService(SyncBatchProcessor.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {
    super();
  }

  async process(job: Job<SyncBatchJobData>): Promise<SyncBatchJobResult> {
    const { syncLogId, batchNumber, users } = job.data;
    const startTime = Date.now();

    this.logger.log('Processando batch', {
      syncLogId,
      batchNumber,
      usersCount: users.length,
      jobId: job.id,
    });

    try {
      const upsertData = users.map((user) => ({
        legacyId: user.id,
        userName: user.userName,
        email: user.email,
        legacyCreatedAt: new Date(user.createdAt),
        deleted: user.deleted,
      }));

      await this.userRepository.bulkUpsertByUserName(upsertData);

      const durationMs = Date.now() - startTime;

      this.logger.log('Batch processado com sucesso', {
        syncLogId,
        batchNumber,
        processedCount: users.length,
        durationMs,
      });

      return {
        syncLogId,
        batchNumber,
        processedCount: users.length,
        durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Erro ao processar batch', {
        syncLogId,
        batchNumber,
        error: errorMessage,
      });

      throw error;
    }
  }
}
