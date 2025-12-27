import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export class ComponentHealthDto {
  @ApiProperty({
    description: 'Component status',
    enum: ['healthy', 'unhealthy', 'degraded'],
    example: 'healthy',
  })
  status: HealthStatus;

  @ApiPropertyOptional({
    description: 'Latency in milliseconds',
    example: 2,
  })
  latencyMs?: number;

  @ApiPropertyOptional({
    description: 'Error or info message',
    example: 'Connection timeout',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Additional component details',
    example: { type: 'sqlite', path: './data/database.sqlite' },
  })
  details?: Record<string, unknown>;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall application status',
    enum: ['healthy', 'unhealthy', 'degraded'],
    example: 'healthy',
  })
  status: HealthStatus;

  @ApiProperty({
    description: 'Check timestamp',
    example: '2025-01-15T10:30:00.000Z',
  })
  timestamp: string;
}
