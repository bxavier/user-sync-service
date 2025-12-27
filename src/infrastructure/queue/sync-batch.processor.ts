import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import type { UserRepository } from '@/domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from '@/domain/repositories/user.repository.interface';
import type { ILogger, LegacyUser } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import { UserMapper } from '@/infrastructure/database/mappers';
import { SYNC_BATCH_QUEUE_NAME } from './sync.constants';

/** Data passed to each batch processing job */
export interface SyncBatchJobData {
  syncLogId: number;
  batchNumber: number;
  users: LegacyUser[];
}

/** Result returned by each batch processing job */
export interface SyncBatchJobResult {
  syncLogId: number;
  batchNumber: number;
  processedCount: number;
  durationMs: number;
}

/**
 * Batch worker - converts legacy users and performs bulk upsert.
 * Runs with configurable concurrency for parallel processing.
 */
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

  /** Configures worker concurrency on startup. */
  onModuleInit() {
    const concurrency = this.configService.get<number>('SYNC_BATCH_CONCURRENCY', 5);
    this.worker.concurrency = concurrency;
    this.logger.log(`Batch processor configured with concurrency: ${concurrency}`);
  }

  /** Processes a single batch - converts legacy format and bulk upserts. */
  async process(job: Job<SyncBatchJobData>): Promise<SyncBatchJobResult> {
    const { syncLogId, batchNumber, users } = job.data;
    const startTime = Date.now();

    this.logger.log('Processing batch', {
      syncLogId,
      batchNumber,
      usersCount: users.length,
      jobId: job.id,
    });

    try {
      // Uses UserMapper to convert legacy data (DRY)
      const upsertData = UserMapper.fromLegacyBatch(users);

      await this.userRepository.bulkUpsertByUserName(upsertData);

      const durationMs = Date.now() - startTime;

      this.logger.log('Batch processed successfully', {
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Error processing batch', {
        syncLogId,
        batchNumber,
        error: errorMessage,
      });

      throw error;
    }
  }
}
