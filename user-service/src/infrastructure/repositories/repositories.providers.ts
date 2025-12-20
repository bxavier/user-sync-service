import { Provider } from '@nestjs/common';
import { USER_REPOSITORY, SYNC_LOG_REPOSITORY } from '../../domain/repositories';
import { UserRepositoryImpl } from './user.repository';
import { SyncLogRepositoryImpl } from './sync-log.repository';

export const repositoriesProviders: Provider[] = [
  {
    provide: USER_REPOSITORY,
    useClass: UserRepositoryImpl,
  },
  {
    provide: SYNC_LOG_REPOSITORY,
    useClass: SyncLogRepositoryImpl,
  },
];
