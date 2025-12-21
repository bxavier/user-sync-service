import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  SyncService,
  TriggerSyncResult,
  ResetSyncResult,
} from '../../application/services/sync.service';
import { SyncLog } from '../../domain/entities';
import {
  SyncStatusDto,
  TriggerSyncResponseDto,
  ResetSyncResponseDto,
} from '../../application/dtos';

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
    type: TriggerSyncResponseDto,
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
    type: SyncStatusDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Nenhuma sincronização encontrada',
  })
  async getStatus(): Promise<SyncStatusDto | null> {
    return this.syncService.getLatestSyncStatus();
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retorna histórico de sincronizações' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de sincronizações',
    type: [SyncStatusDto],
  })
  async getHistory(): Promise<SyncLog[]> {
    return this.syncService.getSyncHistory();
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reseta sincronização travada',
    description:
      'Força a sincronização atual (se estiver em PENDING, RUNNING ou PROCESSING) a ser marcada como FAILED. Use quando uma sync ficar travada.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sincronização resetada com sucesso',
    type: ResetSyncResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Nenhuma sincronização em andamento para resetar',
  })
  async resetSync(): Promise<ResetSyncResult> {
    const result = await this.syncService.resetCurrentSync();

    if (!result) {
      throw new NotFoundException(
        'Nenhuma sincronização em andamento para resetar',
      );
    }

    return result;
  }
}
