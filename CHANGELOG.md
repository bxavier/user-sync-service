# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.7.4] - 2025-12-21

### Changed
- Cron de sync agendada alterado para `EVERY_6_HOURS` (era `EVERY_5_MINUTES`)
- Rate limit adicionado ao endpoint `/health` (30 req/min)
- `SyncRetryProcessor` refatorado para usar Queue diretamente (remove dependência circular)
- Variáveis `SYNC_STALE_THRESHOLD_MINUTES` e `SYNC_ESTIMATED_TOTAL_RECORDS` agora configuráveis

### Removed
- Env vars não utilizadas: `SYNC_CRON_EXPRESSION`, `SYNC_RETRY_ATTEMPTS`, `SYNC_RETRY_DELAY`
- Constante `BATCH_SIZE` de `sync.constants.ts` (não utilizada)
- Método `exportUsers()` de `user.service.ts` (não utilizado)
- Métodos `plain()`, `setLogLevels()`, `disableColors()`, `enableColors()` do `CustomLoggerService`

### Added
- `CLAUDE.md` com documentação do projeto para desenvolvimento assistido por IA

---

## [0.7.3] - 2025-12-21

### Changed
- README.md reescrito com documentação completa e detalhada
  - Stack tecnológica com justificativas
  - 3 opções de execução (Docker Compose, local, produção)
  - Tabela completa de variáveis de ambiente
  - Arquitetura do projeto com estrutura de pastas
  - Padrões de resiliência implementados
  - Métricas de performance
  - Checklist do teste técnico
  - Exemplos de uso com curl

---

## [0.7.2] - 2025-12-21

### Changed
- Swagger documentado com contact (Bruno Xavier), license (MIT)

---

## [0.7.1] - 2025-12-21

### Added
- Health check endpoints para observabilidade
  - `GET /health`: Liveness probe simples para load balancers e Kubernetes
  - `GET /health/details`: Readiness probe com detalhes para Datadog, Zabbix, etc.
- `HealthService` com verificação de componentes (Database, Redis, API Legada)
- `HealthController` com documentação Swagger
- DTOs: `HealthResponseDto`, `HealthDetailsResponseDto`, `ComponentHealthDto`
- Métricas do sistema: memória, CPU, uptime
- Estatísticas das filas BullMQ
- Rate limit restritivo no endpoint `/health/details` (10 req/min)

### Changed
- Status de saúde com 3 níveis: healthy, degraded, unhealthy
- HTTP 503 quando componentes críticos (DB, Redis) falham
- API legada indisponível marca status como `degraded` (não `unhealthy`)

---

## [0.7.0] - 2025-12-21

### Added
- Retry Queue para sync falho (agenda retry automático em 10 minutos)
- `SyncRetryProcessor` para processar retries da fila `user-sync-retry`
- Variável `SYNC_RETRY_DELAY_MS` para configurar delay do retry (default: 600000ms = 10 min)
- Logs de timing detalhados para diagnóstico de performance
- Raw SQL bulk upsert com `INSERT ... ON CONFLICT` para SQLite

### Changed
- Retry HTTP otimizado: `initialDelayMs: 100`, `maxDelayMs: 500`, `backoffMultiplier: 1.5`
- `SyncProcessor` agora usa `ConfigService` para `SYNC_BATCH_SIZE` e `SYNC_RETRY_DELAY_MS`
- Streaming non-blocking: callbacks enfileiram sem bloquear o stream
- Removidas constantes hardcoded `BATCH_SIZE` e `SYNC_RETRY_DELAY_MS` de `sync.constants.ts`

### Fixed
- Performance de sync: de ~170 reg/s para ~800-850 reg/s
- Erro "Cannot update entity because entity id is not set" com TypeORM upsert (resolvido com raw SQL)
- Gargalo de retry HTTP que causava delays de 2-30 segundos por erro

### Performance
- 1 milhão de usuários sincronizados em ~18-20 minutos (antes: ~83 minutos)
- Throughput: ~800-850 registros/segundo (limite teórico da API legada: ~1000 reg/s)

---

## [0.6.5] - 2024-12-21

