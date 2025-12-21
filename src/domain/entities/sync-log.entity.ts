import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum SyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PROCESSING = 'processing', // Batches enfileirados, aguardando processamento
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, default: SyncStatus.PENDING })
  status: SyncStatus;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'total_processed', type: 'integer', default: 0 })
  totalProcessed: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;
}
