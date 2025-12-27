import { SyncLog, SyncStatus } from '@/domain/models';
import { SyncLogEntity } from '@/infrastructure/database/entities';
import { SyncLogMapper } from './sync-log.mapper';

describe('SyncLogMapper', () => {
  describe('toDomain', () => {
    it('should convert a complete SyncLogEntity to SyncLog domain model', () => {
      const entity: SyncLogEntity = {
        id: 1,
        status: SyncStatus.COMPLETED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:30:00Z'),
        totalProcessed: 100000,
        errorMessage: null,
        durationMs: 1800000,
      };

      const syncLog = SyncLogMapper.toDomain(entity);

      expect(syncLog).toBeInstanceOf(SyncLog);
      expect(syncLog.id).toBe(1);
      expect(syncLog.status).toBe(SyncStatus.COMPLETED);
      expect(syncLog.startedAt).toEqual(new Date('2024-06-01T12:00:00Z'));
      expect(syncLog.finishedAt).toEqual(new Date('2024-06-01T12:30:00Z'));
      expect(syncLog.totalProcessed).toBe(100000);
      expect(syncLog.errorMessage).toBeNull();
      expect(syncLog.durationMs).toBe(1800000);
    });

    it('should convert entity with PENDING status', () => {
      const entity: SyncLogEntity = {
        id: 2,
        status: SyncStatus.PENDING,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: null,
        totalProcessed: 0,
        errorMessage: null,
        durationMs: null,
      };

      const syncLog = SyncLogMapper.toDomain(entity);

      expect(syncLog.status).toBe(SyncStatus.PENDING);
      expect(syncLog.finishedAt).toBeNull();
      expect(syncLog.durationMs).toBeNull();
    });

    it('should convert entity with RUNNING status', () => {
      const entity: SyncLogEntity = {
        id: 3,
        status: SyncStatus.RUNNING,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: null,
        totalProcessed: 50000,
        errorMessage: null,
        durationMs: null,
      };

      const syncLog = SyncLogMapper.toDomain(entity);

      expect(syncLog.status).toBe(SyncStatus.RUNNING);
      expect(syncLog.totalProcessed).toBe(50000);
    });

    it('should convert entity with PROCESSING status', () => {
      const entity: SyncLogEntity = {
        id: 4,
        status: SyncStatus.PROCESSING,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: null,
        totalProcessed: 900000,
        errorMessage: null,
        durationMs: null,
      };

      const syncLog = SyncLogMapper.toDomain(entity);

      expect(syncLog.status).toBe(SyncStatus.PROCESSING);
    });

    it('should convert entity with FAILED status and error message', () => {
      const entity: SyncLogEntity = {
        id: 5,
        status: SyncStatus.FAILED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:35:00Z'),
        totalProcessed: 75000,
        errorMessage: 'Connection timeout after 30 minutes',
        durationMs: 2100000,
      };

      const syncLog = SyncLogMapper.toDomain(entity);

      expect(syncLog.status).toBe(SyncStatus.FAILED);
      expect(syncLog.errorMessage).toBe('Connection timeout after 30 minutes');
      expect(syncLog.totalProcessed).toBe(75000);
    });
  });

  describe('toEntity', () => {
    it('should convert SyncLog domain model to partial entity', () => {
      const syncLog = new SyncLog({
        id: 1,
        status: SyncStatus.COMPLETED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:30:00Z'),
        totalProcessed: 100000,
        errorMessage: null,
        durationMs: 1800000,
      });

      const entity = SyncLogMapper.toEntity(syncLog);

      expect(entity.status).toBe(SyncStatus.COMPLETED);
      expect(entity.finishedAt).toEqual(new Date('2024-06-01T12:30:00Z'));
      expect(entity.totalProcessed).toBe(100000);
      expect(entity.errorMessage).toBeNull();
      expect(entity.durationMs).toBe(1800000);
    });

    it('should not include id and startedAt in partial entity', () => {
      const syncLog = new SyncLog({
        id: 1,
        status: SyncStatus.COMPLETED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:30:00Z'),
        totalProcessed: 100000,
        errorMessage: null,
        durationMs: 1800000,
      });

      const entity = SyncLogMapper.toEntity(syncLog);

      expect(entity).not.toHaveProperty('id');
      expect(entity).not.toHaveProperty('startedAt');
    });

    it('should convert in-progress sync to partial entity', () => {
      const syncLog = new SyncLog({
        id: 2,
        status: SyncStatus.RUNNING,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: null,
        totalProcessed: 50000,
        errorMessage: null,
        durationMs: null,
      });

      const entity = SyncLogMapper.toEntity(syncLog);

      expect(entity.status).toBe(SyncStatus.RUNNING);
      expect(entity.finishedAt).toBeNull();
      expect(entity.durationMs).toBeNull();
    });

    it('should convert failed sync with error message to partial entity', () => {
      const syncLog = new SyncLog({
        id: 3,
        status: SyncStatus.FAILED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:35:00Z'),
        totalProcessed: 75000,
        errorMessage: 'Legacy API unavailable',
        durationMs: 2100000,
      });

      const entity = SyncLogMapper.toEntity(syncLog);

      expect(entity.status).toBe(SyncStatus.FAILED);
      expect(entity.errorMessage).toBe('Legacy API unavailable');
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity through toDomain -> toEntity', () => {
      const originalEntity: SyncLogEntity = {
        id: 1,
        status: SyncStatus.COMPLETED,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: new Date('2024-06-01T12:30:00Z'),
        totalProcessed: 100000,
        errorMessage: null,
        durationMs: 1800000,
      };

      const domain = SyncLogMapper.toDomain(originalEntity);
      const partialEntity = SyncLogMapper.toEntity(domain);

      expect(partialEntity.status).toBe(originalEntity.status);
      expect(partialEntity.finishedAt).toEqual(originalEntity.finishedAt);
      expect(partialEntity.totalProcessed).toBe(originalEntity.totalProcessed);
      expect(partialEntity.errorMessage).toBe(originalEntity.errorMessage);
      expect(partialEntity.durationMs).toBe(originalEntity.durationMs);
    });
  });
});
