import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { SyncLog, SyncStatus } from '../../domain/models';
import { SyncLogEntity } from '../database/entities';
import { SyncLogMapper } from '../database/mappers';
import {
  SyncLogRepository,
  CreateSyncLogData,
  UpdateSyncLogData,
} from '../../domain/repositories/sync-log.repository.interface';

@Injectable()
export class SyncLogRepositoryImpl implements SyncLogRepository {
  constructor(
    @InjectRepository(SyncLogEntity)
    private readonly repository: Repository<SyncLogEntity>,
  ) {}

  async create(data: CreateSyncLogData = {}): Promise<SyncLog> {
    const entity = this.repository.create({
      status: data.status ?? SyncStatus.PENDING,
      totalProcessed: 0,
    });

    const savedEntity = await this.repository.save(entity);
    return SyncLogMapper.toDomain(savedEntity);
  }

  async update(id: number, data: UpdateSyncLogData): Promise<SyncLog | null> {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      return null;
    }

    if (data.status !== undefined) {
      entity.status = data.status;
    }
    if (data.finishedAt !== undefined) {
      entity.finishedAt = data.finishedAt;
    }
    if (data.totalProcessed !== undefined) {
      entity.totalProcessed = data.totalProcessed;
    }
    if (data.errorMessage !== undefined) {
      entity.errorMessage = data.errorMessage;
    }
    if (data.durationMs !== undefined) {
      entity.durationMs = data.durationMs;
    }

    const savedEntity = await this.repository.save(entity);
    return SyncLogMapper.toDomain(savedEntity);
  }

  async findById(id: number): Promise<SyncLog | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? SyncLogMapper.toDomain(entity) : null;
  }

  async findLatest(): Promise<SyncLog | null> {
    const results = await this.repository.find({
      order: { startedAt: 'DESC' },
      take: 1,
    });
    return results[0] ? SyncLogMapper.toDomain(results[0]) : null;
  }

  async findAll(limit = 10): Promise<SyncLog[]> {
    const entities = await this.repository.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
    return entities.map((entity) => SyncLogMapper.toDomain(entity));
  }

  async findStaleSyncs(staleThresholdMinutes: number): Promise<SyncLog[]> {
    const thresholdDate = new Date(
      Date.now() - staleThresholdMinutes * 60 * 1000,
    );

    const entities = await this.repository.find({
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

    return entities.map((entity) => SyncLogMapper.toDomain(entity));
  }

  async markStaleAsFailed(
    staleThresholdMinutes: number,
    errorMessage: string,
  ): Promise<number> {
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
