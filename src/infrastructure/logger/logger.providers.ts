import { Provider, Scope } from '@nestjs/common';
import { LOGGER_SERVICE } from '../../domain/services';
import { LoggerService } from './custom-logger.service';

/**
 * Providers para injeção de dependência do serviço de logger.
 * Mapeia o token LOGGER_SERVICE para a implementação concreta.
 *
 * Usa Scope.TRANSIENT para criar nova instância por injeção,
 * permitindo contexto diferente por service.
 */
export const loggerProviders: Provider[] = [
  {
    provide: LOGGER_SERVICE,
    useFactory: () => new LoggerService(),
    scope: Scope.TRANSIENT,
  },
];
