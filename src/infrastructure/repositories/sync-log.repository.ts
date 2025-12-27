import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { SyncLog, SyncStatus } from '@/domain/models';
import {
  CreateSyncLogData,
  SyncLogRepository,
  UpdateSyncLogData,
} from '@/domain/repositories/sync-log.repository.interface';
import { SyncLogEntity } from '@/infrastructure/database/entities';
import { SyncLogMapper } from '@/infrastructure/database/mappers';

/** TypeORM implementation of SyncLogRepository. */
@Injectable()
export class TypeOrmSyncLogRepository implements SyncLogRepository {
  constructor(
    @InjectRepository(SyncLogEntity)
    private readonly repository: Repository<SyncLogEntity>,
  ) {}

  /** Creates a new sync log entry. */
  async create(data: CreateSyncLogData = {}): Promise<SyncLog> {
    const entity = this.repository.create({
      status: data.status ?? SyncStatus.PENDING,
      totalProcessed: 0,
    });

    const savedEntity = await this.repository.save(entity);
    return SyncLogMapper.toDomain(savedEntity);
  }

  /** Updates sync log fields. Returns null if not found. */
  async update(id: number, data: UpdateSyncLogData): Promise<SyncLog | null> {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      return null;
    }

    entity.status = data.status ?? entity.status;
    entity.finishedAt = data.finishedAt ?? entity.finishedAt;
    entity.totalProcessed = data.totalProcessed ?? entity.totalProcessed;
    entity.errorMessage = data.errorMessage ?? entity.errorMessage;
    entity.durationMs = data.durationMs ?? entity.durationMs;

    const savedEntity = await this.repository.save(entity);
    return SyncLogMapper.toDomain(savedEntity);
  }

  /** Finds sync log by ID. */
  async findById(id: number): Promise<SyncLog | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? SyncLogMapper.toDomain(entity) : null;
  }

  /** Returns the most recent sync log. */
  async findLatest(): Promise<SyncLog | null> {
    const results = await this.repository.find({
      order: { startedAt: 'DESC' },
      take: 1,
    });
    return results[0] ? SyncLogMapper.toDomain(results[0]) : null;
  }

  /** Returns sync log history, ordered by most recent first. */
  async findAll(limit = 10): Promise<SyncLog[]> {
    const entities = await this.repository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
    return entities.map((entity) => SyncLogMapper.toDomain(entity));
  }

  /** Finds syncs running longer than threshold (for recovery). */
  async findStaleSyncs(staleThresholdMinutes: number): Promise<SyncLog[]> {
    const thresholdDate = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

    const entities = await this.repository.find({
      where: {
        status: In([SyncStatus.PENDING, SyncStatus.RUNNING, SyncStatus.PROCESSING]),
        startedAt: LessThan(thresholdDate),
      },
      order: { startedAt: 'DESC' },
    });

    return entities.map((entity) => SyncLogMapper.toDomain(entity));
  }

  /** Marks stale syncs as FAILED. Returns count of affected records. */
  async markStaleAsFailed(staleThresholdMinutes: number, errorMessage: string): Promise<number> {
    const staleSyncs = await this.findStaleSyncs(staleThresholdMinutes);

    for (const sync of staleSyncs) {
      await this.update(sync.id!, {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage,
      });
    }

    return staleSyncs.length;
  }
}
