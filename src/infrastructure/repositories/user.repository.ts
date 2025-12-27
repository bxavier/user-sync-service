import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '@/domain/models';
import {
  CreateUserData,
  ExportFilters,
  FindAllOptions,
  FindAllResult,
  UpdateUserData,
  UpsertUserData,
  UserRepository,
} from '@/domain/repositories/user.repository.interface';
import { UserEntity } from '@/infrastructure/database/entities';
import { UserMapper } from '@/infrastructure/database/mappers';

/**
 * TypeORM implementation of UserRepository.
 * All read operations filter out soft-deleted users by default.
 */
@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Returns paginated users with total count. */
  async findAll(options: FindAllOptions = {}): Promise<FindAllResult> {
    const { page = 1, limit = 10, includeDeleted = false } = options;
    const skip = (page - 1) * limit;

    const where = includeDeleted ? {} : { deleted: false };

    const [entities, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      users: entities.map((entity) => UserMapper.toDomain(entity)),
      total,
    };
  }

  /** Finds user by internal ID (excludes deleted). */
  async findById(id: number): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { id, deleted: false },
    });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  /** Finds user by userName (excludes deleted). */
  async findByUserName(userName: string): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { userName, deleted: false },
    });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  /** Creates a new user. */
  async create(data: CreateUserData): Promise<User> {
    const entity = this.repository.create({
      userName: data.userName,
      email: data.email,
      legacyId: data.legacyId ?? null,
      legacyCreatedAt: data.legacyCreatedAt ?? null,
      deleted: false,
    });

    const savedEntity = await this.repository.save(entity);
    return UserMapper.toDomain(savedEntity);
  }

  /** Updates user fields. Returns null if not found. */
  async update(id: number, data: UpdateUserData): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { id, deleted: false },
    });

    if (!entity) {
      return null;
    }

    entity.userName = data.userName ?? entity.userName;
    entity.email = data.email ?? entity.email;

    const savedEntity = await this.repository.save(entity);
    return UserMapper.toDomain(savedEntity);
  }

  /** Soft deletes a user (sets deleted=true). */
  async softDelete(id: number): Promise<boolean> {
    const entity = await this.repository.findOne({
      where: { id, deleted: false },
    });

    if (!entity) {
      return false;
    }

    entity.deleted = true;
    entity.deletedAt = new Date();
    await this.repository.save(entity);

    return true;
  }

  /** Upserts by legacyId. Only updates if legacy record is newer. */
  async upsertByLegacyId(data: UpsertUserData): Promise<User> {
    const existing = await this.repository.findOne({
      where: { legacyId: data.legacyId },
    });

    if (existing) {
      // Update only if legacy record is more recent
      if (data.legacyCreatedAt > (existing.legacyCreatedAt ?? new Date(0))) {
        existing.userName = data.userName;
        existing.email = data.email;
        existing.legacyCreatedAt = data.legacyCreatedAt;
        existing.deleted = data.deleted;
        if (data.deleted) {
          existing.deletedAt = new Date();
        }
        const savedEntity = await this.repository.save(existing);
        return UserMapper.toDomain(savedEntity);
      }
      return UserMapper.toDomain(existing);
    }

    const entity = this.repository.create({
      legacyId: data.legacyId,
      userName: data.userName,
      email: data.email,
      legacyCreatedAt: data.legacyCreatedAt,
      deleted: data.deleted,
      deletedAt: data.deleted ? new Date() : null,
    });

    const savedEntity = await this.repository.save(entity);
    return UserMapper.toDomain(savedEntity);
  }

  /** Bulk upserts by userName using raw SQL. Chunks data for SQLite limits. */
  async bulkUpsertByUserName(data: UpsertUserData[]): Promise<number> {
    if (data.length === 0) return 0;

    // SQLite SQLITE_MAX_VARIABLE_NUMBER default = 999, with 8 fields = 124 max
    const CHUNK_SIZE = 124;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      await this.upsertChunk(data.slice(i, i + CHUNK_SIZE));
    }

    return data.length;
  }

  /** @internal Upserts a single chunk using raw SQL. */
  private async upsertChunk(chunk: UpsertUserData[]): Promise<void> {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    const now = new Date().toISOString();

    for (const item of chunk) {
      placeholders.push(`(?, ?, ?, ?, ?, ?, ?, ?)`);
      values.push(
        item.legacyId,
        item.userName,
        item.email,
        item.legacyCreatedAt.toISOString(),
        now, // created_at
        now, // updated_at
        item.deleted ? 1 : 0,
        item.deleted ? now : null,
      );
    }

    const sql = `
      INSERT INTO "users" ("legacy_id", "user_name", "email", "legacy_created_at", "created_at", "updated_at", "deleted", "deleted_at")
      VALUES ${placeholders.join(', ')}
      ON CONFLICT ("user_name") DO UPDATE SET
        "legacy_id" = excluded."legacy_id",
        "email" = excluded."email",
        "legacy_created_at" = excluded."legacy_created_at",
        "updated_at" = excluded."updated_at",
        "deleted" = excluded."deleted",
        "deleted_at" = excluded."deleted_at"
      WHERE excluded."legacy_created_at" > "users"."legacy_created_at"
         OR "users"."legacy_created_at" IS NULL
    `;

    await this.dataSource.query(sql, values);
  }

  /** Streams users for export using cursor-based pagination. */
  async *findAllForExport(filters: ExportFilters = {}): AsyncGenerator<User, void, unknown> {
    const batchSize = 1000;
    let lastId = 0;

    while (true) {
      const qb = this.repository
        .createQueryBuilder('user')
        .where('user.deleted = :deleted', { deleted: false })
        .andWhere('user.id > :lastId', { lastId });

      if (filters.createdFrom) {
        qb.andWhere('user.createdAt >= :createdFrom', {
          createdFrom: filters.createdFrom,
        });
      }

      if (filters.createdTo) {
        qb.andWhere('user.createdAt <= :createdTo', {
          createdTo: filters.createdTo,
        });
      }

      const batch = await qb.orderBy('user.id', 'ASC').take(batchSize).getMany();

      if (batch.length === 0) {
        break;
      }

      for (const entity of batch) {
        yield UserMapper.toDomain(entity);
      }

      lastId = batch[batch.length - 1].id;
    }
  }
}
