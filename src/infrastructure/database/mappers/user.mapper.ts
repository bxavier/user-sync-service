import { User } from '@/domain/models';
import type { UpsertUserData } from '@/domain/repositories';
import type { LegacyUser } from '@/domain/services';
import { UserEntity } from '@/infrastructure/database/entities';

/** Data Mapper: converts between ORM Entity, Domain Model, and Legacy format. */
export class UserMapper {
  /**
   * Converts ORM entity to domain model.
   * @param entity - TypeORM entity from database
   * @returns Pure domain model instance
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
   * Converts domain model to partial ORM entity.
   * @param model - Domain model instance
   * @returns Partial entity data for persistence
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
   * Converts legacy user to upsert format (string dates → Date objects).
   * @param legacy - User data from legacy API
   * @returns Data ready for bulk upsert
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
   * Batch version of fromLegacy.
   * @param legacyUsers - Array of users from legacy API
   * @returns Array of data ready for bulk upsert
   */
  static fromLegacyBatch(legacyUsers: LegacyUser[]): UpsertUserData[] {
    return legacyUsers.map((user) => UserMapper.fromLegacy(user));
  }
}
