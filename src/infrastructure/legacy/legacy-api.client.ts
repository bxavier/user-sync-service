import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';
import { LoggerService } from '../logger';
import { withRetry, CircuitBreaker } from '../resilience';
import { LegacyUser } from './legacy-user.interface';

export interface BatchCallback {
  (users: LegacyUser[]): Promise<void>;
}

export interface StreamingResult {
  totalProcessed: number;
  totalErrors: number;
}

@Injectable()
export class LegacyApiClient {
  private readonly logger = new LoggerService(LegacyApiClient.name);
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly configService: ConfigService) {
    this.baseURL = this.configService.get<string>(
      'LEGACY_API_URL',
      'http://localhost:3001',
    );
    this.apiKey = this.configService.get<string>(
      'LEGACY_API_KEY',
      'test-api-key-2024',
    );

    this.circuitBreaker = new CircuitBreaker('legacy-api', {
      failureThreshold: 5,
      timeoutMs: 60000,
    });

    this.logger.log('LegacyApiClient inicializado', { baseURL: this.baseURL });
  }

  async fetchUsersStreaming(onBatch: BatchCallback): Promise<StreamingResult> {
    this.logger.log('Iniciando streaming de usuários da API legada');

    return this.circuitBreaker.execute(() =>
      withRetry(() => this.doStreamingFetch(onBatch), {}, this.logger),
    );
  }

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

    for await (const chunk of stream) {
      buffer += chunk.toString();

      const result = this.extractArrays(buffer);
      buffer = result.remaining;

      for (const jsonStr of result.arrays) {
        const { users, errors } = this.parseArraysToUsers([jsonStr]);
        totalErrors += errors;

        if (users.length > 0) {
          totalProcessed += users.length;
          await onBatch(users);
        }
      }
    }

    // Buffer residual
    if (buffer.trim()) {
      const result = this.extractArrays(buffer);
      const { users, errors } = this.parseArraysToUsers(result.arrays);
      totalErrors += errors;
      if (users.length > 0) {
        totalProcessed += users.length;
        await onBatch(users);
      }
    }

    this.logger.log('Streaming concluído', { totalProcessed, totalErrors });
    return { totalProcessed, totalErrors };
  }

  /**
   * Extrai arrays JSON completos do buffer.
   */
  private extractArrays(data: string): { arrays: string[]; remaining: string } {
    const arrays: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;
    let lastEnd = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      if (!escape && char === '"') {
        inString = !inString;
      }
      escape = !escape && inString && char === '\\';

      if (!inString) {
        if (char === '[') {
          if (depth === 0) {
            start = i;
          }
          depth++;
        } else if (char === ']') {
          depth--;
          if (depth === 0 && start !== -1) {
            arrays.push(data.substring(start, i + 1));
            lastEnd = i + 1;
            start = -1;
          }
        }
      }
    }

    return {
      arrays,
      remaining: start !== -1 ? data.substring(start) : data.substring(lastEnd),
    };
  }

  private parseArraysToUsers(arrays: string[]): {
    users: LegacyUser[];
    errors: number;
  } {
    const users: LegacyUser[] = [];
    let errors = 0;

    for (const jsonStr of arrays) {
      try {
        const parsed = JSON.parse(jsonStr) as unknown[];
        for (const item of parsed) {
          if (this.isValidUser(item)) {
            users.push(item as LegacyUser);
          } else {
            errors++;
          }
        }
      } catch {
        errors++;
      }
    }

    return { users, errors };
  }

  private isValidUser(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    const u = obj as Record<string, unknown>;
    return (
      typeof u.id === 'number' &&
      typeof u.userName === 'string' &&
      typeof u.email === 'string' &&
      typeof u.createdAt === 'string' &&
      typeof u.deleted === 'boolean'
    );
  }
}
