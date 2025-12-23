import { User } from '../../../domain/models';
import { UserEntity } from '../entities';
import type { LegacyUser } from '../../../domain/services';
import type { UpsertUserData } from '../../../domain/repositories';

/**
 * Data Mapper para User.
 * Centraliza conversões entre entidade ORM, modelo de domínio e dados externos.
 * Aplica o padrão Data Mapper e resolve violações de DRY.
 */
export class UserMapper {
  /**
   * Converte entidade ORM para modelo de domínio
   */
  static toDomain(entity: UserEntity): User {
    return new User({
      id: entity.id,
      legacyId: entity.legacyId,
      userName: entity.userName,
      email: entity.email,
      legacyCreatedAt: entity.legacyCreatedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deleted: entity.deleted,
      deletedAt: entity.deletedAt,
    });
  }

  /**
   * Converte modelo de domínio para dados parciais de entidade ORM
   */
  static toEntity(model: User): Partial<UserEntity> {
    return {
      legacyId: model.legacyId,
      userName: model.userName,
      email: model.email,
      legacyCreatedAt: model.legacyCreatedAt,
      deleted: model.deleted,
      deletedAt: model.deletedAt,
    };
  }

  /**
   * Converte dados do sistema legado para formato de upsert
   */
  static fromLegacy(legacy: LegacyUser): UpsertUserData {
    return {
      legacyId: legacy.id,
      userName: legacy.userName,
      email: legacy.email,
      legacyCreatedAt: new Date(legacy.createdAt),
      deleted: legacy.deleted,
    };
  }

  /**
   * Converte array de dados do sistema legado para formato de upsert
   */
  static fromLegacyBatch(legacyUsers: LegacyUser[]): UpsertUserData[] {
    return legacyUsers.map((user) => UserMapper.fromLegacy(user));
  }
}
