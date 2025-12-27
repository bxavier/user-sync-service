/** Error thrown when circuit breaker is open. */
export class CircuitBreakerError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker pattern - prevents cascading failures.
 * Opens after threshold failures, blocks requests until timeout.
 */
export class CircuitBreaker {
  private isOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: { failureThreshold: number; timeoutMs: number };

  constructor(
    _name: string,
    config: Partial<{ failureThreshold: number; timeoutMs: number }> = {},
  ) {
    this.config = { failureThreshold: 10, timeoutMs: 30000, ...config };
  }

  /** Executes fn with circuit breaker protection. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen && Date.now() - this.lastFailureTime < this.config.timeoutMs) {
      throw new CircuitBreakerError();
    }

    try {
      const result = await fn();
      this.isOpen = false;
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.config.failureThreshold) {
        this.isOpen = true;
      }
      throw error;
    }
  }
}
