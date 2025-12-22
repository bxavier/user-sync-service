import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../../domain/entities';
import {
  UserRepository,
  FindAllOptions,
  FindAllResult,
  CreateUserData,
  UpdateUserData,
  UpsertUserData,
  ExportFilters,
} from '../../domain/repositories/user.repository.interface';

@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(options: FindAllOptions = {}): Promise<FindAllResult> {
    const { page = 1, limit = 10, includeDeleted = false } = options;
    const skip = (page - 1) * limit;

    const where = includeDeleted ? {} : { deleted: false };

    const [users, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { users, total };
  }

  async findById(id: number): Promise<User | null> {
    return this.repository.findOne({
      where: { id, deleted: false },
    });
  }

  async findByUserName(userName: string): Promise<User | null> {
    return this.repository.findOne({
      where: { userName, deleted: false },
    });
  }

  async create(data: CreateUserData): Promise<User> {
    const user = this.repository.create({
      userName: data.userName,
      email: data.email,
      legacyId: data.legacyId ?? null,
      legacyCreatedAt: data.legacyCreatedAt ?? null,
      deleted: false,
    });

    return this.repository.save(user);
  }

  async update(id: number, data: UpdateUserData): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    if (data.userName !== undefined) {
      user.userName = data.userName;
    }
    if (data.email !== undefined) {
      user.email = data.email;
    }

    return this.repository.save(user);
  }

  async softDelete(id: number): Promise<boolean> {
    const user = await this.findById(id);
    if (!user) {
      return false;
    }

    user.deleted = true;
    user.deletedAt = new Date();
    await this.repository.save(user);

    return true;
  }

  async upsertByLegacyId(data: UpsertUserData): Promise<User> {
    const existing = await this.repository.findOne({
      where: { legacyId: data.legacyId },
    });

    if (existing) {
      // Atualiza apenas se o registro do legado for mais recente
      if (data.legacyCreatedAt > (existing.legacyCreatedAt ?? new Date(0))) {
        existing.userName = data.userName;
        existing.email = data.email;
        existing.legacyCreatedAt = data.legacyCreatedAt;
        existing.deleted = data.deleted;
        if (data.deleted) {
          existing.deletedAt = new Date();
        }
        return this.repository.save(existing);
      }
      return existing;
    }

    const user = this.repository.create({
      legacyId: data.legacyId,
      userName: data.userName,
      email: data.email,
      legacyCreatedAt: data.legacyCreatedAt,
      deleted: data.deleted,
      deletedAt: data.deleted ? new Date() : null,
    });

    return this.repository.save(user);
  }

  async bulkUpsertByUserName(data: UpsertUserData[]): Promise<number> {
    if (data.length === 0) return 0;

    // SQLite SQLITE_MAX_VARIABLE_NUMBER default = 999, com 8 campos = 124 max
    const CHUNK_SIZE = 124;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      await this.upsertChunk(data.slice(i, i + CHUNK_SIZE));
    }

    return data.length;
  }

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

  async *findAllForExport(
    filters: ExportFilters = {},
  ): AsyncGenerator<User, void, unknown> {
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

      const batch = await qb
        .orderBy('user.id', 'ASC')
        .take(batchSize)
        .getMany();

      if (batch.length === 0) {
        break;
      }

      for (const user of batch) {
        yield user;
      }

      lastId = batch[batch.length - 1].id;
    }
  }
}
