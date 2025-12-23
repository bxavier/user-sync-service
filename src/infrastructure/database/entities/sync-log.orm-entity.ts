import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { SyncStatus } from '../../../domain/models';

/**
 * Entidade ORM para SyncLog.
 * Contém decoradores TypeORM para mapeamento com banco de dados.
 * Separada do modelo de domínio para respeitar Separation of Concerns.
 *
 * Nota: O enum SyncStatus e o método isInProgress() estão no modelo de domínio.
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
