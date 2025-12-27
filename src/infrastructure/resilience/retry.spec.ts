import type { ILogger } from '@/domain/services';
import { RetryError, withRetry } from './retry';

describe('withRetry', () => {
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('successful execution', () => {
    it('should return result on first attempt success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not log anything on immediate success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await withRetry(fn, {}, mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('retry behavior', () => {
    it('should retry after error 500 and succeed', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValueOnce(error500).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith('Retry', expect.any(Object));
    });

    it('should retry after error 429 (rate limit)', async () => {
      const error429 = { response: { status: 429 } };
      const fn = jest.fn().mockRejectedValueOnce(error429).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry for all 5xx errors', async () => {
      const errors = [
        { response: { status: 500 } },
        { response: { status: 502 } },
        { response: { status: 503 } },
        { response: { status: 504 } },
      ];

      const fn = jest
        .fn()
        .mockRejectedValueOnce(errors[0])
        .mockRejectedValueOnce(errors[1])
        .mockRejectedValueOnce(errors[2])
        .mockRejectedValueOnce(errors[3])
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  describe('non-retryable errors', () => {
    it('should not retry on 400 error', async () => {
      const error400 = { response: { status: 400 } };
      const fn = jest.fn().mockRejectedValue(error400);

      await expect(withRetry(fn, {}, mockLogger)).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 error', async () => {
      const error401 = { response: { status: 401 } };
      const fn = jest.fn().mockRejectedValue(error401);

      await expect(withRetry(fn, {}, mockLogger)).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 error', async () => {
      const error404 = { response: { status: 404 } };
      const fn = jest.fn().mockRejectedValue(error404);

      await expect(withRetry(fn, {}, mockLogger)).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors', () => {
    it('should retry on ECONNREFUSED', async () => {
      const networkError = { code: 'ECONNREFUSED' };
      const fn = jest.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on ETIMEDOUT', async () => {
      const networkError = { code: 'ETIMEDOUT' };
      const fn = jest.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
    });

    it('should retry on ENOTFOUND', async () => {
      const networkError = { code: 'ENOTFOUND' };
      const fn = jest.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
    });

    it('should retry on ENETUNREACH', async () => {
      const networkError = { code: 'ENETUNREACH' };
      const fn = jest.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
    });
  });

  describe('max attempts', () => {
    it('should fail after maxAttempts', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValue(error500);

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 }, mockLogger),
      ).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should include attempt count in RetryError', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValue(error500);

      try {
        await withRetry(fn, { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).attempts).toBe(2);
      }
    });

    it('should include last error in RetryError', async () => {
      const originalError = new Error('Original error message');
      const fn = jest.fn().mockRejectedValue(originalError);

      try {
        await withRetry(fn, { maxAttempts: 1 }, mockLogger);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).lastError.message).toBe('Original error message');
      }
    });
  });

  describe('exponential backoff', () => {
    it('should apply exponential backoff with correct delays', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce('success');

      const config = {
        maxAttempts: 5,
        initialDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      const startTime = Date.now();
      await withRetry(fn, config, mockLogger);
      const elapsed = Date.now() - startTime;

      // Delays: 10 + 20 + 40 = 70ms minimum
      expect(fn).toHaveBeenCalledTimes(4);
      expect(elapsed).toBeGreaterThanOrEqual(60); // Allow some tolerance
    });

    it('should cap delay at maxDelayMs', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce('success');

      const config = {
        maxAttempts: 6,
        initialDelayMs: 10,
        maxDelayMs: 20, // Should cap here
        backoffMultiplier: 2,
      };

      const startTime = Date.now();
      await withRetry(fn, config, mockLogger);
      const elapsed = Date.now() - startTime;

      // Delays: 10 + 20 + 20 + 20 = 70ms max (with cap)
      expect(fn).toHaveBeenCalledTimes(5);
      expect(elapsed).toBeLessThan(200); // Should not take too long
    });
  });

  describe('custom configuration', () => {
    it('should use custom retryableErrors', async () => {
      const error418 = { response: { status: 418 } }; // I'm a teapot
      const fn = jest.fn().mockRejectedValueOnce(error418).mockResolvedValueOnce('success');

      const config = {
        retryableErrors: [418],
        initialDelayMs: 1,
        maxDelayMs: 1,
      };

      const result = await withRetry(fn, config, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use default config when not provided', async () => {
      const error500 = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValue(error500);

      // Use minimal delays but default retryable errors
      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 }),
      ).rejects.toThrow(RetryError);

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should convert non-Error throws to Error', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      try {
        await withRetry(fn, { maxAttempts: 1 }, mockLogger);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).lastError.message).toBe('string error');
      }
    });

    it('should log error on definitive failure', async () => {
      const error400 = { response: { status: 400 } };
      const fn = jest.fn().mockRejectedValue(error400);

      await expect(withRetry(fn, {}, mockLogger)).rejects.toThrow(RetryError);

      expect(mockLogger.error).toHaveBeenCalledWith('Definitive failure', expect.any(Object));
    });

    it('should retry errors without status code or network code', async () => {
      const genericError = new Error('Unknown error');
      const fn = jest.fn().mockRejectedValueOnce(genericError).mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 1, maxDelayMs: 1 }, mockLogger);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RetryError', () => {
  it('should have correct name', () => {
    const lastError = new Error('Last error');
    const retryError = new RetryError('Failed after 3 attempts', 3, lastError);

    expect(retryError.name).toBe('RetryError');
  });

  it('should have correct message', () => {
    const lastError = new Error('Last error');
    const retryError = new RetryError('Failed after 3 attempts', 3, lastError);

    expect(retryError.message).toBe('Failed after 3 attempts');
  });

  it('should expose attempts count', () => {
    const lastError = new Error('Last error');
    const retryError = new RetryError('Failed', 5, lastError);

    expect(retryError.attempts).toBe(5);
  });

  it('should expose last error', () => {
    const lastError = new Error('Original failure');
    const retryError = new RetryError('Failed', 3, lastError);

    expect(retryError.lastError).toBe(lastError);
  });

  it('should be an instance of Error', () => {
    const retryError = new RetryError('Failed', 1, new Error());

    expect(retryError).toBeInstanceOf(Error);
  });
});
