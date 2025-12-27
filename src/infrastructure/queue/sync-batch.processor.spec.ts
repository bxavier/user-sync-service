/**
 * Unit Tests - SyncBatchProcessor
 *
 * Tests the batch processor that:
 * - Receives batches of users from the queue
 * - Converts legacy data using UserMapper
 * - Bulk upserts to database
 * - Handles errors gracefully
 */

import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import type { UserRepository } from '@/domain/repositories/user.repository.interface';
import type { ILogger, LegacyUser } from '@/domain/services';
import { UserMapper } from '@/infrastructure/database/mappers';
import type { SyncBatchJobData } from './sync-batch.processor';

// Mock the WorkerHost before importing processor
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => jest.fn(),
  WorkerHost: class MockWorkerHost {
    worker = { concurrency: 1 };
  },
}));

// Import after mocking
import { SyncBatchProcessor } from './sync-batch.processor';

describe('SyncBatchProcessor', () => {
  let processor: SyncBatchProcessor;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<ILogger>;

  const createMockJob = (data: SyncBatchJobData): jest.Mocked<Job<SyncBatchJobData>> =>
    ({
      id: 'batch-job-123',
      data,
    }) as unknown as jest.Mocked<Job<SyncBatchJobData>>;

  const createLegacyUsers = (count: number): LegacyUser[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      userName: `user_${i}`,
      email: `user${i}@test.com`,
      createdAt: '2024-01-01T00:00:00Z',
      deleted: false,
    }));

  beforeEach(() => {
    mockUserRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByUserName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      upsertByLegacyId: jest.fn(),
      bulkUpsertByUserName: jest.fn(),
      findAllForExport: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: number) => {
        if (key === 'SYNC_BATCH_CONCURRENCY') return 5;
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    processor = new SyncBatchProcessor(mockUserRepository, mockConfigService, mockLogger);
  });

  describe('onModuleInit', () => {
    it('should configure worker concurrency from config', () => {
      processor.onModuleInit();

      expect((processor as unknown as { worker: { concurrency: number } }).worker.concurrency).toBe(
        5,
      );
    });

    it('should log the configured concurrency', () => {
      processor.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch processor configured with concurrency: 5',
      );
    });

    it('should use default concurrency when not configured', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: number) => {
        if (key === 'SYNC_BATCH_CONCURRENCY') return defaultValue;
        return defaultValue;
      });

      processor.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('concurrency'),
      );
    });
  });

  describe('process', () => {
    it('should call bulkUpsertByUserName with mapped data', async () => {
      const users = createLegacyUsers(10);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(10);

      await processor.process(job);

      expect(mockUserRepository.bulkUpsertByUserName).toHaveBeenCalledTimes(1);
      expect(mockUserRepository.bulkUpsertByUserName).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            legacyId: 1,
            userName: 'user_0',
            email: 'user0@test.com',
            deleted: false,
          }),
        ]),
      );
    });

    it('should return correct result', async () => {
      const users = createLegacyUsers(50);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 3,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(50);

      const result = await processor.process(job);

      expect(result).toEqual({
        syncLogId: 1,
        batchNumber: 3,
        processedCount: 50,
        durationMs: expect.any(Number),
      });
    });

    it('should log batch processing start', async () => {
      const users = createLegacyUsers(25);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 2,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(25);

      await processor.process(job);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Processing batch',
        expect.objectContaining({
          syncLogId: 1,
          batchNumber: 2,
          usersCount: 25,
          jobId: 'batch-job-123',
        }),
      );
    });

    it('should log batch completion', async () => {
      const users = createLegacyUsers(25);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 2,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(25);

      await processor.process(job);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Batch processed successfully',
        expect.objectContaining({
          syncLogId: 1,
          batchNumber: 2,
          processedCount: 25,
        }),
      );
    });

    it('should include durationMs in result', async () => {
      const users = createLegacyUsers(10);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(10);

      const result = await processor.process(job);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should log error on failure', async () => {
      const users = createLegacyUsers(10);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockRejectedValue(new Error('Database error'));

      await expect(processor.process(job)).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing batch',
        expect.objectContaining({
          syncLogId: 1,
          batchNumber: 0,
          error: 'Database error',
        }),
      );
    });

    it('should rethrow error after logging', async () => {
      const users = createLegacyUsers(10);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      const originalError = new Error('Connection lost');
      mockUserRepository.bulkUpsertByUserName.mockRejectedValue(originalError);

      await expect(processor.process(job)).rejects.toThrow(originalError);
    });

    it('should handle non-Error objects', async () => {
      const users = createLegacyUsers(10);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockRejectedValue('String error');

      await expect(processor.process(job)).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing batch',
        expect.objectContaining({
          error: 'Unknown error',
        }),
      );
    });
  });

  describe('data mapping', () => {
    it('should correctly map legacy user data', async () => {
      const users: LegacyUser[] = [
        {
          id: 100,
          userName: 'john_doe',
          email: 'john@example.com',
          createdAt: '2024-06-15T10:30:00Z',
          deleted: true,
        },
      ];
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(1);

      await processor.process(job);

      expect(mockUserRepository.bulkUpsertByUserName).toHaveBeenCalledWith([
        expect.objectContaining({
          legacyId: 100,
          userName: 'john_doe',
          email: 'john@example.com',
          deleted: true,
          legacyCreatedAt: expect.any(Date),
        }),
      ]);
    });

    it('should handle empty batch', async () => {
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users: [],
      });

      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(0);

      const result = await processor.process(job);

      expect(result.processedCount).toBe(0);
      expect(mockUserRepository.bulkUpsertByUserName).toHaveBeenCalledWith([]);
    });

    it('should use UserMapper.fromLegacyBatch', async () => {
      const users = createLegacyUsers(5);
      const job = createMockJob({
        syncLogId: 1,
        batchNumber: 0,
        users,
      });

      const mapperSpy = jest.spyOn(UserMapper, 'fromLegacyBatch');
      mockUserRepository.bulkUpsertByUserName.mockResolvedValue(5);

      await processor.process(job);

      expect(mapperSpy).toHaveBeenCalledWith(users);
      mapperSpy.mockRestore();
    });
  });
});
