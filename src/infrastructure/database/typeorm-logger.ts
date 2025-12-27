import { Logger, QueryRunner } from 'typeorm';
import { LoggerService } from '../logger';

export class TypeOrmLogger implements Logger {
  private readonly logger = new LoggerService('TypeORM');

  logQuery(query: string, parameters?: unknown[], _queryRunner?: QueryRunner) {
    this.logger.debug(query, {
      parameters: parameters?.length ? parameters : undefined,
    });
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    this.logger.error(typeof error === 'string' ? error : error.message, {
      query,
      parameters: parameters?.length ? parameters : undefined,
    });
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ) {
    this.logger.warn(`Slow query (${time}ms)`, {
      query,
      parameters: parameters?.length ? parameters : undefined,
    });
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner) {
    this.logger.log(message);
  }

  logMigration(message: string, _queryRunner?: QueryRunner) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, _queryRunner?: QueryRunner) {
    switch (level) {
      case 'warn':
        this.logger.warn(String(message));
        break;
      default:
        this.logger.log(String(message));
    }
  }
}
