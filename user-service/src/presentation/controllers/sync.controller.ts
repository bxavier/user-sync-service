import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { SyncService, TriggerSyncResult } from '../../application/services/sync.service';
import { SyncLog, SyncStatus } from '../../domain/entities';

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
  async getStatus(): Promise<SyncLog | null> {
    return this.syncService.getLatestSync();
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
