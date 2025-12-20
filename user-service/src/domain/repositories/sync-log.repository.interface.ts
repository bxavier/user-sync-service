import { SyncLog, SyncStatus } from '../entities';

export interface CreateSyncLogData {
  status?: SyncStatus;
}

export interface UpdateSyncLogData {
  status?: SyncStatus;
  finishedAt?: Date;
  totalProcessed?: number;
  errorMessage?: string | null;
  durationMs?: number;
}

export const SYNC_LOG_REPOSITORY = Symbol('SYNC_LOG_REPOSITORY');

export interface SyncLogRepository {
  create(data?: CreateSyncLogData): Promise<SyncLog>;
  update(id: number, data: UpdateSyncLogData): Promise<SyncLog | null>;
  findById(id: number): Promise<SyncLog | null>;
  findLatest(): Promise<SyncLog | null>;
  findAll(limit?: number): Promise<SyncLog[]>;
}
