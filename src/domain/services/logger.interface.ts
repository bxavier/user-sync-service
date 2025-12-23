/**
 * Token de injeção para o serviço de logger.
 * Usado para inversão de dependência (DIP).
 */
export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

/**
 * Contexto adicional para logs estruturados.
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Interface para o serviço de logging.
 * Permite injeção de dependência e substituição em testes.
 */
export interface ILogger {
  /**
   * Registra uma mensagem de log informativa.
   */
  log(message: string, context?: LogContext): void;

  /**
   * Registra uma mensagem de aviso.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Registra uma mensagem de erro.
   */
  error(message: string, context?: LogContext): void;

  /**
   * Registra uma mensagem de debug.
   */
  debug(message: string, context?: LogContext): void;
}
