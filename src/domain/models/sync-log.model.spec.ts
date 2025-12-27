import { SyncLog, SyncLogProps, SyncStatus } from './sync-log.model';

describe('SyncLog', () => {
  const validProps: SyncLogProps = {
    id: 1,
    status: SyncStatus.COMPLETED,
    startedAt: new Date('2024-06-01T12:00:00Z'),
    finishedAt: new Date('2024-06-01T12:30:00Z'),
    totalProcessed: 100000,
    errorMessage: null,
    durationMs: 1800000,
  };

  describe('constructor', () => {
    it('should create a SyncLog instance with valid props', () => {
      const syncLog = new SyncLog(validProps);

      expect(syncLog).toBeInstanceOf(SyncLog);
    });

    it('should create a SyncLog with nullable fields as null', () => {
      const propsWithNulls: SyncLogProps = {
        ...validProps,
        id: undefined,
        finishedAt: null,
        errorMessage: null,
        durationMs: null,
      };

      const syncLog = new SyncLog(propsWithNulls);

      expect(syncLog.id).toBeUndefined();
      expect(syncLog.finishedAt).toBeNull();
      expect(syncLog.errorMessage).toBeNull();
      expect(syncLog.durationMs).toBeNull();
    });
  });

  describe('getters', () => {
    let syncLog: SyncLog;

    beforeEach(() => {
      syncLog = new SyncLog(validProps);
    });

    it('should return correct id', () => {
      expect(syncLog.id).toBe(1);
    });

    it('should return correct status', () => {
      expect(syncLog.status).toBe(SyncStatus.COMPLETED);
    });

    it('should return correct startedAt', () => {
      expect(syncLog.startedAt).toEqual(new Date('2024-06-01T12:00:00Z'));
    });

    it('should return correct finishedAt', () => {
      expect(syncLog.finishedAt).toEqual(new Date('2024-06-01T12:30:00Z'));
    });

    it('should return correct totalProcessed', () => {
      expect(syncLog.totalProcessed).toBe(100000);
    });

    it('should return correct errorMessage', () => {
      expect(syncLog.errorMessage).toBeNull();
    });

    it('should return correct durationMs', () => {
      expect(syncLog.durationMs).toBe(1800000);
    });
  });

  describe('SyncStatus enum', () => {
    it('should have PENDING status', () => {
      expect(SyncStatus.PENDING).toBe('pending');
    });

    it('should have RUNNING status', () => {
      expect(SyncStatus.RUNNING).toBe('running');
    });

    it('should have PROCESSING status', () => {
      expect(SyncStatus.PROCESSING).toBe('processing');
    });

    it('should have COMPLETED status', () => {
      expect(SyncStatus.COMPLETED).toBe('completed');
    });

    it('should have FAILED status', () => {
      expect(SyncStatus.FAILED).toBe('failed');
    });
  });

  describe('isInProgress (static)', () => {
    it('should return true for PENDING status', () => {
      const syncLog = new SyncLog({ ...validProps, status: SyncStatus.PENDING });

      expect(SyncLog.isInProgress(syncLog)).toBe(true);
    });

    it('should return true for RUNNING status', () => {
      const syncLog = new SyncLog({ ...validProps, status: SyncStatus.RUNNING });

      expect(SyncLog.isInProgress(syncLog)).toBe(true);
    });

    it('should return true for PROCESSING status', () => {
      const syncLog = new SyncLog({ ...validProps, status: SyncStatus.PROCESSING });

      expect(SyncLog.isInProgress(syncLog)).toBe(true);
    });

    it('should return false for COMPLETED status', () => {
      const syncLog = new SyncLog({ ...validProps, status: SyncStatus.COMPLETED });

      expect(SyncLog.isInProgress(syncLog)).toBe(false);
    });

    it('should return false for FAILED status', () => {
      const syncLog = new SyncLog({ ...validProps, status: SyncStatus.FAILED });

      expect(SyncLog.isInProgress(syncLog)).toBe(false);
    });

    it('should return false for null sync', () => {
      expect(SyncLog.isInProgress(null)).toBe(false);
    });
  });

  describe('toPlainObject', () => {
    it('should return a plain object with all properties', () => {
      const syncLog = new SyncLog(validProps);

      const plainObject = syncLog.toPlainObject();

      expect(plainObject).toEqual(validProps);
    });

    it('should return a new object (not reference)', () => {
      const syncLog = new SyncLog(validProps);

      const plainObject = syncLog.toPlainObject();

      expect(plainObject).not.toBe(validProps);
      expect(plainObject).toEqual(validProps);
    });

    it('should include all fields even when null/undefined', () => {
      const propsWithNulls: SyncLogProps = {
        id: undefined,
        status: SyncStatus.PENDING,
        startedAt: new Date(),
        finishedAt: null,
        totalProcessed: 0,
        errorMessage: null,
        durationMs: null,
      };
      const syncLog = new SyncLog(propsWithNulls);

      const plainObject = syncLog.toPlainObject();

      expect(plainObject).toHaveProperty('id');
      expect(plainObject).toHaveProperty('finishedAt');
      expect(plainObject).toHaveProperty('errorMessage');
      expect(plainObject).toHaveProperty('durationMs');
    });
  });

  describe('failed sync', () => {
    it('should correctly represent a failed sync with error message', () => {
      const failedProps: SyncLogProps = {
        ...validProps,
        status: SyncStatus.FAILED,
        errorMessage: 'Connection timeout after 30 minutes',
        finishedAt: new Date('2024-06-01T12:30:00Z'),
      };

      const syncLog = new SyncLog(failedProps);

      expect(syncLog.status).toBe(SyncStatus.FAILED);
      expect(syncLog.errorMessage).toBe('Connection timeout after 30 minutes');
      expect(SyncLog.isInProgress(syncLog)).toBe(false);
    });
  });

  describe('in-progress sync', () => {
    it('should correctly represent a sync in progress', () => {
      const inProgressProps: SyncLogProps = {
        id: 2,
        status: SyncStatus.RUNNING,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        finishedAt: null,
        totalProcessed: 50000,
        errorMessage: null,
        durationMs: null,
      };

      const syncLog = new SyncLog(inProgressProps);

      expect(syncLog.status).toBe(SyncStatus.RUNNING);
      expect(syncLog.finishedAt).toBeNull();
      expect(syncLog.durationMs).toBeNull();
      expect(SyncLog.isInProgress(syncLog)).toBe(true);
    });
  });
});
