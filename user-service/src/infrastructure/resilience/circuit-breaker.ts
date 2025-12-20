import { LoggerService } from '../logger';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private isOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: LoggerService;

  constructor(
    name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = { failureThreshold: 5, timeoutMs: 30000, ...config };
    this.logger = new LoggerService(`CircuitBreaker:${name}`);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen && !this.shouldReset()) {
      throw new CircuitBreakerError('Circuit breaker está aberto');
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private shouldReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.timeoutMs;
  }

  private reset(): void {
    if (this.isOpen) {
      this.logger.log('Circuit breaker fechado');
    }
    this.isOpen = false;
    this.failureCount = 0;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.isOpen = true;
      this.logger.warn('Circuit breaker aberto', {
        failures: this.failureCount,
      });
    }
  }
}
