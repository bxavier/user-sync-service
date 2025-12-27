/** Sync status: PENDING → RUNNING → PROCESSING → COMPLETED/FAILED */
export enum SyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Statuses that indicate sync is still active */
const IN_PROGRESS_STATUSES = [SyncStatus.PENDING, SyncStatus.RUNNING, SyncStatus.PROCESSING];

/** Properties for SyncLog domain model. */
export interface SyncLogProps {
  id?: number;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  totalProcessed: number;
  errorMessage: string | null;
  durationMs: number | null;
}

/** Pure domain model for sync operation log (no ORM dependencies). */
export class SyncLog {
  /** @param props - SyncLog properties (immutable after construction) */
  constructor(private readonly props: SyncLogProps) {}

  /**
   * Checks if sync is currently in progress (for idempotency).
   * @param sync - Sync log to check (can be null)
   * @returns true if sync is active (PENDING, RUNNING, or PROCESSING)
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

  /**
   * Converts to plain object for serialization.
   * @returns Shallow copy of sync log properties
   */
  toPlainObject(): SyncLogProps {
    return { ...this.props };
  }
}
