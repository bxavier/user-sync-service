import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { SYNC_QUEUE_NAME } from '@/infrastructure/queue';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSyncQueue: { client: Promise<{ ping: jest.Mock }> };
  let mockRedisClient: { ping: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as jest.Mocked<DataSource>;

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string | number> = {
          DATABASE_PATH: './data/database.sqlite',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockSyncQueue = {
      client: Promise.resolve(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(SYNC_QUEUE_NAME), useValue: mockSyncQueue },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('check (basic health)', () => {
    it('should return healthy when DB and Redis are available', async () => {
      const result = await service.check();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
    });

    it('should return unhealthy when database fails', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection refused'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy when Redis fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
    });

    it('should include timestamp in ISO format', async () => {
      const result = await service.check();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

});
