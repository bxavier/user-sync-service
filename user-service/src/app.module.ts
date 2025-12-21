import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { validate, EnvironmentVariables } from './infrastructure/config';
import { TypeOrmLogger } from './infrastructure/database/typeorm-logger';
import { User, SyncLog } from './domain/entities';
import { repositoriesProviders } from './infrastructure/repositories';
import { UserController, SyncController, HealthController } from './presentation/controllers';
import { UserService, SyncService, HealthService } from './application/services';
import {
  SYNC_QUEUE_NAME,
  SYNC_BATCH_QUEUE_NAME,
  SYNC_RETRY_QUEUE_NAME,
  SyncProcessor,
  SyncBatchProcessor,
  SyncRetryProcessor,
} from './infrastructure/queue';
import { LegacyApiClient } from './infrastructure/legacy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => {
        const loggingEnabled = configService.get('TYPEORM_LOGGING', true);
        return {
          type: 'better-sqlite3',
          database: configService.get('DATABASE_PATH'),
          entities: [
            join(__dirname, 'domain', 'entities', '*.entity.{ts,js}'),
          ],
          synchronize:
            configService.get('NODE_ENV') !== 'production',
          logging: loggingEnabled,
          logger: loggingEnabled ? new TypeOrmLogger() : undefined,
        };
      },
    }),
    TypeOrmModule.forFeature([User, SyncLog]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: SYNC_QUEUE_NAME },
      { name: SYNC_BATCH_QUEUE_NAME },
      { name: SYNC_RETRY_QUEUE_NAME },
    ),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => [
        {
          ttl: configService.get('RATE_LIMIT_TTL', 60) * 1000,
          limit: configService.get('RATE_LIMIT_MAX', 100),
        },
      ],
    }),
  ],
  controllers: [UserController, SyncController, HealthController],
  providers: [
    ...repositoriesProviders,
    UserService,
    SyncService,
    HealthService,
    SyncProcessor,
    SyncBatchProcessor,
    SyncRetryProcessor,
    LegacyApiClient,
  ],
})
export class AppModule {}
