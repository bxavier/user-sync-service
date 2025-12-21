import { LoggerService } from '../logger';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
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
  logger?: LoggerService,
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error = new Error('Unknown error');
  let delay = finalConfig.initialDelayMs;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable = isRetryableError(error, finalConfig.retryableErrors);
      const isLastAttempt = attempt === finalConfig.maxAttempts;

      if (!isRetryable || isLastAttempt) {
        logger?.error('Falha definitiva após tentativas', {
          attempt,
          maxAttempts: finalConfig.maxAttempts,
          error: lastError.message,
        });
        throw new RetryError(
          `Falhou após ${attempt} tentativa(s): ${lastError.message}`,
          attempt,
          lastError,
        );
      }

      const waitStart = Date.now();
      logger?.warn('Tentativa falhou, aguardando retry', {
        attempt,
        maxAttempts: finalConfig.maxAttempts,
        nextDelayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
      const waitedMs = Date.now() - waitStart;
      logger?.log(`[RETRY] Esperou ${waitedMs}ms antes de retry ${attempt + 1}`);
      delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelayMs);
    }
  }

  throw new RetryError(
    `Falhou após ${finalConfig.maxAttempts} tentativa(s)`,
    finalConfig.maxAttempts,
    lastError,
  );
}

function isRetryableError(
  error: unknown,
  retryableCodes?: number[],
): boolean {
  if (!retryableCodes) return true;

  // Axios error com response
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
  ) {
    const status = (error as { response: { status: number } }).response.status;
    return retryableCodes.includes(status);
  }

  // Erros de rede (ECONNREFUSED, ETIMEDOUT, etc)
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error
  ) {
    const code = (error as { code: string }).code;
    return ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'].includes(code);
  }

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
