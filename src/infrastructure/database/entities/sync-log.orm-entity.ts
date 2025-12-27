import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SyncStatus } from '@/domain/models';

/**
 * ORM Entity for SyncLog.
 * Contains TypeORM decorators for database mapping.
 * Separated from domain model to respect Separation of Concerns.
 *
 * Note: SyncStatus enum and isInProgress() method are in the domain model.
 */
@Entity('sync_logs')
export class SyncLogEntity {
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
