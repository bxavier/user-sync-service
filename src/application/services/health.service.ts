import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import type { SyncJobData } from '@/infrastructure/queue';
import { SYNC_QUEUE_NAME } from '@/infrastructure/queue';
import { ComponentHealthDto, HealthResponseDto, HealthStatus } from '@/application/dtos/health-response.dto';

/** Timeout in milliseconds for each health check component */
const COMPONENT_TIMEOUT_MS = 3000;

/**
 * Health check service for liveness/readiness probes.
 * Tests connectivity to critical components (database, Redis).
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue<SyncJobData>,
  ) {}

  /** Checks all components and returns aggregated health status. */
  async check(): Promise<HealthResponseDto> {
    const [dbHealth, redisHealth] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const status = this.determineOverallStatus([dbHealth, redisHealth]);

    return {
      status,
      timestamp: new Date().toISOString(),
    };
  }

  /** Checks SQLite database connectivity. */
  private async checkDatabase(): Promise<ComponentHealthDto> {
    const start = Date.now();
    try {
      await Promise.race([this.dataSource.query('SELECT 1'), this.timeout(COMPONENT_TIMEOUT_MS)]);

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

  /** Checks Redis connectivity via BullMQ queue client. */
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

  /** Aggregates component statuses into overall health status. */
  private determineOverallStatus(criticalComponents: ComponentHealthDto[]): HealthStatus {
    const hasUnhealthyCritical = criticalComponents.some((c) => c.status === 'unhealthy');
    if (hasUnhealthyCritical) {
      return 'unhealthy';
    }

    const hasDegraded = criticalComponents.some((c) => c.status === 'degraded');
    if (hasDegraded) {
      return 'degraded';
    }

    return 'healthy';
  }

  /** Creates a promise that rejects after the specified timeout. */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
  }
}
