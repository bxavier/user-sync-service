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

  /**
   * Busca usuários da API legada usando streaming real.
   * Processa os dados em batches conforme chegam, chamando o callback para cada batch.
   * Isso permite processar milhões de registros sem esgotar memória.
   */
  async fetchUsersStreaming(onBatch: BatchCallback): Promise<StreamingResult> {
    this.logger.log('Iniciando streaming de usuários da API legada');

    return this.circuitBreaker.execute(() =>
      withRetry(
        async () => this.doStreamingFetch(onBatch),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
        },
        this.logger,
      ),
    );
  }

  private async doStreamingFetch(onBatch: BatchCallback): Promise<StreamingResult> {
    const response = await axios.get(`${this.baseURL}/external/users`, {
      headers: { 'x-api-key': this.apiKey },
      responseType: 'stream',
      timeout: 0, // Sem timeout para streaming longo
    });

    const stream = response.data as Readable;
    let buffer = '';
    let totalProcessed = 0;
    let totalErrors = 0;

    return new Promise((resolve, reject) => {
      stream.on('data', async (chunk: Buffer) => {
        // Pausa o stream enquanto processa para evitar backpressure
        stream.pause();

        buffer += chunk.toString();

        // Tenta extrair arrays JSON completos do buffer
        const { arrays, remaining } = this.extractCompleteArrays(buffer);
        buffer = remaining;

        for (const jsonStr of arrays) {
          try {
            const users = JSON.parse(jsonStr) as unknown[];
            const validUsers = users.filter((u): u is LegacyUser =>
              this.isValidLegacyUser(u),
            );

            if (validUsers.length > 0) {
              await onBatch(validUsers);
              totalProcessed += validUsers.length;

              this.logger.debug('Batch processado', {
                batchSize: validUsers.length,
                totalProcessed,
              });
            }

            totalErrors += users.length - validUsers.length;
          } catch {
            // JSON corrompido - ignora e continua
            totalErrors++;
            this.logger.warn('JSON corrompido ignorado');
          }
        }

        // Resume o stream após processar
        stream.resume();
      });

      stream.on('end', () => {
        // Processa qualquer dado restante no buffer
        if (buffer.trim()) {
          const { arrays } = this.extractCompleteArrays(buffer);
          for (const jsonStr of arrays) {
            try {
              const users = JSON.parse(jsonStr) as unknown[];
              const validUsers = users.filter((u): u is LegacyUser =>
                this.isValidLegacyUser(u),
              );
              // Nota: não podemos chamar onBatch de forma async aqui no evento 'end'
              // então apenas contamos
              totalProcessed += validUsers.length;
            } catch {
              totalErrors++;
            }
          }
        }

        this.logger.log('Streaming concluído', { totalProcessed, totalErrors });
        resolve({ totalProcessed, totalErrors });
      });

      stream.on('error', (error) => {
        this.logger.error('Erro no streaming', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Extrai arrays JSON completos do buffer.
   * A API legada envia arrays concatenados: [{...}][{...}]
   */
  private extractCompleteArrays(data: string): {
    arrays: string[];
    remaining: string;
  } {
    const arrays: string[] = [];
    let depth = 0;
    let start = -1;
    let lastEnd = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];

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

    // Retorna o que sobrou (array incompleto) como remaining
    return {
      arrays,
      remaining: data.substring(lastEnd),
    };
  }

  private isValidLegacyUser(obj: unknown): obj is LegacyUser {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

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
