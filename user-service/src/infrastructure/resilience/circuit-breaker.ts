import { LoggerService } from '../logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000,
};

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: LoggerService;

  constructor(
    private readonly name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new LoggerService(`CircuitBreaker:${name}`);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker "${this.name}" está OPEN. Aguarde ${this.getRemainingTimeout()}ms`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.timeoutMs;
  }

  private getRemainingTimeout(): number {
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.timeoutMs - elapsed);
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this.logger.log('Estado alterado', {
      from: previousState,
      to: newState,
      failureCount: this.failureCount,
    });
  }

  getState(): CircuitState {
    return this.state;
  }
}
