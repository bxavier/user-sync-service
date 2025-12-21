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
- **Repository Interfaces**:
  - `UserRepository` - findAll, findById, findByUserName, create, update, softDelete, upsertByLegacyId, bulkUpsertByUserName, findAllForExport
  - `SyncLogRepository` - create, update, findById, findLatest, findAll, markStaleAsFailed

### Application Layer

- **Services**:
  - `UserService` - CRUD de usuários, validação de unicidade, exportação CSV
  - `SyncService` - enfileiramento de jobs, verificação de idempotência, cron scheduler, métricas de status, reset de syncs travadas
  - `HealthService` - verificação de componentes (Database, Redis, API Legada), métricas do sistema (memória, CPU, uptime), estatísticas das filas
- **DTOs**:
  - `CreateUserDto`, `UpdateUserDto` - entrada com validação
  - `PaginationDto` - paginação
  - `UserResponseDto`, `PaginatedUsersResponseDto` - saída de usuários
  - `ExportCsvQueryDto` - filtros para exportação CSV
  - `SyncStatusDto`, `TriggerSyncResponseDto`, `ResetSyncResponseDto` - respostas de sync
  - `HealthResponseDto`, `HealthDetailsResponseDto`, `ComponentHealthDto` - respostas de health check

### Infrastructure Layer

- **Config**:
  - `env.validation.ts` - validação centralizada de env vars com class-validator
  - `swagger.config.ts` - configuração Swagger (contact, license, tags)
- **Database**:
  - `typeorm-logger.ts` - logger integrado ao NestJS
  - Configuração inline no `AppModule` via `TypeOrmModule.forRootAsync`
- **Repositories**:
  - `UserRepositoryImpl` - implementação com TypeORM
  - `SyncLogRepositoryImpl` - implementação com TypeORM
  - `repositories.providers.ts` - providers centralizados para DI
- **Legacy**:
  - `LegacyApiClient` - cliente HTTP com axios (streaming real com `responseType: 'stream'`)
  - `LegacyUser` - interface para dados do sistema legado
  - `StreamParser` - parser para JSON concatenado
- **Resilience**:
  - `withRetry` - função de retry com exponential backoff
  - `CircuitBreaker` - proteção contra falhas cascata
- **Queue**:
  - `sync.constants.ts` - constantes de nomes de filas
  - `SyncProcessor` - orquestrador que recebe streaming e enfileira batches
  - `SyncBatchProcessor` - worker paralelo (concurrency via env var) que processa batches
- **Logger**: LoggerService customizado (estende ConsoleLogger)

### Presentation Layer

- **Controllers**:
  - `UserController` - GET /users, GET /users/export/csv, GET /users/:user_name, POST /users, PUT /users/:id, DELETE /users/:id
  - `SyncController` - POST /sync, GET /sync/status, GET /sync/history, POST /sync/reset
  - `HealthController` - GET /health (liveness), GET /health/details (readiness com detalhes)
- **Filters**:
  - `HttpExceptionFilter` - tratamento global de exceções com logging

## Configuração via Environment

Todas as configurações são validadas no startup via `ConfigModule` + class-validator:

```typescript
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validate, // Função de validação
})

// Módulos usando ConfigService
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config) => ({ ... })
})
```

### Variáveis de Ambiente

| Variável                  | Obrigatório | Default       | Descrição             |
| ------------------------- | ----------- | ------------- | --------------------- |
| `REDIS_HOST`              | Sim         | -             | Host do Redis         |
| `REDIS_PORT`              | Sim         | -             | Porta do Redis        |
| `LEGACY_API_URL`          | Sim         | -             | URL da API legada     |
| `LEGACY_API_KEY`          | Sim         | -             | Chave de autenticação |
| `SYNC_BATCH_SIZE`         | Não         | 1000          | Usuários por batch    |
| `SYNC_WORKER_CONCURRENCY` | Não         | 1             | Workers paralelos     |
| `SYNC_CRON_EXPRESSION`    | Não         | `0 */6 * * *` | Cron da sync          |
| `TYPEORM_LOGGING`         | Não         | true          | Logs SQL              |

## Padrões de Resiliência

### Retry com Exponential Backoff

```typescript
const retryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};
```

### Circuit Breaker

```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
};
```

### Recuperação de Syncs Travadas

