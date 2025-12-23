import { ApiProperty } from '@nestjs/swagger';
import { SyncStatus } from '../../domain/models';

export class SyncStatusDto {
  @ApiProperty({ description: 'ID do log', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Status da sincronização',
    enum: SyncStatus,
    example: SyncStatus.COMPLETED,
  })
  status: SyncStatus;

  @ApiProperty({ description: 'Data de início' })
  startedAt: Date;

  @ApiProperty({ description: 'Data de término', nullable: true })
  finishedAt: Date | null;

  @ApiProperty({ description: 'Total de registros processados', example: 150 })
  totalProcessed: number;

  @ApiProperty({ description: 'Mensagem de erro', nullable: true })
  errorMessage: string | null;

  @ApiProperty({ description: 'Duração em milissegundos', nullable: true })
  durationMs: number | null;

  @ApiProperty({ description: 'Duração formatada', example: '2m 30s' })
  durationFormatted: string | null;

  @ApiProperty({ description: 'Registros por segundo', example: 625.5 })
  recordsPerSecond: number | null;

  @ApiProperty({ description: 'Tempo estimado restante', example: '5m 20s' })
  estimatedTimeRemaining: string | null;

  @ApiProperty({
    description: 'Percentual de progresso (estimado)',
    example: 75.5,
  })
  progressPercent: number | null;

  @ApiProperty({ description: 'Tamanho do batch', example: 1000 })
  batchSize: number;

  @ApiProperty({ description: 'Número de workers', example: 5 })
  workerConcurrency: number;
}

export class TriggerSyncResponseDto {
  @ApiProperty({ description: 'ID do log de sincronização', example: 1 })
  syncLogId: number;

  @ApiProperty({
    description: 'Mensagem de status',
    example: 'Sincronização iniciada',
  })
  message: string;

  @ApiProperty({
    description: 'Se já havia uma sincronização em andamento',
    example: false,
  })
  alreadyRunning: boolean;
}

export class ResetSyncResponseDto {
  @ApiProperty({
    description: 'ID do log de sincronização resetado',
    example: 1,
  })
  syncLogId: number;

  @ApiProperty({
    description: 'Status anterior da sincronização',
    enum: SyncStatus,
    example: SyncStatus.RUNNING,
  })
  previousStatus: SyncStatus;

  @ApiProperty({
    description: 'Mensagem de confirmação',
    example: 'Sincronização resetada com sucesso',
  })
  message: string;
}
