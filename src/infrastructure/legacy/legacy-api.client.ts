import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';
import type { BatchCallback, ILegacyApiClient, ILogger, LegacyUser, StreamingResult } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import { CircuitBreaker, withRetry } from '@/infrastructure/resilience';

/**
 * Legacy API client with streaming, retry, and circuit breaker.
 * Handles concatenated JSON arrays and corrupted data from the unstable legacy system.
 */
@Injectable()
export class AxiosLegacyApiClient implements ILegacyApiClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LOGGER_SERVICE)
    private readonly logger: ILogger,
  ) {
    this.baseURL = this.configService.get<string>('LEGACY_API_URL', 'http://localhost:3001');
    this.apiKey = this.configService.get<string>('LEGACY_API_KEY', 'test-api-key-2024');

    this.circuitBreaker = new CircuitBreaker('legacy-api');

    this.logger.log('AxiosLegacyApiClient initialized', {
      baseURL: this.baseURL,
    });
  }

  /** Streams all users, calling onBatch for each parsed batch. */
  async fetchUsersStreaming(onBatch: BatchCallback): Promise<StreamingResult> {
    this.logger.log('Starting user streaming from legacy API');

    return this.circuitBreaker.execute(() => withRetry(() => this.doStreamingFetch(onBatch), {}, this.logger));
  }

  /** @internal Performs the actual HTTP streaming fetch. */
  private async doStreamingFetch(onBatch: BatchCallback): Promise<StreamingResult> {
    const response = await axios.get(`${this.baseURL}/external/users`, {
      headers: { 'x-api-key': this.apiKey },
      responseType: 'stream',
      timeout: 0,
    });

    const stream = response.data as Readable;
    let buffer = '';
    let totalProcessed = 0;
    let totalErrors = 0;
    let lastLogTime = Date.now();
    let lastLoggedCount = 0;
    const startTime = Date.now();
    const LOG_INTERVAL_MS = 5000; // Log progress every 5 seconds

    for await (const chunk of stream) {
      buffer += chunk.toString();

      const { arrays: completeJsonArrays, remaining } = this.extractArrays(buffer);

      buffer = remaining;

      const { users, errors } = this.parseArraysToUsers(completeJsonArrays);
      totalErrors += errors;

      if (users.length > 0) {
        totalProcessed += users.length;
        await onBatch(users);

        // Log progress periodically
        const now = Date.now();
        if (now - lastLogTime >= LOG_INTERVAL_MS) {
          const elapsedSeconds = (now - startTime) / 1000;
          const recordsPerSecond = Math.round(totalProcessed / elapsedSeconds);
          const recordsSinceLastLog = totalProcessed - lastLoggedCount;

          this.logger.log('Streaming progress', {
            totalProcessed,
            recordsPerSecond,
            recordsSinceLastLog,
            elapsedSeconds: Math.round(elapsedSeconds),
            totalErrors,
          });

          lastLogTime = now;
          lastLoggedCount = totalProcessed;
        }
      }
    }

    // Processes residual buffer (last incomplete chunk)
    if (buffer.trim()) {
      const { arrays: completeJsonArrays } = this.extractArrays(buffer);
      const { users, errors } = this.parseArraysToUsers(completeJsonArrays);
      totalErrors += errors;

      if (users.length > 0) {
        totalProcessed += users.length;
        await onBatch(users);
      }
    }

    const totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);
    const avgRecordsPerSecond = totalDurationSeconds > 0 ? Math.round(totalProcessed / totalDurationSeconds) : 0;

    this.logger.log('Streaming completed', {
      totalProcessed,
      totalErrors,
      totalDurationSeconds,
      avgRecordsPerSecond,
    });

    return { totalProcessed, totalErrors };
  }

  /** Extracts complete JSON arrays from concatenated stream buffer. */
  private extractArrays(data: string): { arrays: string[]; remaining: string } {
    if (!data) return { arrays: [], remaining: '' };

    const arrays: string[] = [];
    let bracketDepth = 0;
    let arrayStartIndex = -1;
    let isInsideString = false;
    let isEscapeChar = false;
    let lastExtractedEndIndex = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      // Toggle string state on unescaped quotes
      if (!isEscapeChar && char === '"') {
        isInsideString = !isInsideString;
      }

      // Next char is escaped only if current is unescaped backslash inside string
      isEscapeChar = !isEscapeChar && isInsideString && char === '\\';

      // Only process brackets outside of strings
      if (isInsideString) continue;

      if (char === '[') {
        if (bracketDepth === 0) arrayStartIndex = i;
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
        if (bracketDepth === 0 && arrayStartIndex !== -1) {
          arrays.push(data.substring(arrayStartIndex, i + 1));
          lastExtractedEndIndex = i + 1;
          arrayStartIndex = -1;
        }
      }
    }

    return {
      arrays,
      remaining: arrayStartIndex !== -1 ? data.substring(arrayStartIndex) : data.substring(lastExtractedEndIndex),
    };
  }

  /** Parses JSON arrays and validates each user object. */
  private parseArraysToUsers(jsonArrays: string[]): {
    users: LegacyUser[];
    errors: number;
  } {
    const users: LegacyUser[] = [];
    let errors = 0;

    for (const json of jsonArrays) {
      const parsed = this.safeJsonParse(json);

      if (!parsed) {
        errors++;
        continue;
      }

      for (const item of parsed) {
        if (this.isValidUser(item)) {
          users.push(item);
        } else {
          errors++;
        }
      }
    }

    return { users, errors };
  }

  /** Safely parses JSON, returning null on error. */
  private safeJsonParse(json: string): LegacyUser[] | null {
    try {
      return JSON.parse(json) as LegacyUser[];
    } catch {
      return null;
    }
  }

  /** Type guard: validates required LegacyUser fields. */
  private isValidUser(obj: unknown): obj is LegacyUser {
    if (typeof obj !== 'object' || obj === null) return false;

    const user = obj as Record<string, unknown>;

    return (
      typeof user.id === 'number' &&
      typeof user.userName === 'string' &&
      typeof user.email === 'string' &&
      typeof user.createdAt === 'string' &&
      typeof user.deleted === 'boolean'
    );
  }
}
