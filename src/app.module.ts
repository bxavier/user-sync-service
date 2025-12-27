import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { HealthService, SyncService, UserService } from './application/services';
import { EnvironmentVariables, validate } from './infrastructure/config';
import { SyncLogEntity, UserEntity } from './infrastructure/database/entities';
import { TypeOrmLogger } from './infrastructure/database/typeorm-logger';
import { legacyApiProviders } from './infrastructure/legacy/legacy-api.providers';
import { loggerProviders } from './infrastructure/logger/logger.providers';
import { SYNC_BATCH_QUEUE_NAME, SYNC_QUEUE_NAME, SyncBatchProcessor, SyncProcessor } from './infrastructure/queue';
import { repositoriesProviders } from './infrastructure/repositories';
import { HealthController, SyncController, UserController } from './presentation/controllers';

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
          entities: [join(__dirname, 'infrastructure', 'database', 'entities', '*.orm-entity.{ts,js}')],
          synchronize: configService.get('NODE_ENV') !== 'production',
          logging: loggingEnabled,
          logger: loggingEnabled ? new TypeOrmLogger() : undefined,
        };
      },
    }),
    TypeOrmModule.forFeature([UserEntity, SyncLogEntity]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables>) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue({ name: SYNC_QUEUE_NAME }, { name: SYNC_BATCH_QUEUE_NAME }),
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
    ...legacyApiProviders,
    ...loggerProviders,
    UserService,
    SyncService,
    HealthService,
    SyncProcessor,
    SyncBatchProcessor,
  ],
})
export class AppModule {}
