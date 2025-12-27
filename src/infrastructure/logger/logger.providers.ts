import { Provider, Scope } from '@nestjs/common';
import { LOGGER_SERVICE } from '@/domain/services';
import { LoggerService } from './custom-logger.service';

/**
 * Providers for logger service dependency injection.
 * Maps the LOGGER_SERVICE token to the concrete implementation.
 *
 * Uses Scope.TRANSIENT to create a new instance per injection,
 * allowing different context per service.
 */
export const loggerProviders: Provider[] = [
  {
    provide: LOGGER_SERVICE,
    useFactory: () => new LoggerService(),
    scope: Scope.TRANSIENT,
  },
];
