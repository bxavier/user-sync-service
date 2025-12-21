import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  // Application
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  PORT: number = 3000;

  // Database
  @IsString()
  @IsOptional()
  DATABASE_PATH: string = './data/database.sqlite';

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value !== 'false')
  TYPEORM_LOGGING: boolean = true;

  // Redis
  @IsString()
  REDIS_HOST: string;

  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_PORT: number;

  // Legacy API
  @IsString()
  LEGACY_API_URL: string;

  @IsString()
  LEGACY_API_KEY: string;

  // Sync Configuration
  @IsString()
  @IsOptional()
  SYNC_CRON_EXPRESSION: string = '0 */6 * * *';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_RETRY_ATTEMPTS: number = 3;

  @IsInt()
  @Min(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_RETRY_DELAY: number = 1000;

  @IsInt()
  @Min(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_BATCH_SIZE: number = 2000;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_WORKER_CONCURRENCY: number = 20;

  // Rate Limiting
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  RATE_LIMIT_TTL: number = 60;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  RATE_LIMIT_MAX: number = 100;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join(', ')
          : 'unknown error';
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
