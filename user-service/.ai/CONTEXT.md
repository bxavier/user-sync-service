# Contexto do Projeto - User Service

> **Use este arquivo para iniciar um novo prompt de desenvolvimento.**

## Instrução para o Assistente

**OBRIGATÓRIO**: Leia os seguintes arquivos antes de continuar o desenvolvimento:

1. `.ai/agents.md` - Visão geral, endpoints, regras de negócio, padrões de código
2. `.ai/roadmap.md` - Fases de desenvolvimento e status atual
3. `.ai/architecture.md` - Arquitetura e fluxos
4. `.ai/tech-decisions.md` - Decisões técnicas tomadas
5. `.env` - Variáveis de ambiente atuais (valores reais em uso)

**IMPORTANTE**: Além de ler, você DEVE manter estes arquivos atualizados ao concluir tarefas.

## Premissas da API Legada

A API legada possui características que impactam diretamente as decisões de arquitetura:

| Característica | Valor | Impacto |
|----------------|-------|---------|
| **Paginação** | Não suporta | Não é possível buscar usuários em partes |
| **Formato de resposta** | Streaming JSON concatenado | Cada objeto JSON é enviado separadamente |
| **Volume de dados** | ~1M usuários | Streaming completo leva ~18-20 min |
| **Cursor/Offset** | Não suporta | Não é possível retomar de onde parou |
| **Autenticação** | API Key no header | `X-API-Key: {LEGACY_API_KEY}` |

**Implicações para arquitetura AWS:**
- Lambda (15 min timeout) **não funciona** para orquestrar o streaming completo
- Necessário usar **ECS Task** (sem timeout) para o orchestrator
- Não é possível dividir o streaming em chunks menores
- Se a conexão cair, o processo precisa recomeçar do zero

## Status Atual

**Fase 1 (Setup)**: Concluída

- NestJS + Fastify configurado
- TypeORM + SQLite configurado
- BullMQ + Redis configurado
- Docker + Makefile configurado (docker-compose apenas para dev)
- Estrutura DDD criada
- LoggerService customizado (estende ConsoleLogger do NestJS)
- TypeORM logger integrado ao formato NestJS

**Fase 2 (Domínio e Persistência)**: Concluída

- [x] `User` entity criada (com soft delete via campo `deleted`)
- [x] `SyncLog` entity criada (com enum `SyncStatus`)
- [x] Entidades registradas no TypeORM (`TypeOrmModule.forFeature`)
- [x] Interface `UserRepository` + `UserRepositoryImpl`
- [x] Interface `SyncLogRepository` + `SyncLogRepositoryImpl`
- [x] Providers centralizados em `repositories.providers.ts`

**Fase 3 (CRUD de Usuários)**: Concluída

- [x] DTOs com validação (CreateUserDto, UpdateUserDto, PaginationDto, UserResponseDto)
- [x] `UserService` com lógica de negócio
- [x] `UserController` com endpoints REST
- [x] `HttpExceptionFilter` global
- [x] Swagger documentation via decorators

**Fase 4 (Cliente do Sistema Legado)**: Concluída

- [x] `LegacyApiClient` com axios
- [x] `StreamParser` para JSON concatenado
- [x] Retry com exponential backoff (`withRetry`)
- [x] Circuit breaker simples
- [x] Tratamento de JSON corrompido (via StreamParser)
- [x] Logging detalhado

**Fase 5 (Sincronização com BullMQ)**: Concluída

