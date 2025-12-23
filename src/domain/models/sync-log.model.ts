export enum SyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

const IN_PROGRESS_STATUSES = [
  SyncStatus.PENDING,
  SyncStatus.RUNNING,
  SyncStatus.PROCESSING,
];

export interface SyncLogProps {
  id?: number;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  totalProcessed: number;
  errorMessage: string | null;
  durationMs: number | null;
}

/**
 * Modelo de domínio puro para SyncLog.
 * Não contém decoradores de ORM - representa apenas a lógica de negócio.
 */
export class SyncLog {
  constructor(private readonly props: SyncLogProps) {}

  /**
   * Verifica se uma sync está em andamento (PENDING, RUNNING ou PROCESSING)
   */
  static isInProgress(sync: SyncLog | null): boolean {
    return sync !== null && IN_PROGRESS_STATUSES.includes(sync.status);
  }

  get id(): number | undefined {
    return this.props.id;
  }

  get status(): SyncStatus {
    return this.props.status;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get totalProcessed(): number {
    return this.props.totalProcessed;
  }

  get errorMessage(): string | null {
    return this.props.errorMessage;
  }

  get durationMs(): number | null {
    return this.props.durationMs;
  }

  toPlainObject(): SyncLogProps {
    return { ...this.props };
  }
}
