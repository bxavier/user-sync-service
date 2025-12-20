import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { TypeOrmLogger } from './typeorm-logger';

export const typeOrmConfig = (): TypeOrmModuleOptions => ({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH || './data/database.sqlite',
  entities: [join(__dirname, '..', '..', 'domain', 'entities', '*.entity.{ts,js}')],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV !== 'production',
  logger: new TypeOrmLogger(),
});
