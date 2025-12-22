import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import axios from 'axios';
import {
  HealthStatus,
  HealthResponseDto,
  HealthDetailsResponseDto,
  ComponentHealthDto,
  QueueStatsDto,
  LastSyncInfoDto,
} from '../dtos/health-response.dto';
import { SYNC_QUEUE_NAME, SYNC_BATCH_QUEUE_NAME } from '../../infrastructure/queue';
import type { SyncJobData, SyncBatchJobData } from '../../infrastructure/queue';
import { SYNC_LOG_REPOSITORY } from '../../domain/repositories/sync-log.repository.interface';
import type { SyncLogRepository } from '../../domain/repositories/sync-log.repository.interface';

const COMPONENT_TIMEOUT_MS = 3000;
const APP_VERSION = '1.0.0';

@Injectable()
export class HealthService {
  private readonly startTime: number;
  private readonly legacyApiUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
    @InjectQueue(SYNC_BATCH_QUEUE_NAME)
    private readonly batchQueue: Queue<SyncBatchJobData>,
    @Inject(SYNC_LOG_REPOSITORY)
    private readonly syncLogRepository: SyncLogRepository,
  ) {
    this.startTime = Date.now();
    this.legacyApiUrl = this.configService.get<string>(
      'LEGACY_API_URL',
      'http://localhost:3001',
    );
  }

  async check(): Promise<HealthResponseDto> {
    const [dbHealth, redisHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const status = this.determineOverallStatus([dbHealth, redisHealth]);

    return {
      status,
      timestamp: new Date().toISOString(),
    };
  }

  async checkDetails(): Promise<HealthDetailsResponseDto> {
    const [dbHealth, redisHealth, legacyApiHealth, queueStats, lastSync] =
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkLegacyApi(),
        this.getQueueStats(),
        this.getLastSync(),
      ]);

    const criticalComponents = [dbHealth, redisHealth];
    const allComponents = [...criticalComponents, legacyApiHealth];

    const status = this.determineOverallStatus(criticalComponents, allComponents);
    const uptimeMs = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      status,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptime: Math.floor(uptimeMs / 1000),
      uptimeFormatted: this.formatUptime(uptimeMs),
      components: {
        database: dbHealth,
        redis: redisHealth,
        legacyApi: legacyApiHealth,
      },
      system: {
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
        },
        cpuUsage: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
      },
      sync: {
        lastSync,
        queueStats,
      },
    };
  }

  private async checkDatabase(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        this.timeout(COMPONENT_TIMEOUT_MS),
      ]);

      const latencyMs = Date.now() - start;
      const databasePath = this.configService.get<string>('DATABASE_PATH');

      return {
        status: 'healthy',
        latencyMs,
        details: {
          type: 'sqlite',
          path: databasePath,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      const client = await this.syncQueue.client;

      await Promise.race([client.ping(), this.timeout(COMPONENT_TIMEOUT_MS)]);

      const latencyMs = Date.now() - start;
      const redisHost = this.configService.get<string>('REDIS_HOST');
      const redisPort = this.configService.get<number>('REDIS_PORT');

      return {
        status: 'healthy',
        latencyMs,
        details: {
          host: redisHost,
          port: redisPort,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Redis check failed',
      };
    }
  }

  private async checkLegacyApi(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      await Promise.race([
        axios.head(this.legacyApiUrl, { timeout: COMPONENT_TIMEOUT_MS }),
        this.timeout(COMPONENT_TIMEOUT_MS),
      ]);

      const latencyMs = Date.now() - start;

      return {
        status: 'healthy',
        latencyMs,
        details: {
          url: this.legacyApiUrl,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;

      // API legada indisponível não é crítico, apenas degrada o status
      return {
        status: 'degraded',
        latencyMs,
        message: error instanceof Error ? error.message : 'Legacy API check failed',
        details: {
          url: this.legacyApiUrl,
        },
      };
    }
  }

  private async getQueueStats(): Promise<QueueStatsDto> {
    try {
      const [syncCounts, batchCounts] = await Promise.all([
        this.syncQueue.getJobCounts(),
        this.batchQueue.getJobCounts(),
      ]);

      return {
        waiting: syncCounts.waiting + batchCounts.waiting,
        active: syncCounts.active + batchCounts.active,
        completed: syncCounts.completed + batchCounts.completed,
        failed: syncCounts.failed + batchCounts.failed,
        delayed: syncCounts.delayed + batchCounts.delayed,
      };
    } catch {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  private async getLastSync(): Promise<LastSyncInfoDto | null> {
    try {
      const syncLog = await this.syncLogRepository.findLatest();

      if (!syncLog) {
        return null;
      }

      return {
        id: syncLog.id,
        status: syncLog.status,
        totalProcessed: syncLog.totalProcessed,
        durationMs: syncLog.durationMs ?? undefined,
        startedAt: syncLog.startedAt,
        finishedAt: syncLog.finishedAt ?? undefined,
      };
    } catch {
      return null;
    }
  }

  private determineOverallStatus(
    criticalComponents: ComponentHealthDto[],
    allComponents?: ComponentHealthDto[],
  ): HealthStatus {
    // Se algum componente crítico está unhealthy, retorna unhealthy
    const hasUnhealthyCritical = criticalComponents.some(
      (c) => c.status === 'unhealthy',
    );
    if (hasUnhealthyCritical) {
      return 'unhealthy';
    }

    // Se algum componente (crítico ou não) está degraded, retorna degraded
    const componentsToCheck = allComponents || criticalComponents;
    const hasDegraded = componentsToCheck.some((c) => c.status === 'degraded');
    if (hasDegraded) {
      return 'degraded';
    }

    return 'healthy';
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }
}
