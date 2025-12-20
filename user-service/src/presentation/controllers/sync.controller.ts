import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { SyncService, TriggerSyncResult } from '../../application/services/sync.service';
import { SyncLog, SyncStatus } from '../../domain/entities';
import { BATCH_SIZE, WORKER_CONCURRENCY } from '../../infrastructure/queue/sync.constants';

class SyncTriggerResponseDto implements TriggerSyncResult {
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

class SyncStatusResponseDto {
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

  @ApiProperty({ description: 'Percentual de progresso (estimado)', example: 75.5 })
  progressPercent: number | null;

  @ApiProperty({ description: 'Tamanho do batch', example: 100 })
  batchSize: number;

  @ApiProperty({ description: 'Número de workers', example: 50 })
  workerConcurrency: number;
}

@Controller('sync')
@ApiTags('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Dispara sincronização com sistema legado' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Sincronização enfileirada',
    type: SyncTriggerResponseDto,
  })
  async triggerSync(): Promise<TriggerSyncResult> {
    return this.syncService.triggerSync();
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retorna status da última sincronização' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Status da última sincronização',
    type: SyncStatusResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nenhuma sincronização encontrada',
  })
  async getStatus(): Promise<SyncStatusResponseDto | null> {
    const syncLog = await this.syncService.getLatestSync();
    if (!syncLog) return null;

    const now = Date.now();
    const startTime = new Date(syncLog.startedAt).getTime();
    const elapsedMs = syncLog.durationMs ?? (now - startTime);
    const elapsedSeconds = elapsedMs / 1000;

    const recordsPerSecond =
      elapsedSeconds > 0
        ? Math.round((syncLog.totalProcessed / elapsedSeconds) * 10) / 10
        : null;

    // Estima 1M de registros como total (baseado no conhecimento do sistema)
    const estimatedTotal = 1_000_000;
    const progressPercent =
      syncLog.status === SyncStatus.COMPLETED
        ? 100
        : Math.min(
            Math.round((syncLog.totalProcessed / estimatedTotal) * 1000) / 10,
            99.9,
          );

    let estimatedTimeRemaining: string | null = null;
    if (
      recordsPerSecond &&
      recordsPerSecond > 0 &&
      syncLog.status !== SyncStatus.COMPLETED &&
      syncLog.status !== SyncStatus.FAILED
    ) {
      const remaining = estimatedTotal - syncLog.totalProcessed;
      const secondsRemaining = remaining / recordsPerSecond;
      estimatedTimeRemaining = this.formatDuration(secondsRemaining * 1000);
    }

    return {
      id: syncLog.id,
      status: syncLog.status,
      startedAt: syncLog.startedAt,
      finishedAt: syncLog.finishedAt,
      totalProcessed: syncLog.totalProcessed,
      errorMessage: syncLog.errorMessage,
      durationMs: syncLog.durationMs ?? elapsedMs,
      durationFormatted: this.formatDuration(elapsedMs),
      recordsPerSecond,
      estimatedTimeRemaining,
      progressPercent,
      batchSize: BATCH_SIZE,
      workerConcurrency: WORKER_CONCURRENCY,
    };
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retorna histórico de sincronizações' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de sincronizações',
    type: [SyncStatusResponseDto],
  })
  async getHistory(): Promise<SyncLog[]> {
    return this.syncService.getSyncHistory();
  }
}
