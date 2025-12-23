import { Provider } from '@nestjs/common';
import { LEGACY_API_CLIENT } from '../../domain/services';
import { LegacyApiClientImpl } from './legacy-api.client';

/**
 * Providers para injeção de dependência do cliente da API legada.
 * Mapeia o token LEGACY_API_CLIENT para a implementação concreta.
 */
export const legacyApiProviders: Provider[] = [
  {
    provide: LEGACY_API_CLIENT,
    useClass: LegacyApiClientImpl,
  },
];
