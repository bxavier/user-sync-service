import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../domain/entities';
import {
  UserRepository,
  FindAllOptions,
  FindAllResult,
  CreateUserData,
  UpdateUserData,
  UpsertUserData,
} from '../../domain/repositories/user.repository.interface';

@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
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
    if (data.length === 0) {
      return 0;
    }

    const entities = data.map((item) => ({
      legacyId: item.legacyId,
      userName: item.userName,
      email: item.email,
      legacyCreatedAt: item.legacyCreatedAt,
      deleted: item.deleted,
      deletedAt: item.deleted ? new Date() : null,
    }));

    await this.repository.upsert(entities, {
      conflictPaths: ['userName'],
      skipUpdateIfNoValuesChanged: true,
    });

    return data.length;
  }
}
