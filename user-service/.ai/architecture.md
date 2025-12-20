# Arquitetura do User Service

## Visão Geral

Serviço que sincroniza dados de um sistema legado instável e expõe endpoints REST modernos.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   POST /sync    │────▶│  Sync Queue     │────▶│ SyncProcessor   │
│   (Controller)  │     │  (user-sync)    │     │ (Orquestrador)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │ streaming
                                                         ▼
┌─────────────────┐                            ┌─────────────────┐
│  Legacy API     │◀───streaming──────────────│ LegacyApiClient │
│  (Port 3001)    │                            │ (axios stream)  │
└─────────────────┘                            └────────┬────────┘
                                                        │ batch (2000 users)
                                                        ▼
                                               ┌─────────────────┐
                                               │ Batch Queue     │
                                               │(user-sync-batch)│
                                               └────────┬────────┘
                                                        │ parallel (20x)
                                                        ▼
                                               ┌─────────────────┐
                                               │SyncBatchProcessor│
                                               │ (Workers)       │
                                               └────────┬────────┘
                                                        │ bulkUpsert
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
  - `UserRepository` - findAll, findById, findByUserName, create, update, softDelete, upsertByLegacyId, bulkUpsertByUserName
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
  - `LegacyApiClient` - cliente HTTP com axios (streaming real com `responseType: 'stream'`)
  - `LegacyUser` - interface para dados do sistema legado
- **Resilience** (✅ implementado):
  - `withRetry` - função de retry com exponential backoff
  - `CircuitBreaker` - proteção contra falhas cascata
- **Queue** (✅ implementado):
  - `sync.constants.ts` - constantes (`SYNC_QUEUE_NAME`, `SYNC_BATCH_QUEUE_NAME`, `BATCH_SIZE`)
  - `SyncProcessor` - orquestrador que recebe streaming e enfileira batches
  - `SyncBatchProcessor` - worker paralelo (concurrency: 20) que processa batches de 2000 usuários
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

## Fluxo de Sincronização (Distribuído)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ POST /sync   │───▶│ SyncService  │───▶│ Sync Queue   │───▶│SyncProcessor │
│ ou Cron Job  │    │ (idempotent) │    │ (user-sync)  │    │(Orquestrador)│
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                           │                                       │ streaming
                           ▼                                       ▼
                    ┌──────────────┐                       ┌──────────────┐
                    │  SyncLog     │◀─────status──────────│LegacyApiClient│
                    │  (PROCESSING)│                       │  (stream)    │
                    └──────────────┘                       └──────┬───────┘
                                                                  │ batch (1000)
                                                                  ▼
                                                          ┌──────────────┐
                                                          │ Batch Queue  │
                                                          │(user-sync-   │
                                                          │    batch)    │
                                                          └──────┬───────┘
                                                                  │ parallel (20x)
                                                                  ▼
                                                          ┌──────────────┐
                                                          │SyncBatch     │
                                                          │Processor     │
                                                          └──────┬───────┘
                                                                  │ bulkUpsert
                                                                  ▼
                                                          ┌──────────────┐
                                                          │UserRepository│
                                                          │(bulkUpsert)  │
                                                          └──────────────┘
```

1. `POST /sync` ou Cron Job (a cada 5 min) chama `SyncService.triggerSync()`
2. SyncService verifica idempotência (se há sync PENDING/RUNNING/PROCESSING, retorna existente)
3. Cria SyncLog com status PENDING e enfileira job no BullMQ (`user-sync`)
4. SyncProcessor consome job, atualiza status para RUNNING
5. LegacyApiClient faz streaming real com axios (`responseType: 'stream'`)
6. A cada 2000 usuários, enfileira um job na fila `user-sync-batch`
7. Quando streaming termina, atualiza SyncLog para status PROCESSING
8. SyncBatchProcessor processa batches em paralelo (concurrency: 20)
9. Cada batch usa `bulkUpsertByUserName` com transação explícita (deduplicação por userName)
10. Performance: 1M usuários em ~18 minutos (~820 rec/s)

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| SQLite | Simplicidade para dev local, requisito do teste |
| BullMQ | Jobs assíncronos com retry automático |
| Fastify | Performance superior ao Express |
| TypeORM | Abstrações DDD, suporte a SQLite |
| Streaming + Batch Queue | Suporte a 1M+ registros sem esgotar memória |
| Parallel Workers (20x) | Processamento distribuído para alta performance |
| Transação Explícita | Reduz I/O de disco no SQLite (fsync único por batch) |
| Bulk Upsert | Operações em lote para reduzir I/O de banco |
