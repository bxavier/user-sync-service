import { Provider } from '@nestjs/common';
import { LEGACY_API_CLIENT } from '@/domain/services';
import { AxiosLegacyApiClient } from './legacy-api.client';

/**
 * Dependency injection providers for the legacy API client.
 * Maps the LEGACY_API_CLIENT token to the concrete implementation.
 */
export const legacyApiProviders: Provider[] = [
  {
    provide: LEGACY_API_CLIENT,
    useClass: AxiosLegacyApiClient,
  },
];
