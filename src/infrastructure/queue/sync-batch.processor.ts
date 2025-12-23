import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { SYNC_BATCH_QUEUE_NAME } from './sync.constants';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { LOGGER_SERVICE } from '../../domain/services';
import type { ILogger } from '../../domain/services';
import { UserMapper } from '../database/mappers';
import type { LegacyUser } from '../../domain/services';

export interface SyncBatchJobData {
  syncLogId: number;
  batchNumber: number;
  users: LegacyUser[];
}

export interface SyncBatchJobResult {
  syncLogId: number;
  batchNumber: number;
  processedCount: number;
  durationMs: number;
}

@Processor(SYNC_BATCH_QUEUE_NAME)
export class SyncBatchProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
    @Inject(LOGGER_SERVICE)
    private readonly logger: ILogger,
  ) {
    super();
  }

  onModuleInit() {
    const concurrency = this.configService.get<number>(
      'SYNC_BATCH_CONCURRENCY',
      5,
    );
    this.worker.concurrency = concurrency;
    this.logger.log(`Batch processor configurado com concurrency: ${concurrency}`);
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
      // Usa o UserMapper para converter dados do legado (DRY)
      const upsertData = UserMapper.fromLegacyBatch(users);

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