- [x] Configurar BullMQ Queue (`SYNC_QUEUE_NAME`, `SYNC_BATCH_QUEUE_NAME`)
- [x] Criar `SyncProcessor` (orquestrador - recebe streaming e enfileira batches)
- [x] Criar `SyncBatchProcessor` (worker - processa batches em paralelo, concurrency configurável)
- [x] Lógica de deduplicação por `userName` (via `bulkUpsertByUserName`)
- [x] Histórico/log de execuções (SyncLog com status PROCESSING)
- [x] Endpoint `POST /sync`
- [x] Endpoints `GET /sync/status` e `GET /sync/history`
- [x] Cron job para sync periódico (a cada 6 horas, configurável)
- [x] Garantir idempotência (verifica se já existe sync PENDING/RUNNING/PROCESSING)
- [x] Streaming real com axios (`responseType: 'stream'`)
- [x] Batch processing (configurável via `SYNC_BATCH_SIZE`) para suportar 1M+ registros
- [x] **Recuperação de syncs travadas**:
  - Timeout automático: syncs em andamento há mais de 30 min são marcadas como FAILED
  - Recovery no startup: syncs órfãs são marcadas como FAILED ao reiniciar a aplicação
  - Endpoint `POST /sync/reset`: permite reset manual de sync travada

**Fase 6 (Exportação CSV)**: Concluída

- [x] Endpoint `GET /users/export/csv`
- [x] Filtros `created_from`, `created_to`
- [x] Streaming response com cursor-based pagination
- [x] `ExportCsvQueryDto` com validação de datas
- [x] `findAllForExport` no repositório (async generator)
- [x] Lógica de formatação CSV movida para `UserService`

**Fase 6.5 (Refatoração ConfigModule)**: Concluída

- [x] ConfigModule com validação centralizada via class-validator
- [x] Todas env vars validadas no startup (falha rápido se inválidas)
- [x] TypeORM, BullMQ, Throttler usando `forRootAsync` com ConfigService
- [x] Lógica de negócio movida dos controllers para services
- [x] DTOs centralizados em `application/dtos/`
- [x] Removido `typeorm.config.ts` (config inline no AppModule)
- [x] Toggle para logs do TypeORM via `TYPEORM_LOGGING`

**Fase 7 (Qualidade e Observabilidade)**: Em andamento

- [x] Health check endpoints (`GET /health` e `GET /health/details`)
  - Liveness probe simples (`/health`) para load balancers
  - Readiness probe detalhado (`/health/details`) para observabilidade
  - Verifica: Database, Redis, API Legada, Sistema (memória, CPU, uptime), Filas
  - Rate limit restritivo no endpoint detalhado (10 req/min)
- [x] Swagger documentado (contact, license, DTOs com @ApiProperty, endpoints com @ApiOperation/@ApiResponse)
- [ ] Testes unitários
- [ ] Testes de integração

## Tarefas Pendentes

- [ ] Testes unitários
- [ ] Testes de integração
- [ ] `README.md` completo
- [ ] `docs/OPTIMIZATIONS.md`
- [ ] `CHANGELOG.md` atualizado
- [ ] Revisão final de código

## Tarefas Concluídas (Fase 8)

- [x] `docs/AWS_ARCHITECTURE.md` - Arquitetura mínima viável para AWS (ECS Fargate, RDS, ElastiCache)

## Arquivos Principais do Projeto

