import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE_NAME } from './sync.constants';
import { LoggerService } from '../logger';
import { LegacyApiClient } from '../legacy';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncStatus } from '../../domain/entities';

export interface SyncJobData {
  syncLogId: number;
}

export interface SyncJobResult {
  syncLogId: number;
  totalProcessed: number;
  status: SyncStatus;
  durationMs: number;
}

@Processor(SYNC_QUEUE_NAME)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new LoggerService(SyncProcessor.name);

  constructor(
    private readonly legacyApiClient: LegacyApiClient,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const { syncLogId } = job.data;
    const startTime = Date.now();

    this.logger.log('Iniciando job de sincronização', { syncLogId, jobId: job.id });

    await this.syncLogRepository.update(syncLogId, {
      status: SyncStatus.RUNNING,
    });

    try {
      const parseResult = await this.legacyApiClient.fetchUsers();

      this.logger.log('Dados recebidos do legado', {
        totalUsers: parseResult.users.length,
        errors: parseResult.errors.length,
      });

      let processedCount = 0;

      for (const legacyUser of parseResult.users) {
        try {
          await this.userRepository.upsertByLegacyId({
            legacyId: legacyUser.id,
            userName: legacyUser.userName,
            email: legacyUser.email,
            legacyCreatedAt: new Date(legacyUser.createdAt),
            deleted: legacyUser.deleted,
          });
          processedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn('Erro ao processar usuário', {
            legacyId: legacyUser.id,
            userName: legacyUser.userName,
            error: errorMessage,
          });
        }
      }

      const durationMs = Date.now() - startTime;

      await this.syncLogRepository.update(syncLogId, {
        status: SyncStatus.COMPLETED,
        finishedAt: new Date(),
        totalProcessed: processedCount,
        durationMs,
      });

      this.logger.log('Sincronização concluída', {
        syncLogId,
        totalProcessed: processedCount,
        durationMs,
      });

      return {
        syncLogId,
        totalProcessed: processedCount,
        status: SyncStatus.COMPLETED,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Erro na sincronização', {
        syncLogId,
        error: errorMessage,
        durationMs,
      });

      await this.syncLogRepository.update(syncLogId, {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage,
        durationMs,
      });

      throw error;
    }
  }
}
