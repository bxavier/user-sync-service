import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { LoggerService } from '../logger';
import { withRetry, CircuitBreaker } from '../resilience';
import { StreamParser, ParseResult } from './stream-parser';

@Injectable()
export class LegacyApiClient {
  private readonly logger = new LoggerService(LegacyApiClient.name);
  private readonly client: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly configService: ConfigService,
    private readonly streamParser: StreamParser,
  ) {
    const baseURL = this.configService.get<string>(
      'LEGACY_API_URL',
      'http://localhost:3001',
    );
    const apiKey = this.configService.get<string>(
      'LEGACY_API_KEY',
      'test-api-key-2024',
    );
    const timeout = this.configService.get<number>('LEGACY_API_TIMEOUT', 30000);

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'x-api-key': apiKey,
      },
      responseType: 'text',
    });

    this.circuitBreaker = new CircuitBreaker('legacy-api', {
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 30000,
    });

    this.logger.log('LegacyApiClient inicializado', { baseURL, timeout });
  }

  async fetchUsers(): Promise<ParseResult> {
    this.logger.log('Buscando usuários da API legada');

    const rawData = await this.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          const response = await this.client.get<string>('/external/users');
          return response.data;
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
        this.logger,
      ),
    );

    this.logger.log('Dados recebidos da API legada', {
      contentLength: rawData.length,
    });

    const result = this.streamParser.parse(rawData);

    this.logger.log('Parse concluído', {
      users: result.users.length,
      errors: result.errors.length,
    });

    return result;
  }
}
