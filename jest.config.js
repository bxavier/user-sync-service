/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Inclui tanto .spec.ts quanto .e2e-spec.ts
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    // Excluir módulos NestJS (apenas configuração)
    '!src/**/*.module.ts',
    '!src/main.ts',
    // Excluir DTOs e interfaces (sem lógica)
    '!src/**/*.dto.ts',
    '!src/**/*.interface.ts',
    '!src/**/index.ts',
    // Excluir configuração de infra (env validation, swagger)
    '!src/infrastructure/config/**',
    // Excluir providers (apenas wiring de DI)
    '!src/**/*.providers.ts',
    // Excluir entities (declarações TypeORM sem lógica)
    '!src/infrastructure/database/entities/**',
    // Filtro de exceção - testado em http-exception.filter.spec.ts
    '!src/presentation/filters/index.ts',
    // Excluir controllers (testados via E2E, não unitários)
    '!src/presentation/controllers/**',
    // Excluir constants (apenas valores estáticos)
    '!src/infrastructure/queue/sync.constants.ts',
    // Excluir observabilidade (infraestrutura)
    '!src/infrastructure/observability/observability.module.ts',
    '!src/infrastructure/observability/correlation-id.interceptor.ts',
    '!src/infrastructure/observability/metrics.controller.ts',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  verbose: true,
};
