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
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() !== 'false';
    return true;
  })
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
  @IsInt()
  @Min(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_BATCH_SIZE: number = 1000;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_WORKER_CONCURRENCY: number = 1;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_BATCH_CONCURRENCY: number = 5;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_STALE_THRESHOLD_MINUTES: number = 30;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_ESTIMATED_TOTAL_RECORDS: number = 1_000_000;

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
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

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
