import { Provider } from '@nestjs/common';
import { SYNC_LOG_REPOSITORY, USER_REPOSITORY } from '@/domain/repositories';
import { TypeOrmSyncLogRepository } from './sync-log.repository';
import { TypeOrmUserRepository } from './user.repository';

export const repositoriesProviders: Provider[] = [
  {
    provide: USER_REPOSITORY,
    useClass: TypeOrmUserRepository,
  },
  {
    provide: SYNC_LOG_REPOSITORY,
    useClass: TypeOrmSyncLogRepository,
  },
];
