import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { SyncLog, SyncStatus } from '@/domain/models';
import type { SyncLogRepository } from '@/domain/repositories/sync-log.repository.interface';
import { SYNC_LOG_REPOSITORY } from '@/domain/repositories/sync-log.repository.interface';
import type { ILogger } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import { SYNC_BATCH_QUEUE_NAME, SYNC_JOB_NAME, SYNC_QUEUE_NAME } from '@/infrastructure/queue';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let mockSyncLogRepository: jest.Mocked<SyncLogRepository>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockQueue: { add: jest.Mock; getFailed: jest.Mock };
  let mockBatchQueue: { add: jest.Mock; getFailed: jest.Mock };
  let mockConfigService: jest.Mocked<ConfigService>;

  const createMockSyncLog = (overrides: Partial<SyncLog> = {}): SyncLog => {
    const defaultProps = {
      id: 1,
      status: SyncStatus.COMPLETED,
      startedAt: new Date('2024-06-01T12:00:00Z'),
      finishedAt: new Date('2024-06-01T12:30:00Z'),
      totalProcessed: 100000,
      errorMessage: null,
      durationMs: 1800000,
    };
    return new SyncLog({ ...defaultProps, ...overrides });
  };

  beforeEach(async () => {
    mockSyncLogRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findLatest: jest.fn(),
      findAll: jest.fn(),
      findStaleSyncs: jest.fn(),
      markStaleAsFailed: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getFailed: jest.fn().mockResolvedValue([]),
    };

    mockBatchQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getFailed: jest.fn().mockResolvedValue([]),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: number) => {
        const config: Record<string, number> = {
          SYNC_BATCH_SIZE: 1000,
          SYNC_WORKER_CONCURRENCY: 1,
          SYNC_STALE_THRESHOLD_MINUTES: 30,
          SYNC_ESTIMATED_TOTAL_RECORDS: 1000000,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: SYNC_LOG_REPOSITORY, useValue: mockSyncLogRepository },
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getQueueToken(SYNC_QUEUE_NAME), useValue: mockQueue },
        { provide: getQueueToken(SYNC_BATCH_QUEUE_NAME), useValue: mockBatchQueue },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('onModuleInit', () => {
    it('should mark orphan syncs as FAILED on startup', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(2);

      await service.onModuleInit();

      expect(mockSyncLogRepository.markStaleAsFailed).toHaveBeenCalledWith(
        0,
        'Sync interrupted: application restarted',
      );
    });

    it('should log warning when orphan syncs are found', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(3);

      await service.onModuleInit();

      expect(mockLogger.warn).toHaveBeenCalledWith('Orphan syncs marked as FAILED on startup', {
        count: 3,
      });
    });

    it('should not log when no orphan syncs found', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);

      await service.onModuleInit();

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('triggerSync', () => {
    it('should create SyncLog and enqueue job when no sync in progress', async () => {
      const newSyncLog = createMockSyncLog({ id: 5, status: SyncStatus.PENDING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);
      mockSyncLogRepository.create.mockResolvedValue(newSyncLog);

      const result = await service.triggerSync();

      expect(result.syncLogId).toBe(5);
      expect(result.message).toBe('Sync started');
      expect(result.alreadyRunning).toBe(false);
      expect(mockSyncLogRepository.create).toHaveBeenCalledWith({
        status: SyncStatus.PENDING,
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        SYNC_JOB_NAME,
        expect.objectContaining({ syncLogId: 5 }),
        expect.objectContaining({
          removeOnComplete: 100,
          removeOnFail: 50,
        }),
      );
    });

    it('should return alreadyRunning when sync is in progress (PENDING)', async () => {
      const runningSync = createMockSyncLog({ id: 3, status: SyncStatus.PENDING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.triggerSync();

      expect(result.alreadyRunning).toBe(true);
      expect(result.syncLogId).toBe(3);
      expect(result.message).toBe('Sync already in progress');
      expect(mockSyncLogRepository.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return alreadyRunning when sync is in progress (RUNNING)', async () => {
      const runningSync = createMockSyncLog({ id: 4, status: SyncStatus.RUNNING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.triggerSync();

      expect(result.alreadyRunning).toBe(true);
    });

    it('should return alreadyRunning when sync is in progress (PROCESSING)', async () => {
      const runningSync = createMockSyncLog({ id: 5, status: SyncStatus.PROCESSING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.triggerSync();

      expect(result.alreadyRunning).toBe(true);
    });

    it('should allow new sync when latest is COMPLETED', async () => {
      const completedSync = createMockSyncLog({ id: 10, status: SyncStatus.COMPLETED });
      const newSyncLog = createMockSyncLog({ id: 11, status: SyncStatus.PENDING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(completedSync);
      mockSyncLogRepository.create.mockResolvedValue(newSyncLog);

      const result = await service.triggerSync();

      expect(result.alreadyRunning).toBe(false);
      expect(mockSyncLogRepository.create).toHaveBeenCalled();
    });

    it('should allow new sync when latest is FAILED', async () => {
      const failedSync = createMockSyncLog({ id: 10, status: SyncStatus.FAILED });
      const newSyncLog = createMockSyncLog({ id: 11, status: SyncStatus.PENDING });
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(failedSync);
      mockSyncLogRepository.create.mockResolvedValue(newSyncLog);

      const result = await service.triggerSync();

      expect(result.alreadyRunning).toBe(false);
    });

    it('should mark stale syncs as FAILED before checking', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(1);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);
      mockSyncLogRepository.create.mockResolvedValue(createMockSyncLog({ id: 1 }));

      await service.triggerSync();

      expect(mockSyncLogRepository.markStaleAsFailed).toHaveBeenCalledWith(
        30,
        'Sync stale: timeout after 30 minutes',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Stale syncs marked as FAILED', {
        count: 1,
        thresholdMinutes: 30,
      });
    });

    it('should log enqueueing sync job', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);
      mockSyncLogRepository.create.mockResolvedValue(createMockSyncLog({ id: 7 }));

      await service.triggerSync();

      expect(mockLogger.log).toHaveBeenCalledWith('Enqueueing sync job', { syncLogId: 7 });
    });
  });

  describe('getLatestSync', () => {
    it('should return latest sync log', async () => {
      const syncLog = createMockSyncLog({ id: 10 });
      mockSyncLogRepository.findLatest.mockResolvedValue(syncLog);

      const result = await service.getLatestSync();

      expect(result).toBe(syncLog);
    });

    it('should return null when no sync exists', async () => {
      mockSyncLogRepository.findLatest.mockResolvedValue(null);

      const result = await service.getLatestSync();

      expect(result).toBeNull();
    });
  });

  describe('getLatestSyncStatus', () => {
    it('should return null when no sync exists', async () => {
      mockSyncLogRepository.findLatest.mockResolvedValue(null);

      const result = await service.getLatestSyncStatus();

      expect(result).toBeNull();
    });

    it('should return 100% progress for COMPLETED sync', async () => {
      const completedSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.COMPLETED,
        totalProcessed: 1000000,
        durationMs: 1800000,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(completedSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.progressPercent).toBe(100);
    });

    it('should calculate progress percentage correctly', async () => {
      const runningSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.RUNNING,
        totalProcessed: 500000, // 50% of 1M
        startedAt: new Date(),
        finishedAt: null,
        durationMs: null,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.progressPercent).toBe(50);
    });

    it('should cap progress at 99.9% for in-progress sync', async () => {
      const runningSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.RUNNING,
        totalProcessed: 999999,
        startedAt: new Date(),
        finishedAt: null,
        durationMs: null,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.progressPercent).toBeLessThanOrEqual(99.9);
    });

    it('should calculate records per second', async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() - 100000); // 100 seconds ago
      const runningSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.RUNNING,
        totalProcessed: 10000, // 10000 records in 100 seconds = 100/s
        startedAt: startTime,
        finishedAt: null,
        durationMs: null,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.recordsPerSecond).toBeCloseTo(100, 0);
    });

    it('should include batchSize and workerConcurrency from config', async () => {
      const syncLog = createMockSyncLog({ id: 1 });
      mockSyncLogRepository.findLatest.mockResolvedValue(syncLog);

      const result = await service.getLatestSyncStatus();

      expect(result?.batchSize).toBe(1000);
      expect(result?.workerConcurrency).toBe(1);
    });

    it('should format duration correctly', async () => {
      const syncLog = createMockSyncLog({
        id: 1,
        durationMs: 150000, // 2 minutes 30 seconds
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(syncLog);

      const result = await service.getLatestSyncStatus();

      expect(result?.durationFormatted).toBe('2m 30s');
    });

    it('should not calculate estimatedTimeRemaining for COMPLETED sync', async () => {
      const completedSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.COMPLETED,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(completedSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.estimatedTimeRemaining).toBeNull();
    });

    it('should not calculate estimatedTimeRemaining for FAILED sync', async () => {
      const failedSync = createMockSyncLog({
        id: 1,
        status: SyncStatus.FAILED,
      });
      mockSyncLogRepository.findLatest.mockResolvedValue(failedSync);

      const result = await service.getLatestSyncStatus();

      expect(result?.estimatedTimeRemaining).toBeNull();
    });
  });

  describe('getSyncHistory', () => {
    it('should return sync history with default limit', async () => {
      const syncLogs = [
        createMockSyncLog({ id: 1 }),
        createMockSyncLog({ id: 2 }),
      ];
      mockSyncLogRepository.findAll.mockResolvedValue(syncLogs);

      const result = await service.getSyncHistory();

      expect(result).toHaveLength(2);
      expect(mockSyncLogRepository.findAll).toHaveBeenCalledWith(10);
    });

    it('should pass custom limit to repository', async () => {
      mockSyncLogRepository.findAll.mockResolvedValue([]);

      await service.getSyncHistory(5);

      expect(mockSyncLogRepository.findAll).toHaveBeenCalledWith(5);
    });
  });

  describe('handleScheduledSync', () => {
    it('should trigger sync and log the operation', async () => {
      mockSyncLogRepository.markStaleAsFailed.mockResolvedValue(0);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);
      mockSyncLogRepository.create.mockResolvedValue(createMockSyncLog({ id: 1 }));

      await service.handleScheduledSync();

      expect(mockLogger.log).toHaveBeenCalledWith('Running scheduled sync');
      expect(mockSyncLogRepository.create).toHaveBeenCalled();
    });
  });

  describe('resetCurrentSync', () => {
    it('should return null when no sync exists', async () => {
      mockSyncLogRepository.findLatest.mockResolvedValue(null);

      const result = await service.resetCurrentSync();

      expect(result).toBeNull();
    });

    it('should return null when sync is not in progress (COMPLETED)', async () => {
      const completedSync = createMockSyncLog({ status: SyncStatus.COMPLETED });
      mockSyncLogRepository.findLatest.mockResolvedValue(completedSync);

      const result = await service.resetCurrentSync();

      expect(result).toBeNull();
      expect(mockSyncLogRepository.update).not.toHaveBeenCalled();
    });

    it('should return null when sync is not in progress (FAILED)', async () => {
      const failedSync = createMockSyncLog({ status: SyncStatus.FAILED });
      mockSyncLogRepository.findLatest.mockResolvedValue(failedSync);

      const result = await service.resetCurrentSync();

      expect(result).toBeNull();
    });

    it('should reset sync when in PENDING status', async () => {
      const pendingSync = createMockSyncLog({ id: 5, status: SyncStatus.PENDING });
      mockSyncLogRepository.findLatest.mockResolvedValue(pendingSync);
      mockSyncLogRepository.update.mockResolvedValue(pendingSync);

      const result = await service.resetCurrentSync();

      expect(result?.syncLogId).toBe(5);
      expect(result?.previousStatus).toBe(SyncStatus.PENDING);
      expect(result?.message).toBe('Sync reset successfully');
      expect(mockSyncLogRepository.update).toHaveBeenCalledWith(5, {
        status: SyncStatus.FAILED,
        finishedAt: expect.any(Date),
        errorMessage: 'Sync manually cancelled via API',
      });
    });

    it('should reset sync when in RUNNING status', async () => {
      const runningSync = createMockSyncLog({ id: 6, status: SyncStatus.RUNNING });
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);
      mockSyncLogRepository.update.mockResolvedValue(runningSync);

      const result = await service.resetCurrentSync();

      expect(result?.syncLogId).toBe(6);
      expect(result?.previousStatus).toBe(SyncStatus.RUNNING);
    });

    it('should reset sync when in PROCESSING status', async () => {
      const processingSync = createMockSyncLog({ id: 7, status: SyncStatus.PROCESSING });
      mockSyncLogRepository.findLatest.mockResolvedValue(processingSync);
      mockSyncLogRepository.update.mockResolvedValue(processingSync);

      const result = await service.resetCurrentSync();

      expect(result?.syncLogId).toBe(7);
      expect(result?.previousStatus).toBe(SyncStatus.PROCESSING);
    });

    it('should log warning when sync is reset', async () => {
      const runningSync = createMockSyncLog({ id: 8, status: SyncStatus.RUNNING });
      mockSyncLogRepository.findLatest.mockResolvedValue(runningSync);
      mockSyncLogRepository.update.mockResolvedValue(runningSync);

      await service.resetCurrentSync();

      expect(mockLogger.warn).toHaveBeenCalledWith('Sync manually reset', {
        syncLogId: 8,
        previousStatus: SyncStatus.RUNNING,
      });
    });
  });
});
