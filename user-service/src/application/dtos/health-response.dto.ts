import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export class ComponentHealthDto {
  @ApiProperty({
    description: 'Status do componente',
    enum: ['healthy', 'unhealthy', 'degraded'],
    example: 'healthy',
  })
  status: HealthStatus;

  @ApiPropertyOptional({
    description: 'Latência em milissegundos',
    example: 2,
  })
  latencyMs?: number;

  @ApiPropertyOptional({
    description: 'Mensagem de erro ou informação',
    example: 'Connection timeout',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Detalhes adicionais do componente',
    example: { type: 'sqlite', path: './data/database.sqlite' },
  })
  details?: Record<string, unknown>;
}

export class HealthResponseDto {
  @ApiProperty({
    description: 'Status geral da aplicação',
    enum: ['healthy', 'unhealthy', 'degraded'],
    example: 'healthy',
  })
  status: HealthStatus;

  @ApiProperty({
    description: 'Timestamp da verificação',
    example: '2025-01-15T10:30:00.000Z',
  })
  timestamp: string;
}

export class MemoryUsageDto {
  @ApiProperty({ description: 'Heap usado em bytes', example: 52428800 })
  heapUsed: number;

  @ApiProperty({ description: 'Heap total em bytes', example: 67108864 })
  heapTotal: number;

  @ApiProperty({ description: 'RSS em bytes', example: 89128960 })
  rss: number;

  @ApiProperty({ description: 'Memória externa em bytes', example: 1048576 })
  external: number;
}

export class SystemInfoDto {
  @ApiProperty({ description: 'Uso de memória' })
  memoryUsage: MemoryUsageDto;

  @ApiProperty({
    description: 'Uso de CPU (tempo em microsegundos)',
    example: { user: 1234567, system: 987654 },
  })
  cpuUsage: { user: number; system: number };
}

export class QueueStatsDto {
  @ApiProperty({ description: 'Jobs aguardando', example: 0 })
  waiting: number;

  @ApiProperty({ description: 'Jobs em execução', example: 0 })
  active: number;

  @ApiProperty({ description: 'Jobs concluídos', example: 1500 })
  completed: number;

  @ApiProperty({ description: 'Jobs falhos', example: 2 })
  failed: number;

  @ApiProperty({ description: 'Jobs atrasados', example: 0 })
  delayed: number;
}

export class LastSyncInfoDto {
  @ApiProperty({ description: 'ID da sincronização', example: 42 })
  id: number;

  @ApiProperty({
    description: 'Status da sincronização',
    example: 'COMPLETED',
  })
  status: string;

  @ApiProperty({
    description: 'Total de registros processados',
    example: 150000,
  })
  totalProcessed: number;

  @ApiPropertyOptional({
    description: 'Duração em milissegundos',
    example: 180000,
  })
  durationMs?: number;

  @ApiProperty({ description: 'Data de início' })
  startedAt: Date;

  @ApiPropertyOptional({ description: 'Data de término' })
  finishedAt?: Date;
}

export class SyncInfoDto {
  @ApiPropertyOptional({ description: 'Última sincronização' })
  lastSync: LastSyncInfoDto | null;

  @ApiProperty({ description: 'Estatísticas das filas' })
  queueStats: QueueStatsDto;
}

export class ComponentsHealthDto {
  @ApiProperty({ description: 'Status do banco de dados' })
  database: ComponentHealthDto;

  @ApiProperty({ description: 'Status do Redis' })
  redis: ComponentHealthDto;

  @ApiProperty({ description: 'Status da API legada' })
  legacyApi: ComponentHealthDto;
}

export class HealthDetailsResponseDto {
  @ApiProperty({
    description: 'Status geral da aplicação',
    enum: ['healthy', 'unhealthy', 'degraded'],
    example: 'healthy',
  })
  status: HealthStatus;

  @ApiProperty({
    description: 'Timestamp da verificação',
    example: '2025-01-15T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Versão da aplicação',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'Uptime em segundos',
    example: 86400,
  })
  uptime: number;

  @ApiProperty({
    description: 'Uptime formatado',
    example: '1d 0h 0m',
  })
  uptimeFormatted: string;

  @ApiProperty({ description: 'Status de cada componente' })
  components: ComponentsHealthDto;

  @ApiProperty({ description: 'Informações do sistema' })
  system: SystemInfoDto;

  @ApiPropertyOptional({ description: 'Informações de sincronização' })
  sync?: SyncInfoDto;
}
