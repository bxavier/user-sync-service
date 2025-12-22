export class CircuitBreakerError extends Error {
  constructor() {
    super('Circuit breaker está aberto');
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private isOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    _name: string,
    private readonly config = { failureThreshold: 10, timeoutMs: 30000 },
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (
      this.isOpen &&
      Date.now() - this.lastFailureTime < this.config.timeoutMs
    ) {
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
