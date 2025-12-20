import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '../../infrastructure/logger';
import {
  SYNC_QUEUE_NAME,
  SYNC_JOB_NAME,
} from '../../infrastructure/queue';
import type { SyncJobData } from '../../infrastructure/queue';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';
import { SyncLog, SyncStatus } from '../../domain/entities';

export interface TriggerSyncResult {
  syncLogId: number;
  message: string;
  alreadyRunning: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new LoggerService(SyncService.name);

  constructor(
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
  ) {}

  async triggerSync(): Promise<TriggerSyncResult> {
    const latestSync = await this.syncLogRepository.findLatest();

    if (
      latestSync &&
      (latestSync.status === SyncStatus.PENDING ||
        latestSync.status === SyncStatus.RUNNING)
    ) {
      this.logger.log('Sincronização já em andamento', {
        syncLogId: latestSync.id,
        status: latestSync.status,
      });

      return {
        syncLogId: latestSync.id,
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

  async getSyncHistory(limit: number = 10): Promise<SyncLog[]> {
    return this.syncLogRepository.findAll(limit);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledSync(): Promise<void> {
    this.logger.log('Executando sincronização agendada');
    await this.triggerSync();
  }
}
