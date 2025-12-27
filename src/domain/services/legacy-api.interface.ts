/**
 * Injection token for the legacy API client.
 * Used for dependency inversion (DIP).
 */
export const LEGACY_API_CLIENT = Symbol('LEGACY_API_CLIENT');

/**
 * Represents a user returned by the legacy API.
 */
export interface LegacyUser {
  id: number;
  userName: string;
  email: string;
  createdAt: string;
  deleted: boolean;
}

/**
 * Callback executed for each batch of received users.
 */
export type BatchCallback = (users: LegacyUser[]) => Promise<void>;

/**
 * User streaming result.
 */
export interface StreamingResult {
  totalProcessed: number;
  totalErrors: number;
}

/**
 * Interface for the legacy API client.
 * Allows dependency injection and substitution in tests.
 */
export interface ILegacyApiClient {
  /**
   * Fetches users from the legacy API via streaming.
   * Executes the callback for each batch of received users.
   */
  fetchUsersStreaming(onBatch: BatchCallback): Promise<StreamingResult>;
}