```
┌─────────────────────────────────────────────────────────────┐
│                    Sync Recovery                             │
├─────────────────────────────────────────────────────────────┤
│ 1. Timeout Automático (30 min)                              │
│    - triggerSync() verifica syncs antigas                   │
│    - Marca como FAILED se > 30 min em andamento             │
│                                                              │
│ 2. Recovery no Startup                                       │
│    - OnModuleInit marca syncs órfãs como FAILED             │
│    - Qualquer sync em andamento é considerada interrompida  │
│                                                              │
│ 3. Reset Manual (POST /sync/reset)                          │
│    - Força sync atual a ser marcada como FAILED             │
│    - Permite iniciar nova sync imediatamente                │
└─────────────────────────────────────────────────────────────┘
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
                                                                  │ batch (2000)
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

### Etapas do Fluxo

1. `POST /sync` ou Cron Job (a cada 6h) chama `SyncService.triggerSync()`
2. SyncService verifica syncs travadas (timeout 30 min) e marca como FAILED
3. SyncService verifica idempotência (se há sync PENDING/RUNNING/PROCESSING, retorna existente)
4. Cria SyncLog com status PENDING e enfileira job no BullMQ (`user-sync`)
5. SyncProcessor consome job, atualiza status para RUNNING
6. LegacyApiClient faz streaming real com axios (`responseType: 'stream'`)
7. A cada 2000 usuários (configurável), enfileira um job na fila `user-sync-batch`
8. Quando streaming termina, atualiza SyncLog para status PROCESSING
9. SyncBatchProcessor processa batches em paralelo (concurrency: 20, configurável)
10. Cada batch usa `bulkUpsertByUserName` com transação explícita (deduplicação por userName)
11. Performance: 1M usuários em ~18 minutos (~920 rec/s)

## Endpoints da API

### Users

| Método | Endpoint          | Descrição                           |
| ------ | ----------------- | ----------------------------------- |
| GET    | /users            | Lista usuários paginados            |
| GET    | /users/export/csv | Exporta usuários em CSV (streaming) |
| GET    | /users/:user_name | Busca usuário por userName          |
| POST   | /users            | Cria novo usuário                   |
| PUT    | /users/:id        | Atualiza usuário                    |
| DELETE | /users/:id        | Soft delete de usuário              |

### Sync

| Método | Endpoint      | Descrição                            |
| ------ | ------------- | ------------------------------------ |
| POST   | /sync         | Inicia sincronização                 |
| GET    | /sync/status  | Status da última sync (com métricas) |
| GET    | /sync/history | Histórico de sincronizações          |
| POST   | /sync/reset   | Reseta sync travada                  |

### Health

| Método | Endpoint        | Descrição                                             |
| ------ | --------------- | ----------------------------------------------------- |
| GET    | /health         | Liveness probe (simples, rápido)                      |
| GET    | /health/details | Readiness probe com detalhes (rate limit: 10 req/min) |

**Componentes verificados no `/health/details`:**

- Database (SQLite) - latência, status
- Redis - latência, status
- API Legada - latência, status (degraded se indisponível)
- Sistema - memória, CPU, uptime
- Filas - jobs waiting, active, completed, failed, delayed

**Status possíveis:**

- `healthy` - Todos os componentes críticos OK
- `degraded` - Componentes não-críticos com problema (ex: API legada)
- `unhealthy` - Componentes críticos falharam (HTTP 503)

## Decisões Técnicas

| Decisão                   | Justificativa                                        |
| ------------------------- | ---------------------------------------------------- |
| SQLite                    | Simplicidade para dev local, requisito do teste      |
| BullMQ                    | Jobs assíncronos com retry automático                |
| Fastify                   | Performance superior ao Express                      |
| TypeORM                   | Abstrações DDD, suporte a SQLite                     |
| Streaming + Batch Queue   | Suporte a 1M+ registros sem esgotar memória          |
| Parallel Workers (20x)    | Processamento distribuído para alta performance      |
| Transação Explícita       | Reduz I/O de disco no SQLite (fsync único por batch) |
| Bulk Upsert               | Operações em lote para reduzir I/O de banco          |
| ConfigModule + Validation | Fail-fast para env vars inválidas                    |
| OnModuleInit Recovery     | Recuperação automática de syncs órfãs no startup     |
| Controllers Thin          | Lógica de negócio apenas nos services                |
