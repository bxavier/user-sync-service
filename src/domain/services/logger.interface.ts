/**
 * Injection token for the logger service.
 * Used for dependency inversion (DIP).
 */
export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

/**
 * Additional context for structured logs.
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Interface for the logging service.
 * Allows dependency injection and substitution in tests.
 */
export interface ILogger {
  /**
   * Logs an informational message.
   */
  log(message: string, context?: LogContext): void;

  /**
   * Logs a warning message.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Logs an error message.
   */
  error(message: string, context?: LogContext): void;

  /**
   * Logs a debug message.
   */
  debug(message: string, context?: LogContext): void;
}
