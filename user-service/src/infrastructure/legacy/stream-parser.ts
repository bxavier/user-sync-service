import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger';
import { LegacyUser } from './legacy-user.interface';

export interface ParseResult {
  users: LegacyUser[];
  errors: string[];
}

@Injectable()
export class StreamParser {
  private readonly logger = new LoggerService(StreamParser.name);

  parse(rawData: string): ParseResult {
    const users: LegacyUser[] = [];
    const errors: string[] = [];

    if (!rawData || rawData.trim() === '') {
      this.logger.warn('Dados vazios recebidos');
      return { users, errors };
    }

    // A API retorna arrays JSON concatenados: [{...}][{...}]
    // Precisamos encontrar e parsear cada array
    const arrayMatches = this.extractJsonArrays(rawData);

    for (const jsonStr of arrayMatches) {
      try {
        const parsed = JSON.parse(jsonStr);

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (this.isValidLegacyUser(item)) {
              users.push(item);
            } else {
              errors.push(`Objeto inválido: ${JSON.stringify(item)}`);
            }
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido';
        errors.push(`JSON corrompido: ${errorMessage}`);
        this.logger.warn('Erro ao parsear JSON', { error: errorMessage });
      }
    }

    this.logger.log('Parse concluído', {
      totalUsers: users.length,
      totalErrors: errors.length,
    });

    return { users, errors };
  }

  private extractJsonArrays(data: string): string[] {
    const arrays: string[] = [];
    let depth = 0;
    let start = -1;

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
          start = -1;
        }
      }
    }

    return arrays;
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
