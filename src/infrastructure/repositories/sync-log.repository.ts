import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { SyncLog, SyncStatus } from '../../domain/entities';
import {
  SyncLogRepository,
  CreateSyncLogData,
  UpdateSyncLogData,
} from '../../domain/repositories/sync-log.repository.interface';

@Injectable()
export class SyncLogRepositoryImpl implements SyncLogRepository {
  constructor(
    @InjectRepository(SyncLog)
    private readonly repository: Repository<SyncLog>,
  ) {}

  async create(data: CreateSyncLogData = {}): Promise<SyncLog> {
    const syncLog = this.repository.create({
      status: data.status ?? SyncStatus.PENDING,
      totalProcessed: 0,
    });

    return this.repository.save(syncLog);
  }

  async update(id: number, data: UpdateSyncLogData): Promise<SyncLog | null> {
    const syncLog = await this.findById(id);
    if (!syncLog) {
      return null;
    }

    if (data.status !== undefined) {
      syncLog.status = data.status;
    }
    if (data.finishedAt !== undefined) {
      syncLog.finishedAt = data.finishedAt;
    }
    if (data.totalProcessed !== undefined) {
      syncLog.totalProcessed = data.totalProcessed;
    }
    if (data.errorMessage !== undefined) {
      syncLog.errorMessage = data.errorMessage;
    }
    if (data.durationMs !== undefined) {
      syncLog.durationMs = data.durationMs;
    }

    return this.repository.save(syncLog);
  }

  async findById(id: number): Promise<SyncLog | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findLatest(): Promise<SyncLog | null> {
    const results = await this.repository.find({
      order: { startedAt: 'DESC' },
      take: 1,
    });
    return results[0] ?? null;
  }

  async findAll(limit = 10): Promise<SyncLog[]> {
    return this.repository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async findStaleSyncs(staleThresholdMinutes: number): Promise<SyncLog[]> {
    const thresholdDate = new Date(
      Date.now() - staleThresholdMinutes * 60 * 1000,
    );

    return this.repository.find({
      where: {
        status: In([
          SyncStatus.PENDING,
          SyncStatus.RUNNING,
          SyncStatus.PROCESSING,
        ]),
        startedAt: LessThan(thresholdDate),
      },
      order: { startedAt: 'DESC' },
    });
  }

  async markStaleAsFailed(
    staleThresholdMinutes: number,
    errorMessage: string,
  ): Promise<number> {
    const staleSyncs = await this.findStaleSyncs(staleThresholdMinutes);

    for (const sync of staleSyncs) {
      await this.update(sync.id, {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage,
      });
    }

    return staleSyncs.length;
  }
}
