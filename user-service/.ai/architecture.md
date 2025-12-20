# Arquitetura do User Service

## Visão Geral

Serviço que sincroniza dados de um sistema legado instável e expõe endpoints REST modernos.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   POST /sync    │────▶│   BullMQ Queue  │────▶│  Sync Processor │
│   (Controller)  │     │   (Redis)       │     │  (Worker)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐                            ┌─────────────────┐
│  Legacy API     │◀───────────────────────────│  Legacy Client  │
│  (Port 3001)    │                            │  (Resiliente)   │
└─────────────────┘                            └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  SQLite DB      │
                                               │  (TypeORM)      │
                                               └─────────────────┘
```

## Camadas (DDD Simplificado)

### Domain Layer
- **Entities**:
  - `User` - usuário sincronizado (com soft delete via `deleted`/`deletedAt`)
  - `SyncLog` - log de execução de sincronização (com enum `SyncStatus`)
- **Repository Interfaces** (✅ implementado):
  - `UserRepository` - findAll, findById, findByUserName, create, update, softDelete, upsertByLegacyId
  - `SyncLogRepository` - create, update, findById, findLatest, findAll

### Application Layer
- **Services** (✅ implementado):
  - `UserService` - CRUD de usuários, validação de unicidade
  - `SyncService` - enfileiramento de jobs, verificação de idempotência, cron scheduler
- **DTOs** (✅ implementado):
  - `CreateUserDto`, `UpdateUserDto` - entrada com validação
  - `PaginationDto` - paginação
  - `UserResponseDto`, `PaginatedUsersResponseDto` - saída

### Infrastructure Layer
- **Database**: Configuração TypeORM + SQLite (✅ implementado)
  - `typeorm.config.ts` - configuração do banco
  - `typeorm-logger.ts` - logger integrado ao NestJS
- **Repositories** (✅ implementado):
  - `UserRepositoryImpl` - implementação com TypeORM
  - `SyncLogRepositoryImpl` - implementação com TypeORM
  - `repositories.providers.ts` - providers centralizados para DI
- **Legacy** (✅ implementado):
  - `LegacyApiClient` - cliente HTTP com axios para API legada
  - `StreamParser` - parser para JSON concatenado (arrays de 100 registros)
  - `LegacyUser` - interface para dados do sistema legado
- **Resilience** (✅ implementado):
  - `withRetry` - função de retry com exponential backoff
  - `CircuitBreaker` - proteção contra falhas cascata
- **Queue** (✅ implementado):
  - `sync.constants.ts` - constantes da fila (`SYNC_QUEUE_NAME`, `SYNC_JOB_NAME`)
  - `SyncProcessor` - worker BullMQ que processa jobs de sincronização
- **Logger**: LoggerService customizado (✅ estende ConsoleLogger)

### Presentation Layer (✅ implementado)
- **Controllers**:
  - `UserController` - GET /users, GET /users/:user_name, POST /users, PUT /users/:id, DELETE /users/:id
  - `SyncController` - POST /sync, GET /sync/status, GET /sync/history
- **Filters**:
  - `HttpExceptionFilter` - tratamento global de exceções com logging

## Padrões de Resiliência

### Retry com Exponential Backoff
```typescript
const retryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};
```

### Circuit Breaker
```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
};
```

## Fluxo de Sincronização

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ POST /sync   │───▶│ SyncService  │───▶│ BullMQ Queue │───▶│SyncProcessor │
│ ou Cron Job  │    │ (idempotent) │    │  (Redis)     │    │  (Worker)    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                           │                                       │
                           ▼                                       ▼
                    ┌──────────────┐                       ┌──────────────┐
                    │  SyncLog     │◀──────────────────────│LegacyApiClient│
                    │  (status)    │                       │  (fetch)     │
                    └──────────────┘                       └──────┬───────┘
                                                                  │
                                                                  ▼
                                                          ┌──────────────┐
                                                          │UserRepository│
                                                          │(upsertByLegacyId)│
                                                          └──────────────┘
```

1. `POST /sync` ou Cron Job (a cada 5 min) chama `SyncService.triggerSync()`
2. SyncService verifica idempotência (se há sync PENDING/RUNNING, retorna existente)
3. Cria SyncLog com status PENDING e enfileira job no BullMQ
4. SyncProcessor consome job, atualiza status para RUNNING
5. LegacyApiClient busca dados com retry + circuit breaker
6. StreamParser processa JSON concatenado
7. Para cada usuário: `upsertByLegacyId` (deduplicação por legacyId, mantém mais recente)
8. Atualiza SyncLog com status COMPLETED/FAILED, totalProcessed, durationMs

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| SQLite | Simplicidade para dev local, requisito do teste |
| BullMQ | Jobs assíncronos com retry automático |
| Fastify | Performance superior ao Express |
| TypeORM | Abstrações DDD, suporte a SQLite |
