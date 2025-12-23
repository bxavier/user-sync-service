/**
 * Token de injeção para o cliente da API legada.
 * Usado para inversão de dependência (DIP).
 */
export const LEGACY_API_CLIENT = Symbol('LEGACY_API_CLIENT');

/**
 * Representa um usuário retornado pela API legada.
 */
export interface LegacyUser {
  id: number;
  userName: string;
  email: string;
  createdAt: string;
  deleted: boolean;
}

/**
 * Callback executado para cada batch de usuários recebidos.
 */
export type BatchCallback = (users: LegacyUser[]) => Promise<void>;

/**
 * Resultado do streaming de usuários.
 */
export interface StreamingResult {
  totalProcessed: number;
  totalErrors: number;
}

/**
 * Interface para o cliente da API legada.
 * Permite injeção de dependência e substituição em testes.
 */
export interface ILegacyApiClient {
  /**
   * Busca usuários da API legada via streaming.
   * Executa o callback para cada batch de usuários recebidos.
   */
  fetchUsersStreaming(onBatch: BatchCallback): Promise<StreamingResult>;
}
