import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResetSyncResponseDto, SyncStatusDto, TriggerSyncResponseDto } from '@/application/dtos';
import { ResetSyncResult, SyncService, TriggerSyncResult } from '@/application/services/sync.service';
import { SyncLog } from '@/domain/models';

@Controller('sync')
@ApiTags('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Triggers synchronization with legacy system' })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Synchronization enqueued',
    type: TriggerSyncResponseDto,
  })
  async triggerSync(): Promise<TriggerSyncResult> {
    return this.syncService.triggerSync();
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Returns latest synchronization status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Latest synchronization status',
    type: SyncStatusDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No synchronization found',
  })
  async getStatus(): Promise<SyncStatusDto> {
    const status = await this.syncService.getLatestSyncStatus();

    if (!status) {
      throw new NotFoundException('No synchronization found');
    }

    return status;
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Returns synchronization history' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of synchronizations',
    type: [SyncStatusDto],
  })
  async getHistory(): Promise<SyncLog[]> {
    return this.syncService.getSyncHistory();
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resets stale synchronization',
    description:
      'Forces the current synchronization (if in PENDING, RUNNING or PROCESSING) to be marked as FAILED. Use when a sync gets stuck.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Synchronization reset successfully',
    type: ResetSyncResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No synchronization in progress to reset',
  })
  async resetSync(): Promise<ResetSyncResult> {
    const result = await this.syncService.resetCurrentSync();

    if (!result) {
      throw new NotFoundException('No synchronization in progress to reset');
    }

    return result;
  }
}
