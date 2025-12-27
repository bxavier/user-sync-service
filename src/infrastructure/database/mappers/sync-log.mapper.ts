import { SyncLog } from '@/domain/models';
import { SyncLogEntity } from '@/infrastructure/database/entities';

/** Data Mapper: converts between ORM Entity and Domain Model. */
export class SyncLogMapper {
  /**
   * Converts ORM entity to domain model.
   * @param entity - TypeORM entity from database
   * @returns Pure domain model instance
   */
  static toDomain(entity: SyncLogEntity): SyncLog {
    return new SyncLog({
      id: entity.id,
      status: entity.status,
      startedAt: entity.startedAt,
      finishedAt: entity.finishedAt,
      totalProcessed: entity.totalProcessed,
      errorMessage: entity.errorMessage,
      durationMs: entity.durationMs,
    });
  }

  /**
   * Converts domain model to partial ORM entity.
   * @param model - Domain model instance
   * @returns Partial entity data for persistence
   */
  static toEntity(model: SyncLog): Partial<SyncLogEntity> {
    return {
      status: model.status,
      finishedAt: model.finishedAt,
      totalProcessed: model.totalProcessed,
      errorMessage: model.errorMessage,
      durationMs: model.durationMs,
    };
  }
}
