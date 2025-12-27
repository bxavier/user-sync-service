/**
 * INTEGRATION TEST - UserRepository
 *
 * Difference from unit tests:
 * - Unit: mocks the database, tests only repository logic
 * - Integration: uses REAL database (SQLite in-memory), tests complete integration
 *
 * What we test here:
 * - Repository + TypeORM + SQLite working together
 * - Real SQL queries
 * - Database constraints (unique, not null)
 * - Upsert behavior with conflicts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '@/infrastructure/database/entities';
import { TypeOrmUserRepository } from './user.repository';

describe('UserRepository (Integration)', () => {
  let repository: TypeOrmUserRepository;
  let dataSource: DataSource;
  let module: TestingModule;
  let ormRepository: Repository<UserEntity>;

  /**
   * SETUP: Before ALL tests, create a module
   * More efficient than creating a module per test
   */
  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [UserEntity],
          synchronize: true,
          logging: false,
          retryAttempts: 0,
        }),
        TypeOrmModule.forFeature([UserEntity]),
      ],
      providers: [TypeOrmUserRepository],
    }).compile();

    repository = module.get<TypeOrmUserRepository>(TypeOrmUserRepository);
    dataSource = module.get<DataSource>(DataSource);
    ormRepository = module.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  }, 30000);

  /**
   * Before each test, clear the table
   * Faster than recreating the entire module
   */
  beforeEach(async () => {
    await ormRepository.clear();
  });

  /**
   * TEARDOWN: After ALL tests, close connections
   */
  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await module?.close();
  }, 10000);

  // ============================================================
  // CREATE TESTS
  // ============================================================

  describe('create', () => {
    it('should create a user in the database', async () => {
      const userData = {
        userName: 'john_doe',
        email: 'john@example.com',
      };

      const user = await repository.create(userData);

      expect(user.id).toBeDefined();
      expect(user.userName).toBe('john_doe');
      expect(user.email).toBe('john@example.com');
      expect(user.deleted).toBe(false);
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should persist user to database (can be retrieved)', async () => {
      const created = await repository.create({
        userName: 'jane_doe',
        email: 'jane@example.com',
      });

      const found = await repository.findById(created.id!);

      expect(found).not.toBeNull();
      expect(found?.userName).toBe('jane_doe');
    });

    it('should fail on duplicate userName (database constraint)', async () => {
      await repository.create({
        userName: 'unique_user',
        email: 'first@example.com',
      });

      await expect(
        repository.create({
          userName: 'unique_user',
          email: 'second@example.com',
        }),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // FIND TESTS
  // ============================================================

  describe('findByUserName', () => {
    it('should find user by userName', async () => {
      await repository.create({
        userName: 'findme',
        email: 'find@example.com',
      });

      const found = await repository.findByUserName('findme');

      expect(found).not.toBeNull();
      expect(found?.email).toBe('find@example.com');
    });

    it('should return null for non-existent userName', async () => {
      const found = await repository.findByUserName('nonexistent');

      expect(found).toBeNull();
    });

    it('should NOT find soft-deleted users', async () => {
      const user = await repository.create({
        userName: 'deleted_user',
        email: 'deleted@example.com',
      });
      await repository.softDelete(user.id!);

      const found = await repository.findByUserName('deleted_user');

      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) {
        await repository.create({
          userName: `user_${i.toString().padStart(2, '0')}`,
          email: `user${i}@example.com`,
        });
      }
    });

    it('should return paginated results', async () => {
      const result = await repository.findAll({ page: 1, limit: 10 });

      expect(result.users).toHaveLength(10);
      expect(result.total).toBe(15);
    });

    it('should return second page correctly', async () => {
      const result = await repository.findAll({ page: 2, limit: 10 });

      expect(result.users).toHaveLength(5);
      expect(result.total).toBe(15);
    });

    it('should not include deleted users by default', async () => {
      const all = await repository.findAll({ page: 1, limit: 100 });
      await repository.softDelete(all.users[0].id!);
      await repository.softDelete(all.users[1].id!);

      const result = await repository.findAll({ page: 1, limit: 100 });

      expect(result.total).toBe(13);
    });

    it('should include deleted users when includeDeleted is true', async () => {
      const all = await repository.findAll({ page: 1, limit: 100 });
      await repository.softDelete(all.users[0].id!);

      const result = await repository.findAll({
        page: 1,
        limit: 100,
        includeDeleted: true,
      });

      expect(result.total).toBe(15);
    });
  });

  // ============================================================
  // UPDATE TESTS
  // ============================================================

  describe('update', () => {
    it('should update user email', async () => {
      const user = await repository.create({
        userName: 'update_test',
        email: 'old@example.com',
      });

      const updated = await repository.update(user.id!, {
        email: 'new@example.com',
      });

      expect(updated?.email).toBe('new@example.com');
      expect(updated?.userName).toBe('update_test');
    });

    it('should return null when updating non-existent user', async () => {
      const updated = await repository.update(99999, { email: 'x@x.com' });

      expect(updated).toBeNull();
    });

    it('should not update deleted users', async () => {
      const user = await repository.create({
        userName: 'will_delete',
        email: 'delete@example.com',
      });
      await repository.softDelete(user.id!);

      const updated = await repository.update(user.id!, {
        email: 'should_not_update@example.com',
      });

      expect(updated).toBeNull();
    });
  });

  // ============================================================
  // SOFT DELETE TESTS
  // ============================================================

  describe('softDelete', () => {
    it('should mark user as deleted', async () => {
      const user = await repository.create({
        userName: 'soft_delete_test',
        email: 'soft@example.com',
      });

      const result = await repository.softDelete(user.id!);

      expect(result).toBe(true);

      const found = await repository.findById(user.id!);
      expect(found).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const result = await repository.softDelete(99999);

      expect(result).toBe(false);
    });

    it('should set deletedAt timestamp', async () => {
      const user = await repository.create({
        userName: 'timestamp_test',
        email: 'timestamp@example.com',
      });

      await repository.softDelete(user.id!);

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        includeDeleted: true,
      });
      const deleted = result.users.find((u) => u.id === user.id!);

      expect(deleted?.deleted).toBe(true);
      expect(deleted?.deletedAt).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // BULK UPSERT TESTS
  // ============================================================

  describe('bulkUpsertByUserName', () => {
    it('should insert new users', async () => {
      const data = [
        {
          legacyId: 1,
          userName: 'bulk_user_1',
          email: 'bulk1@example.com',
          legacyCreatedAt: new Date('2024-01-01'),
          deleted: false,
        },
        {
          legacyId: 2,
          userName: 'bulk_user_2',
          email: 'bulk2@example.com',
          legacyCreatedAt: new Date('2024-01-02'),
          deleted: false,
        },
      ];

      const count = await repository.bulkUpsertByUserName(data);

      expect(count).toBe(2);

      const user1 = await repository.findByUserName('bulk_user_1');
      const user2 = await repository.findByUserName('bulk_user_2');

      expect(user1?.email).toBe('bulk1@example.com');
      expect(user2?.email).toBe('bulk2@example.com');
    });

    it('should update existing user when legacyCreatedAt is newer', async () => {
      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'update_me',
          email: 'old_email@example.com',
          legacyCreatedAt: new Date('2024-01-01'),
          deleted: false,
        },
      ]);

      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'update_me',
          email: 'new_email@example.com',
          legacyCreatedAt: new Date('2024-06-01'),
          deleted: false,
        },
      ]);

      const user = await repository.findByUserName('update_me');

      expect(user?.email).toBe('new_email@example.com');
    });

    it('should NOT update when legacyCreatedAt is older', async () => {
      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'keep_me',
          email: 'keep_this@example.com',
          legacyCreatedAt: new Date('2024-06-01'),
          deleted: false,
        },
      ]);

      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'keep_me',
          email: 'should_not_replace@example.com',
          legacyCreatedAt: new Date('2024-01-01'),
          deleted: false,
        },
      ]);

      const user = await repository.findByUserName('keep_me');

      expect(user?.email).toBe('keep_this@example.com');
    });

    it('should handle large batches (chunking)', async () => {
      const data = Array.from({ length: 200 }, (_, i) => ({
        legacyId: i + 1,
        userName: `batch_user_${i}`,
        email: `batch${i}@example.com`,
        legacyCreatedAt: new Date(),
        deleted: false,
      }));

      const count = await repository.bulkUpsertByUserName(data);

      expect(count).toBe(200);

      const user50 = await repository.findByUserName('batch_user_50');
      const user150 = await repository.findByUserName('batch_user_150');

      expect(user50).not.toBeNull();
      expect(user150).not.toBeNull();
    });

    it('should handle soft delete via upsert', async () => {
      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'to_delete',
          email: 'delete@example.com',
          legacyCreatedAt: new Date('2024-01-01'),
          deleted: false,
        },
      ]);

      await repository.bulkUpsertByUserName([
        {
          legacyId: 1,
          userName: 'to_delete',
          email: 'delete@example.com',
          legacyCreatedAt: new Date('2024-06-01'),
          deleted: true,
        },
      ]);

      const user = await repository.findByUserName('to_delete');
      expect(user).toBeNull();

      const all = await repository.findAll({
        page: 1,
        limit: 10,
        includeDeleted: true,
      });
      const deleted = all.users.find((u) => u.userName === 'to_delete');
      expect(deleted?.deleted).toBe(true);
    });

    it('should return 0 for empty array', async () => {
      const count = await repository.bulkUpsertByUserName([]);
      expect(count).toBe(0);
    });
  });

  // ============================================================
  // EXPORT TESTS (Generator/Streaming)
  // ============================================================

  describe('findAllForExport', () => {
    beforeEach(async () => {
      const users = Array.from({ length: 50 }, (_, i) => ({
        legacyId: i + 1,
        userName: `export_user_${i}`,
        email: `export${i}@example.com`,
        legacyCreatedAt: new Date(`2024-0${(i % 9) + 1}-01`),
        deleted: i % 10 === 0,
      }));
      await repository.bulkUpsertByUserName(users);
    });

    it('should yield all non-deleted users', async () => {
      const users: unknown[] = [];

      for await (const user of repository.findAllForExport()) {
        users.push(user);
      }

      expect(users.length).toBe(45);
    });

    it('should filter by createdFrom', async () => {
      const users: unknown[] = [];
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 1);

      for await (const user of repository.findAllForExport({
        createdFrom: fromDate,
      })) {
        users.push(user);
      }

      expect(users.length).toBe(45);
    });
  });
});
