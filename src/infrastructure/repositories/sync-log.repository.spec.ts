/**
 * INTEGRATION TEST - SyncLogRepository
 *
 * Tests persistence and retrieval of synchronization logs.
 * Uses in-memory SQLite database for isolated tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SyncStatus } from '@/domain/models';
import { SyncLogEntity } from '@/infrastructure/database/entities';
import { TypeOrmSyncLogRepository } from './sync-log.repository';

describe('SyncLogRepository (Integration)', () => {
  let repository: TypeOrmSyncLogRepository;
  let dataSource: DataSource;
  let module: TestingModule;
  let ormRepository: Repository<SyncLogEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [SyncLogEntity],
          synchronize: true,
          logging: false,
          retryAttempts: 0,
        }),
        TypeOrmModule.forFeature([SyncLogEntity]),
      ],
      providers: [TypeOrmSyncLogRepository],
    }).compile();

    repository = module.get<TypeOrmSyncLogRepository>(TypeOrmSyncLogRepository);
    dataSource = module.get<DataSource>(DataSource);
    ormRepository = module.get<Repository<SyncLogEntity>>(getRepositoryToken(SyncLogEntity));
  }, 30000);

  beforeEach(async () => {
    await ormRepository.clear();
  });

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
    it('should create a sync log with default values', async () => {
      const syncLog = await repository.create();

      expect(syncLog.id).toBeDefined();
      expect(syncLog.status).toBe(SyncStatus.PENDING);
      expect(syncLog.totalProcessed).toBe(0);
      expect(syncLog.startedAt).toBeInstanceOf(Date);
      expect(syncLog.finishedAt).toBeNull();
      expect(syncLog.errorMessage).toBeNull();
    });

    it('should create a sync log with custom status', async () => {
      const syncLog = await repository.create({ status: SyncStatus.RUNNING });

      expect(syncLog.status).toBe(SyncStatus.RUNNING);
    });
  });

  // ============================================================
  // UPDATE TESTS
  // ============================================================

  describe('update', () => {
    it('should update sync log status', async () => {
      const created = await repository.create();

      const updated = await repository.update(created.id!, {
        status: SyncStatus.RUNNING,
      });

      expect(updated?.status).toBe(SyncStatus.RUNNING);
    });

    it('should update multiple fields', async () => {
      const created = await repository.create();

      const updated = await repository.update(created.id!, {
        status: SyncStatus.COMPLETED,
        finishedAt: new Date(),
        totalProcessed: 100000,
        durationMs: 60000,
      });

      expect(updated?.status).toBe(SyncStatus.COMPLETED);
      expect(updated?.totalProcessed).toBe(100000);
      expect(updated?.durationMs).toBe(60000);
      expect(updated?.finishedAt).toBeInstanceOf(Date);
    });

    it('should update with error message on failure', async () => {
      const created = await repository.create();

      const updated = await repository.update(created.id!, {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: 'Connection timeout',
      });

      expect(updated?.status).toBe(SyncStatus.FAILED);
      expect(updated?.errorMessage).toBe('Connection timeout');
    });

    it('should return null for non-existent id', async () => {
      const updated = await repository.update(99999, {
        status: SyncStatus.COMPLETED,
      });

      expect(updated).toBeNull();
    });

    it('should only update provided fields', async () => {
      const created = await repository.create();
      await repository.update(created.id!, {
        status: SyncStatus.RUNNING,
        totalProcessed: 50000,
      });

      const updated = await repository.update(created.id!, {
        totalProcessed: 75000,
      });

      expect(updated?.status).toBe(SyncStatus.RUNNING); // Unchanged
      expect(updated?.totalProcessed).toBe(75000); // Changed
    });
  });

  // ============================================================
  // FIND TESTS
  // ============================================================

  describe('findById', () => {
    it('should find sync log by id', async () => {
      const created = await repository.create();

      const found = await repository.findById(created.id!);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(99999);

      expect(found).toBeNull();
    });
  });

  describe('findLatest', () => {
    it('should return the most recent sync log', async () => {
      // Create a log with old timestamp directly in database
      const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      await ormRepository.save({
        status: SyncStatus.COMPLETED,
        startedAt: oldDate,
        totalProcessed: 100,
      });

      // Create a recent log via repository (startedAt = now)
      const latest = await repository.create({ status: SyncStatus.PENDING });

      const found = await repository.findLatest();

      // Should return the most recent (by startedAt)
      expect(found?.id).toBe(latest.id);
      expect(found?.status).toBe(SyncStatus.PENDING);
    });

    it('should return null when no logs exist', async () => {
      const found = await repository.findLatest();

      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create 5 logs
      for (let i = 0; i < 5; i++) {
        await repository.create({ status: SyncStatus.COMPLETED });
      }
    });

    it('should return all logs with default limit', async () => {
      const logs = await repository.findAll();

      expect(logs).toHaveLength(5);
    });

    it('should respect custom limit', async () => {
      const logs = await repository.findAll(3);

      expect(logs).toHaveLength(3);
    });

    it('should return logs ordered by startedAt DESC', async () => {
      const logs = await repository.findAll();

      // Verify they are in descending order
      for (let i = 0; i < logs.length - 1; i++) {
        expect(logs[i].startedAt.getTime()).toBeGreaterThanOrEqual(logs[i + 1].startedAt.getTime());
      }
    });
  });

  // ============================================================
  // STALE SYNCS TESTS
  // ============================================================

  describe('findStaleSyncs', () => {
    it('should find syncs older than threshold', async () => {
      // Create an "old" sync directly in the database
      const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      await ormRepository.save({
        status: SyncStatus.RUNNING,
        startedAt: oldDate,
        totalProcessed: 50000,
      });

      // Create a recent sync
      await repository.create({ status: SyncStatus.RUNNING });

      const staleSyncs = await repository.findStaleSyncs(30); // 30 minutes

      expect(staleSyncs).toHaveLength(1);
      expect(staleSyncs[0].status).toBe(SyncStatus.RUNNING);
    });

    it('should not find completed syncs even if old', async () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000);
      await ormRepository.save({
        status: SyncStatus.COMPLETED,
        startedAt: oldDate,
        totalProcessed: 100000,
      });

      const staleSyncs = await repository.findStaleSyncs(30);

      expect(staleSyncs).toHaveLength(0);
    });

    it('should find PENDING, RUNNING, and PROCESSING syncs', async () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000);

      await ormRepository.save([
        { status: SyncStatus.PENDING, startedAt: oldDate, totalProcessed: 0 },
        { status: SyncStatus.RUNNING, startedAt: oldDate, totalProcessed: 0 },
        { status: SyncStatus.PROCESSING, startedAt: oldDate, totalProcessed: 0 },
        { status: SyncStatus.COMPLETED, startedAt: oldDate, totalProcessed: 0 },
        { status: SyncStatus.FAILED, startedAt: oldDate, totalProcessed: 0 },
      ]);

      const staleSyncs = await repository.findStaleSyncs(30);

      expect(staleSyncs).toHaveLength(3); // PENDING, RUNNING, PROCESSING
    });
  });

  describe('markStaleAsFailed', () => {
    it('should mark stale syncs as FAILED', async () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000);
      const staleSync = await ormRepository.save({
        status: SyncStatus.RUNNING,
        startedAt: oldDate,
        totalProcessed: 50000,
      });

      const count = await repository.markStaleAsFailed(30, 'Sync timeout');

      expect(count).toBe(1);

      const updated = await repository.findById(staleSync.id);
      expect(updated?.status).toBe(SyncStatus.FAILED);
      expect(updated?.errorMessage).toBe('Sync timeout');
      expect(updated?.finishedAt).toBeInstanceOf(Date);
    });

    it('should return 0 when no stale syncs', async () => {
      // Create a recent sync
      await repository.create({ status: SyncStatus.RUNNING });

      const count = await repository.markStaleAsFailed(30, 'Timeout');

      expect(count).toBe(0);
    });

    it('should mark multiple stale syncs', async () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000);

      await ormRepository.save([
        { status: SyncStatus.RUNNING, startedAt: oldDate, totalProcessed: 0 },
        { status: SyncStatus.PROCESSING, startedAt: oldDate, totalProcessed: 0 },
      ]);

      const count = await repository.markStaleAsFailed(30, 'Bulk timeout');

      expect(count).toBe(2);
    });
  });
});
