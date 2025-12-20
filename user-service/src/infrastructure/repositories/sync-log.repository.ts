import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    return this.repository.findOne({
      order: { startedAt: 'DESC' },
    });
  }

  async findAll(limit = 10): Promise<SyncLog[]> {
    return this.repository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }
}
