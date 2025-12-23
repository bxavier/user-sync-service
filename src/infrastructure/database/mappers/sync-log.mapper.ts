import { SyncLog } from '../../../domain/models';
import { SyncLogEntity } from '../entities';

/**
 * Data Mapper para SyncLog.
 * Centraliza conversões entre entidade ORM e modelo de domínio.
 * Aplica o padrão Data Mapper e resolve violações de DRY.
 */
export class SyncLogMapper {
  /**
   * Converte entidade ORM para modelo de domínio
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
   * Converte modelo de domínio para dados parciais de entidade ORM
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
