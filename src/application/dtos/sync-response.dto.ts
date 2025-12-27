import { ApiProperty } from '@nestjs/swagger';
import { SyncStatus } from '@/domain/models';

export class SyncStatusDto {
  @ApiProperty({ description: 'Log ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Synchronization status',
    enum: SyncStatus,
    example: SyncStatus.COMPLETED,
  })
  status: SyncStatus;

  @ApiProperty({ description: 'Start date' })
  startedAt: Date;

  @ApiProperty({ description: 'End date', nullable: true })
  finishedAt: Date | null;

  @ApiProperty({ description: 'Total records processed', example: 150 })
  totalProcessed: number;

  @ApiProperty({ description: 'Error message', nullable: true })
  errorMessage: string | null;

  @ApiProperty({ description: 'Duration in milliseconds', nullable: true })
  durationMs: number | null;

  @ApiProperty({ description: 'Formatted duration', example: '2m 30s' })
  durationFormatted: string | null;

  @ApiProperty({ description: 'Records per second', example: 625.5 })
  recordsPerSecond: number | null;

  @ApiProperty({ description: 'Estimated time remaining', example: '5m 20s' })
  estimatedTimeRemaining: string | null;

  @ApiProperty({
    description: 'Progress percentage (estimated)',
    example: 75.5,
  })
  progressPercent: number | null;

  @ApiProperty({ description: 'Batch size', example: 1000 })
  batchSize: number;

  @ApiProperty({ description: 'Number of workers', example: 5 })
  workerConcurrency: number;
}

export class TriggerSyncResponseDto {
  @ApiProperty({ description: 'Synchronization log ID', example: 1 })
  syncLogId: number;

  @ApiProperty({
    description: 'Status message',
    example: 'Sync started',
  })
  message: string;

  @ApiProperty({
    description: 'Whether there was already a synchronization in progress',
    example: false,
  })
  alreadyRunning: boolean;
}

export class ResetSyncResponseDto {
  @ApiProperty({
    description: 'Reset synchronization log ID',
    example: 1,
  })
  syncLogId: number;

  @ApiProperty({
    description: 'Previous synchronization status',
    enum: SyncStatus,
    example: SyncStatus.RUNNING,
  })
  previousStatus: SyncStatus;

  @ApiProperty({
    description: 'Confirmation message',
    example: 'Sync reset successfully',
  })
  message: string;
}
