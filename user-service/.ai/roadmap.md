# Roadmap de Desenvolvimento

## Fluxo de Implementação

**IMPORTANTE**: Antes de implementar qualquer tarefa abaixo, o assistente DEVE:
1. Explicar o que será implementado e por quê
2. Descrever a abordagem técnica escolhida
3. Aguardar aprovação do usuário antes de aplicar as mudanças

---

## Status Geral

| Fase | Status | Descrição |
|------|--------|-----------|
| 1 | ✅ Concluído | Setup do Projeto |
| 2 | ✅ Concluído | Domínio e Persistência |
| 3 | ✅ Concluído | CRUD de Usuários |
| 4 | ✅ Concluído | Cliente do Sistema Legado |
| 5 | ✅ Concluído | Sincronização com BullMQ |
| 6 | ✅ Concluído | Exportação CSV |
| 6.5 | ✅ Concluído | Refatoração ConfigModule |
| 7 | 🔄 Em andamento | Qualidade e Observabilidade |
| 8 | Pendente | Documentação e Entrega |

---

## Fase 1: Setup do Projeto
**Status**: Concluído

### Tarefas
- [x] Inicializar projeto NestJS com Fastify
- [x] Configurar TypeORM + SQLite
- [x] Configurar BullMQ + Redis
- [x] Criar estrutura de pastas DDD simplificado
- [x] Setup Docker e docker-compose
- [x] Configurar variáveis de ambiente (.env)
- [x] Configurar ESLint, Prettier
- [x] Criar documentação .ai/

### Critério de Conclusão
`docker-compose up` sobe API + Redis + Legacy API

---

## Fase 2: Domínio e Persistência
**Status**: ✅ Concluído

### Tarefas
- [x] Criar `User` entity (TypeORM) - campos: id, legacyId, userName, email, legacyCreatedAt, createdAt, updatedAt, deleted, deletedAt
- [x] Criar `SyncLog` entity - campos: id, status (enum), startedAt, finishedAt, totalProcessed, errorMessage, durationMs
- [x] Configurar soft delete (campo `deleted` + `deletedAt` na User entity)
- [x] Registrar entidades no AppModule (`TypeOrmModule.forFeature`)
- [x] Criar interface `UserRepository`
- [x] Implementar `UserRepositoryImpl`
- [x] Criar interface `SyncLogRepository`
- [x] Implementar `SyncLogRepositoryImpl`
- [x] Centralizar providers em `repositories.providers.ts`

### Critério de Conclusão
Entidades mapeadas, banco criado automaticamente, repositórios implementados

---

## Fase 3: CRUD de Usuários
**Status**: ✅ Concluído

### Tarefas
- [x] DTOs com validação (CreateUserDto, UpdateUserDto, PaginationDto, UserResponseDto)
- [x] `UserService` com lógica de negócio
- [x] `UserController` com endpoints (GET /users, GET /users/:user_name, POST /users, PUT /users/:id, DELETE /users/:id)
- [x] `HttpExceptionFilter` global
- [x] Swagger documentation via decorators

### Critério de Conclusão
CRUD completo testável via Swagger

---

## Fase 4: Cliente do Sistema Legado
**Status**: ✅ Concluído

### Tarefas
- [x] `LegacyApiClient` com axios
- [x] `StreamParser` para JSON concatenado
- [x] Retry com exponential backoff (`withRetry`)
- [x] Circuit breaker simples (`CircuitBreaker`)
- [x] Tratamento de JSON corrompido (via `StreamParser.extractJsonArrays`)
- [x] Logging detalhado

### Critério de Conclusão
Consegue consumir stream mesmo com erros simulados

---

## Fase 5: Sincronização com BullMQ
**Status**: ✅ Concluído