```
user-service/
├── src/
│   ├── app.module.ts                    # Módulo principal (ConfigModule, TypeORM, BullMQ, Throttler async)
│   ├── main.ts                          # Bootstrap com Fastify + ConfigService
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── user.entity.ts           # User entity (soft delete)
│   │   │   └── sync-log.entity.ts       # SyncLog entity (com SyncStatus enum)
│   │   └── repositories/
│   │       ├── index.ts                 # Barrel exports
│   │       ├── user.repository.interface.ts    # UserRepository interface
│   │       └── sync-log.repository.interface.ts # SyncLogRepository interface
│   ├── application/
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── user.service.ts          # UserService (CRUD + CSV export)
│   │   │   ├── sync.service.ts          # SyncService (enfileiramento + cron + reset + status metrics)
│   │   │   └── health.service.ts        # HealthService (verificação de componentes)
│   │   └── dtos/
│   │       ├── index.ts
│   │       ├── create-user.dto.ts       # CreateUserDto
│   │       ├── update-user.dto.ts       # UpdateUserDto
│   │       ├── pagination.dto.ts        # PaginationDto
│   │       ├── user-response.dto.ts     # UserResponseDto, PaginatedUsersResponseDto
│   │       ├── export-csv-query.dto.ts  # ExportCsvQueryDto
│   │       ├── sync-response.dto.ts     # SyncStatusDto, TriggerSyncResponseDto, ResetSyncResponseDto
│   │       └── health-response.dto.ts   # HealthResponseDto, HealthDetailsResponseDto, ComponentHealthDto
│   ├── infrastructure/
│   │   ├── config/
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── swagger.config.ts        # Configuração Swagger
│   │   │   └── env.validation.ts        # Validação de env vars com class-validator
│   │   ├── database/
│   │   │   └── typeorm-logger.ts        # Logger TypeORM → NestJS format
│   │   ├── logger/
│   │   │   ├── custom-logger.service.ts # LoggerService (ConsoleLogger)
│   │   │   └── index.ts
│   │   ├── repositories/
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── user.repository.ts       # UserRepositoryImpl
│   │   │   ├── sync-log.repository.ts   # SyncLogRepositoryImpl
│   │   │   └── repositories.providers.ts # Providers centralizados
│   │   ├── legacy/                      # Cliente API legada
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── legacy-api.client.ts     # LegacyApiClient (axios + retry + circuit breaker)
│   │   │   ├── legacy-user.interface.ts # Interface LegacyUser
│   │   │   └── stream-parser.ts         # StreamParser para JSON concatenado
│   │   ├── resilience/                  # Padrões de resiliência
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── retry.ts                 # withRetry (exponential backoff)
│   │   │   └── circuit-breaker.ts       # CircuitBreaker
│   │   └── queue/                       # BullMQ
│   │       ├── index.ts                 # Barrel exports
│   │       ├── sync.constants.ts        # SYNC_QUEUE_NAME, SYNC_BATCH_QUEUE_NAME
│   │       ├── sync.processor.ts        # SyncProcessor (orquestrador)
│   │       └── sync-batch.processor.ts  # SyncBatchProcessor (worker paralelo + OnModuleInit)
│   └── presentation/
│       ├── controllers/
│       │   ├── index.ts
│       │   ├── user.controller.ts       # UserController (CRUD + CSV export)
│       │   ├── sync.controller.ts       # SyncController (POST /sync, GET /sync/status, POST /sync/reset)
│       │   └── health.controller.ts     # HealthController (GET /health, GET /health/details)
│       └── filters/
│           ├── index.ts
│           └── http-exception.filter.ts # HttpExceptionFilter global
├── docker/
│   ├── Dockerfile                       # Imagem de produção (multi-stage)
│   ├── Dockerfile.dev                   # Imagem de desenvolvimento (hot reload)
│   └── docker-compose.dev.yml           # Docker Compose apenas para dev
├── .env                                 # Variáveis de ambiente
├── Makefile                             # Comandos: make dev, make stop, make build
└── package.json
```

## Variáveis de Ambiente

| Variável                  | Obrigatório | Default                  | Valor Atual              | Descrição                              |
| ------------------------- | ----------- | ------------------------ | ------------------------ | -------------------------------------- |
| `NODE_ENV`                | Não         | `development`            | `development`            | Ambiente (development/production/test) |
| `PORT`                    | Não         | `3000`                   | `3000`                   | Porta da aplicação                     |
| `DATABASE_PATH`           | Não         | `./data/database.sqlite` | `./data/database.sqlite` | Caminho do SQLite                      |
| `TYPEORM_LOGGING`         | Não         | `true`                   | `false`                  | Habilita logs do TypeORM               |
| `REDIS_HOST`              | **Sim**     | -                        | `localhost`              | Host do Redis                          |
| `REDIS_PORT`              | **Sim**     | -                        | `6379`                   | Porta do Redis                         |
| `LEGACY_API_URL`          | **Sim**     | -                        | `http://localhost:3001`  | URL da API legada                      |
| `LEGACY_API_KEY`          | **Sim**     | -                        | `test-api-key-2024`      | Chave de autenticação da API legada    |
| `SYNC_CRON_EXPRESSION`    | Não         | `0 */6 * * *`            | `0 */6 * * *`            | Expressão cron para sync automática    |
| `SYNC_RETRY_ATTEMPTS`     | Não         | `3`                      | `3`                      | Tentativas de retry                    |
| `SYNC_RETRY_DELAY`        | Não         | `1000`                   | `1000`                   | Delay (ms) entre retries               |
| `SYNC_BATCH_SIZE`         | Não         | `1000`                   | `1000`                   | Usuários por batch                     |
| `SYNC_WORKER_CONCURRENCY` | Não         | `1`                      | `1`                      | Workers paralelos                      |
| `SYNC_RETRY_DELAY_MS`     | Não         | `600000`                 | `600000`                 | Delay (ms) para retry de sync falha    |
| `RATE_LIMIT_TTL`          | Não         | `60`                     | `60`                     | TTL do rate limit (segundos)           |
| `RATE_LIMIT_MAX`          | Não         | `100`                    | `100`                    | Máximo de requests por TTL             |

