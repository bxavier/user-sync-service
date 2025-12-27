import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let dateNowSpy: jest.SpyInstance;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  const advanceTime = (ms: number) => {
    currentTime += ms;
  };

  describe('initial state', () => {
    it('should start in CLOSED state (allowing requests)', async () => {
      const cb = new CircuitBreaker('test');
      const fn = jest.fn().mockResolvedValue('success');

      const result = await cb.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful execution', () => {
    it('should return the function result on success', async () => {
      const cb = new CircuitBreaker('test');
      const fn = jest.fn().mockResolvedValue({ data: 'test' });

      const result = await cb.execute(fn);

      expect(result).toEqual({ data: 'test' });
    });

    it('should reset failure count after success', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3, timeoutMs: 1000 });
      const error = new Error('fail');

      // Fail twice
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Succeed - should reset counter
      await cb.execute(() => Promise.resolve('success'));

      // Fail twice again - should not trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // This should still work (counter was reset)
      const result = await cb.execute(() => Promise.resolve('still works'));
      expect(result).toBe('still works');
    });

    it('should close the circuit after success in half-open state', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, timeoutMs: 1000 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Wait for timeout
      advanceTime(1001);

      // Success should close the circuit
      await cb.execute(() => Promise.resolve('success'));

      // Should work normally now
      const result = await cb.execute(() => Promise.resolve('normal'));
      expect(result).toBe('normal');
    });
  });

  describe('failure handling', () => {
    it('should pass through errors while circuit is closed', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 5, timeoutMs: 1000 });
      const error = new Error('specific error');

      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow('specific error');
    });

    it('should increment failure count on each failure', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3, timeoutMs: 1000 });
      const error = new Error('fail');

      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Should still allow requests (threshold not reached)
      const fn = jest.fn().mockResolvedValue('success');
      const result = await cb.execute(fn);
      expect(result).toBe('success');
    });
  });

  describe('circuit opening (OPEN state)', () => {
    it('should open circuit after reaching failure threshold', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3, timeoutMs: 1000 });
      const error = new Error('fail');

      // Reach threshold
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Circuit should now be open
      await expect(cb.execute(() => Promise.resolve('should not run'))).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it('should reject immediately when circuit is open', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, timeoutMs: 1000 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Should reject without calling the function
      const fn = jest.fn().mockResolvedValue('success');
      await expect(cb.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should use default threshold of 10', async () => {
      const cb = new CircuitBreaker('test');
      const error = new Error('fail');

      // 9 failures should not trip the breaker
      for (let i = 0; i < 9; i++) {
        await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      }

      // Should still allow requests
      const fn = jest.fn().mockResolvedValue('success');
      const result = await cb.execute(fn);
      expect(result).toBe('success');
    });
  });

  describe('timeout and reset (HALF_OPEN state)', () => {
    it('should allow request after timeout expires', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, timeoutMs: 1000 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Verify it's open
      await expect(cb.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );

      // Wait for timeout
      advanceTime(1001);

      // Should now allow a request (half-open)
      const result = await cb.execute(() => Promise.resolve('allowed'));
      expect(result).toBe('allowed');
    });

    it('should re-open circuit on failure in half-open state', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, timeoutMs: 1000 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Wait for timeout
      advanceTime(1001);

      // Fail again in half-open state
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow('fail');

      // Should immediately re-open (next request should be blocked)
      await expect(cb.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it('should use default timeout of 30000ms', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // 29 seconds should still be blocked
      advanceTime(29000);
      await expect(cb.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );

      // 30+ seconds should allow
      advanceTime(1001);
      const result = await cb.execute(() => Promise.resolve('allowed'));
      expect(result).toBe('allowed');
    });
  });

  describe('configuration', () => {
    it('should accept custom failureThreshold', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1, timeoutMs: 1000 });
      const error = new Error('fail');

      // Single failure should trip
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // Should be open
      await expect(cb.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );
    });

    it('should accept custom timeoutMs', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1, timeoutMs: 500 });
      const error = new Error('fail');

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();

      // 400ms should still be blocked
      advanceTime(400);
      await expect(cb.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );

      // 500+ should allow
      advanceTime(101);
      const result = await cb.execute(() => Promise.resolve('allowed'));
      expect(result).toBe('allowed');
    });
  });

  describe('multiple circuits', () => {
    it('should maintain independent state for different circuit breakers', async () => {
      const cb1 = new CircuitBreaker('service1', { failureThreshold: 2, timeoutMs: 1000 });
      const cb2 = new CircuitBreaker('service2', { failureThreshold: 2, timeoutMs: 1000 });
      const error = new Error('fail');

      // Trip cb1
      await expect(cb1.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(cb1.execute(() => Promise.reject(error))).rejects.toThrow();

      // cb1 should be open
      await expect(cb1.execute(() => Promise.resolve('blocked'))).rejects.toThrow(
        CircuitBreakerError,
      );

      // cb2 should still work
      const result = await cb2.execute(() => Promise.resolve('works'));
      expect(result).toBe('works');
    });
  });
});

describe('CircuitBreakerError', () => {
  it('should have correct name', () => {
    const error = new CircuitBreakerError();

    expect(error.name).toBe('CircuitBreakerError');
  });

  it('should have correct message', () => {
    const error = new CircuitBreakerError();

    expect(error.message).toBe('Circuit breaker is open');
  });

  it('should be an instance of Error', () => {
    const error = new CircuitBreakerError();

    expect(error).toBeInstanceOf(Error);
  });
});
