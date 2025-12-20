import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { typeOrmConfig } from './infrastructure/database/typeorm.config';
import { User, SyncLog } from './domain/entities';
import { repositoriesProviders } from './infrastructure/repositories';
import { UserController, SyncController } from './presentation/controllers';
import { UserService, SyncService } from './application/services';
import {
  SYNC_QUEUE_NAME,
  SYNC_BATCH_QUEUE_NAME,
  SyncProcessor,
  SyncBatchProcessor,
} from './infrastructure/queue';
import { LegacyApiClient } from './infrastructure/legacy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(typeOrmConfig()),
    TypeOrmModule.forFeature([User, SyncLog]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue(
      { name: SYNC_QUEUE_NAME },
      { name: SYNC_BATCH_QUEUE_NAME },
    ),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),
  ],
  controllers: [UserController, SyncController],
  providers: [
    ...repositoriesProviders,
    UserService,
    SyncService,
    SyncProcessor,
    SyncBatchProcessor,
    LegacyApiClient,
  ],
})
export class AppModule {}