## Como Rodar

```bash
# Com Docker (recomendado) - sobe API, Redis e Legacy API
make dev

# Ou sem Docker (requer Redis rodando)
docker run -d --name redis-local -p 6379:6379 redis:7-alpine
npm run start:dev

# Swagger disponível em: http://localhost:3000/api/docs
```

### Comandos do Makefile

| Comando       | Descrição                              |
| ------------- | -------------------------------------- |
| `make dev`    | Inicia em modo desenvolvimento         |
| `make stop`   | Para todos os containers               |
| `make logs`   | Mostra logs (follow mode)              |
| `make build`  | Builda imagem de produção              |
| `make clean`  | Remove containers, volumes e dados     |
| `make help`   | Lista todos os comandos disponíveis    |

## Fluxo de Desenvolvimento

**IMPORTANTE**: Antes de implementar qualquer código, o assistente DEVE:

1. Explicar o que será implementado e por quê
2. Descrever a abordagem técnica escolhida
3. Aguardar aprovação do usuário antes de aplicar as mudanças

## Atualização de Documentação

**OBRIGATÓRIO**: Ao concluir cada tarefa ou fase, o assistente DEVE atualizar:

1. **`.ai/CONTEXT.md`** - Status atual e tarefas pendentes
2. **`.ai/roadmap.md`** - Marcar tarefas como concluídas
3. **`.ai/architecture.md`** - Novos componentes implementados
4. **`.ai/tech-decisions.md`** - Novas decisões técnicas (se houver)
5. **`docs/TECHNICAL_IMPLEMENTATION.md`** - Detalhes da implementação (linguagem simples e direta)
6. **`CHANGELOG.md`** - Novas features e correções
7. **`README.md`** - Instruções de uso (se necessário)

Isso garante que a documentação sempre reflete o estado real do projeto.

## Commits

Usar conventional commits:

```
feat(scope): descrição curta

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Documentação do Projeto

**LEITURA OBRIGATÓRIA** (antes de qualquer desenvolvimento):

| Arquivo                 | Propósito                             | Ação            |
| ----------------------- | ------------------------------------- | --------------- |
| `.ai/CONTEXT.md`        | Ponto de entrada para novos prompts   | Ler + Atualizar |
| `.ai/agents.md`         | Regras de negócio e padrões de código | Ler + Atualizar |
| `.ai/roadmap.md`        | Fases e progresso do desenvolvimento  | Ler + Atualizar |
| `.ai/architecture.md`   | Arquitetura e componentes             | Ler + Atualizar |
| `.ai/tech-decisions.md` | Log de decisões técnicas              | Ler + Atualizar |
| `.env`                  | Variáveis de ambiente atuais          | Ler             |

**Documentação adicional** (atualizar quando relevante):

| Arquivo                            | Propósito                        |
| ---------------------------------- | -------------------------------- |
| `docs/TECHNICAL_IMPLEMENTATION.md` | Como cada parte foi implementada |
| `CHANGELOG.md`                     | Histórico de mudanças            |
| `README.md`                        | Instruções de uso e setup        |