### Tarefas
- [x] Configurar BullMQ Queue (`SYNC_QUEUE_NAME`, `SYNC_BATCH_QUEUE_NAME`)
- [x] Criar `SyncProcessor` (orquestrador que recebe streaming e enfileira batches)
- [x] Criar `SyncBatchProcessor` (worker paralelo com concurrency: 20)
- [x] Lógica de deduplicação por `userName` (via `bulkUpsertByUserName`)
- [x] Histórico/log de execuções (SyncLog com status PENDING/RUNNING/PROCESSING/COMPLETED/FAILED)
- [x] Endpoint `POST /sync` (retorna 202 Accepted)
- [x] Endpoints auxiliares `GET /sync/status` e `GET /sync/history`
- [x] Cron job para sync periódico (a cada 6 horas via `@Cron`, configurável via env)
- [x] Garantir idempotência (verifica se já existe sync PENDING/RUNNING/PROCESSING)
- [x] Streaming real com axios (`responseType: 'stream'`) e backpressure
- [x] Batch processing (2000 usuários por job) para suportar 1M+ registros
- [x] Recuperação de syncs travadas:
  - [x] Timeout automático (30 min) no `triggerSync`
  - [x] Recovery no startup via `OnModuleInit`
  - [x] Endpoint `POST /sync/reset` para reset manual

### Critério de Conclusão
1 milhão de usuários sincronizados em ~18 minutos, sem duplicatas, com recuperação automática de syncs travadas

---

## Fase 6: Exportação CSV
**Status**: ✅ Concluído

### Tarefas
- [x] Endpoint `GET /users/export/csv`
- [x] Filtros `created_from`, `created_to`
- [x] Streaming response com cursor-based pagination
- [x] `ExportCsvQueryDto` com validação de datas
- [x] `findAllForExport` no repositório (async generator com batches de 1000)
- [x] Lógica de formatação CSV movida para `UserService`

### Critério de Conclusão
Download de CSV com filtros funcionando

---

## Fase 6.5: Refatoração ConfigModule
**Status**: ✅ Concluído

### Tarefas
- [x] Implementar `ConfigModule.forRoot` com validação via class-validator
- [x] Criar `env.validation.ts` com `EnvironmentVariables` class e função `validate()`
- [x] Migrar `TypeOrmModule` para `forRootAsync` com `ConfigService`
- [x] Migrar `BullModule` para `forRootAsync` com `ConfigService`
- [x] Migrar `ThrottlerModule` para `forRootAsync` com `ConfigService`
- [x] Migrar `main.ts` para usar `ConfigService` para PORT
- [x] Migrar `SyncProcessor` para usar `ConfigService` para BATCH_SIZE
- [x] Migrar `SyncBatchProcessor` para usar `ConfigService` para WORKER_CONCURRENCY
- [x] Usar `OnModuleInit` para configurar concurrency do worker (evita erro de inicialização)
- [x] Mover lógica de métricas de `SyncController` para `SyncService`
- [x] Mover lógica de CSV de `UserController` para `UserService`
- [x] Criar DTOs: `SyncStatusDto`, `TriggerSyncResponseDto`, `ResetSyncResponseDto`
- [x] Remover `typeorm.config.ts` (config inline no AppModule)
- [x] Remover constantes `BATCH_SIZE` e `WORKER_CONCURRENCY` de `sync.constants.ts`
- [x] Adicionar toggle `TYPEORM_LOGGING` para logs do ORM

### Justificativa
- Validação centralizada de env vars no startup (fail-fast)
- Padrão NestJS idiomático com `ConfigService`
- Lógica de negócio nos services (controllers apenas delegam)
- Configurações operacionais via env vars (sem rebuild para ajustar)

### Critério de Conclusão
Aplicação inicia com validação de env vars, módulos usando ConfigService, controllers sem lógica de negócio

---

## Fase 7: Qualidade e Observabilidade
**Status**: Em andamento

### Tarefas
- [x] Health check endpoints (`GET /health` e `GET /health/details`)
  - `GET /health`: Liveness probe simples para load balancers (rate limit global)
  - `GET /health/details`: Readiness probe com detalhes para observabilidade (rate limit: 10 req/min)
  - Componentes verificados: Database, Redis, API Legada, Sistema, Filas
  - Status: healthy, degraded, unhealthy
  - HTTP 503 quando componentes críticos falham
- [ ] Swagger completo
- [ ] Testes unitários
- [ ] Testes de integração com mocks

### Critério de Conclusão
Coverage > 70%, Swagger documentando todos endpoints

---

## Fase 8: Documentação e Entrega
**Status**: Pendente

### Tarefas
- [ ] `README.md` completo
- [ ] `docs/AWS_ARCHITECTURE.md`
- [ ] `docs/OPTIMIZATIONS.md`
- [ ] `CHANGELOG.md` atualizado
- [ ] Revisão final de código

### Critério de Conclusão
Todos entregáveis prontos
