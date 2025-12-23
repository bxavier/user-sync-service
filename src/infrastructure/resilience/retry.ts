import type { ILogger } from '../../domain/services';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 10,
  initialDelayMs: 100,
  maxDelayMs: 500,
  backoffMultiplier: 1.5,
  retryableErrors: [429, 500, 502, 503, 504],
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: ILogger,
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error = new Error('Unknown error');
  let delay = cfg.initialDelayMs;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error, cfg.retryableErrors) || attempt === cfg.maxAttempts) {
        logger?.error('Falha definitiva', { attempt, error: lastError.message });
        throw new RetryError(`Falhou após ${attempt} tentativa(s)`, attempt, lastError);
      }

      logger?.warn('Retry', { attempt, delay, error: lastError.message });
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
    }
  }

  throw new RetryError(`Falhou após ${cfg.maxAttempts} tentativa(s)`, cfg.maxAttempts, lastError);
}

function isRetryableError(error: unknown, retryableCodes?: number[]): boolean {
  if (!retryableCodes) return true;

  // Axios error
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') {
    return retryableCodes.includes(status);
  }

  // Network errors
  const code = (error as { code?: string })?.code;
  if (code) {
    return ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'].includes(code);
  }

  return true;
}
