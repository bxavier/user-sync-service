/**
 * Unit Tests - SyncProcessor
 *
 * Tests the orchestrator that:
 * - Streams users from legacy API
 * - Batches users and enqueues for processing
 * - Updates sync log status
 * - Handles errors and schedules retries
 */

import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { SyncLog, SyncStatus } from '@/domain/models';
import type { SyncLogRepository } from '@/domain/repositories/sync-log.repository.interface';
import type { ILegacyApiClient, ILogger, LegacyUser } from '@/domain/services';
import { SyncProcessor, SyncJobData } from './sync.processor';

describe('SyncProcessor', () => {
  let processor: SyncProcessor;
  let mockLegacyApiClient: jest.Mocked<ILegacyApiClient>;
  let mockSyncLogRepository: jest.Mocked<SyncLogRepository>;
  let mockBatchQueue: jest.Mocked<Queue>;
  let mockSyncQueue: jest.Mocked<Queue>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<ILogger>;

  const createMockJob = (data: SyncJobData): jest.Mocked<Job<SyncJobData>> =>
    ({
      id: 'job-123',
      data,
      updateProgress: jest.fn(),
    }) as unknown as jest.Mocked<Job<SyncJobData>>;

  beforeEach(() => {
    mockLegacyApiClient = {
      fetchUsersStreaming: jest.fn(),
    };

    mockSyncLogRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findLatest: jest.fn(),
      findAll: jest.fn(),
      findStaleSyncs: jest.fn(),
      markStaleAsFailed: jest.fn(),
    };

    mockBatchQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    mockSyncQueue = {
      add: jest.fn(),
      getDelayed: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Queue>;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'SYNC_BATCH_SIZE') return 100; // Small batch for testing
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    processor = new SyncProcessor(
      mockLegacyApiClient,
      mockSyncLogRepository,
      mockBatchQueue,
      mockSyncQueue,
      mockConfigService,
      mockLogger,
    );
  });

  describe('process', () => {
    it('should update sync log to RUNNING at start', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockResolvedValue({
        totalProcessed: 0,
        totalErrors: 0,
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      expect(mockSyncLogRepository.update).toHaveBeenCalledWith(1, {
        status: SyncStatus.RUNNING,
      });
    });

    it('should enqueue batches when batch size is reached', async () => {
      const job = createMockJob({ syncLogId: 1 });

      // Simulate 150 users (should create 2 batches with batchSize=100)
      const users: LegacyUser[] = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        userName: `user_${i}`,
        email: `user${i}@test.com`,
        createdAt: '2024-01-01',
        deleted: false,
      }));

      mockLegacyApiClient.fetchUsersStreaming.mockImplementation(async (onBatch) => {
        await onBatch(users);
        return { totalProcessed: users.length, totalErrors: 0 };
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      // Should enqueue 2 batches (100 + 50)
      expect(mockBatchQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should update sync log to PROCESSING after streaming completes', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockResolvedValue({
        totalProcessed: 0,
        totalErrors: 0,
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      // Last update should be PROCESSING
      const lastCall = mockSyncLogRepository.update.mock.calls.at(-1);
      expect(lastCall?.[1]).toMatchObject({
        status: SyncStatus.PROCESSING,
      });
    });

    it('should return correct result with batch counts', async () => {
      const job = createMockJob({ syncLogId: 1 });

      const users: LegacyUser[] = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        userName: `user_${i}`,
        email: `user${i}@test.com`,
        createdAt: '2024-01-01',
        deleted: false,
      }));

      mockLegacyApiClient.fetchUsersStreaming.mockImplementation(async (onBatch) => {
        await onBatch(users);
        return { totalProcessed: users.length, totalErrors: 0 };
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      const result = await processor.process(job);

      expect(result.syncLogId).toBe(1);
      expect(result.totalBatches).toBe(3); // 100 + 100 + 50
      expect(result.totalEnqueued).toBe(250);
      expect(result.status).toBe(SyncStatus.PROCESSING);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty response', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockResolvedValue({
        totalProcessed: 0,
        totalErrors: 0,
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      const result = await processor.process(job);

      expect(result.totalBatches).toBe(0);
      expect(result.totalEnqueued).toBe(0);
      expect(mockBatchQueue.add).not.toHaveBeenCalled();
    });

    it('should log start and completion', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockResolvedValue({
        totalProcessed: 0,
        totalErrors: 0,
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Starting sync job (orchestrator)',
        expect.objectContaining({ syncLogId: 1 }),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Streaming completed, batches enqueued',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('should update sync log to FAILED on error', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockRejectedValue(new Error('Connection timeout'));
      mockSyncLogRepository.update.mockResolvedValue(null);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow('Connection timeout');

      expect(mockSyncLogRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: 'Connection timeout',
        }),
      );
    });

    it('should log error on failure', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockRejectedValue(new Error('API unavailable'));
      mockSyncLogRepository.update.mockResolvedValue(null);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Streaming error',
        expect.objectContaining({ error: 'API unavailable' }),
      );
    });

    it('should schedule retry on error', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockRejectedValue(new Error('Temporary failure'));
      mockSyncLogRepository.update.mockResolvedValue(null);
      mockSyncLogRepository.findLatest.mockResolvedValue(null);
      mockSyncLogRepository.create.mockResolvedValue(
        new SyncLog({
          id: 2,
          status: SyncStatus.PENDING,
          totalProcessed: 0,
          startedAt: new Date(),
          finishedAt: null,
          errorMessage: null,
          durationMs: null,
        }),
      );

      await expect(processor.process(job)).rejects.toThrow();

      // Wait for async retry scheduling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('should not schedule retry if one is already pending', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockRejectedValue(new Error('Error'));
      mockSyncLogRepository.update.mockResolvedValue(null);
      mockSyncQueue.getDelayed.mockResolvedValue([{ id: 'existing-job' }] as Job[]);

      await expect(processor.process(job)).rejects.toThrow();

      // Wait for async retry scheduling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('should not schedule retry if sync is already in progress', async () => {
      const job = createMockJob({ syncLogId: 1 });

      mockLegacyApiClient.fetchUsersStreaming.mockRejectedValue(new Error('Error'));
      mockSyncLogRepository.update.mockResolvedValue(null);
      mockSyncLogRepository.findLatest.mockResolvedValue(
        new SyncLog({
          id: 3,
          status: SyncStatus.RUNNING,
          totalProcessed: 0,
          startedAt: new Date(),
          finishedAt: null,
          errorMessage: null,
          durationMs: null,
        }),
      );

      await expect(processor.process(job)).rejects.toThrow();

      // Wait for async retry scheduling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('batch enqueueing', () => {
    it('should enqueue batch with correct job options', async () => {
      const job = createMockJob({ syncLogId: 1 });

      const users: LegacyUser[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        userName: `user_${i}`,
        email: `user${i}@test.com`,
        createdAt: '2024-01-01',
        deleted: false,
      }));

      mockLegacyApiClient.fetchUsersStreaming.mockImplementation(async (onBatch) => {
        await onBatch(users);
        return { totalProcessed: users.length, totalErrors: 0 };
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      expect(mockBatchQueue.add).toHaveBeenCalledWith(
        'sync-batch',
        expect.objectContaining({
          syncLogId: 1,
          batchNumber: 0,
        }),
        expect.objectContaining({
          removeOnComplete: 100,
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }),
      );
    });

    it('should log batch enqueuing', async () => {
      const job = createMockJob({ syncLogId: 1 });

      const users: LegacyUser[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        userName: `user_${i}`,
        email: `user${i}@test.com`,
        createdAt: '2024-01-01',
        deleted: false,
      }));

      mockLegacyApiClient.fetchUsersStreaming.mockImplementation(async (onBatch) => {
        await onBatch(users);
        return { totalProcessed: users.length, totalErrors: 0 };
      });
      mockSyncLogRepository.update.mockResolvedValue(null);

      await processor.process(job);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch enqueued',
        expect.objectContaining({
          syncLogId: 1,
          batchNumber: 0,
          usersInBatch: 100,
        }),
      );
    });
  });
});