### Added
- ConfigModule com validação centralizada de variáveis de ambiente via class-validator
- Arquivo `env.validation.ts` com classe `EnvironmentVariables` e função `validate()`
- Validação fail-fast no startup (aplicação não inicia se env vars obrigatórias estiverem faltando)
- Variável `TYPEORM_LOGGING` para toggle de logs SQL
- DTOs centralizados: `SyncStatusDto`, `TriggerSyncResponseDto`, `ResetSyncResponseDto`
- Recuperação de syncs travadas com 3 mecanismos:
  - Timeout automático (30 min) no `triggerSync`
  - Recovery no startup via `OnModuleInit` no `SyncService`
  - Endpoint `POST /sync/reset` para reset manual
- Método `markStaleAsFailed` no `SyncLogRepository`
- Endpoint `GET /users/export/csv` com streaming response
- `ExportCsvQueryDto` com filtros `created_from` e `created_to`
- `findAllForExport` no repositório (async generator com batches de 1000)
- `exportUsersCsv` no `UserService` para formatação CSV

### Changed
- TypeORM, BullMQ, Throttler agora usam `forRootAsync` com ConfigService
- Lógica de métricas movida de `SyncController` para `SyncService.getLatestSyncStatus()`
- Lógica de CSV movida de `UserController` para `UserService.exportUsersCsv()`
- `SyncBatchProcessor` usa `OnModuleInit` para configurar concurrency do worker
- Controllers agora são "thin" (apenas delegam para services)
- Variáveis `SYNC_BATCH_SIZE`, `SYNC_WORKER_CONCURRENCY`, `SYNC_CRON_EXPRESSION` configuráveis via env
- Cron de sync alterado de 5 minutos para 6 horas (`0 */6 * * *`)

### Removed
- Arquivo `typeorm.config.ts` (configuração inline no AppModule)
- Constantes `BATCH_SIZE` e `WORKER_CONCURRENCY` de `sync.constants.ts`
- Uso direto de `process.env` em favor de `ConfigService`

### Fixed
- Erro "Worker has not yet been initialized" ao configurar concurrency no construtor
- Syncs ficando em status RUNNING/PROCESSING indefinidamente após crash da aplicação
- Tabela errada no SQL raw (`"user"` para `"users"`)
- Nomes de colunas errados no SQL raw (camelCase para snake_case)

---

## Histórico Anterior (Fases 1-6)

### Fase 1: Setup do Projeto
- Setup inicial do projeto NestJS com Fastify
- Configuração TypeORM + SQLite
- Configuração BullMQ + Redis
- Estrutura de pastas DDD simplificado
- Docker e docker-compose para desenvolvimento local
- Variáveis de ambiente (.env.example)
- Configuração Swagger separada
- LoggerService customizado (estende ConsoleLogger do NestJS)
- TypeORM logger integrado ao formato NestJS

### Fase 2: Domínio e Persistência
- Entidade `User` com soft delete (campo `deleted` + `deletedAt`)
- Entidade `SyncLog` com enum `SyncStatus`
- Interface `UserRepository` + implementação `UserRepositoryImpl`
- Interface `SyncLogRepository` + implementação `SyncLogRepositoryImpl`
- Providers centralizados em `repositories.providers.ts`

### Fase 3: CRUD de Usuários
- DTOs com validação (`CreateUserDto`, `UpdateUserDto`, `PaginationDto`, `UserResponseDto`)
- `UserService` com lógica de negócio
- `UserController` com endpoints REST completos
- `HttpExceptionFilter` global com logging
- Documentação Swagger via decorators

### Fase 4: Cliente do Sistema Legado
- `LegacyApiClient` com axios para consumir API legada (streaming real)
- `withRetry` - Retry com exponential backoff
- `CircuitBreaker` - Circuit breaker para proteção contra falhas cascata
- Interface `LegacyUser` para tipagem dos dados do sistema legado

### Fase 5: Sincronização com BullMQ
- `SyncProcessor` - Orquestrador que recebe streaming e enfileira batches
- `SyncBatchProcessor` - Worker paralelo (concurrency: 20) que processa batches
- `bulkUpsertByUserName` - Bulk insert/update com transação explícita
- `SyncService` com idempotência (verifica PENDING/RUNNING/PROCESSING)
- `SyncController` com endpoints POST /sync, GET /sync/status, GET /sync/history
- Cron job para sincronização periódica
- Performance: 1M usuários sincronizados em ~18 minutos (~920 rec/s)

### Fase 6: Exportação CSV e Melhorias
- Endpoint `GET /users/export/csv` com streaming
- Métricas detalhadas no endpoint de status
- Otimizações de performance (batch size, worker concurrency, transações)
