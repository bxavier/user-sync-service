# Contexto do Projeto - User Service

> **Use este arquivo para iniciar um novo prompt de desenvolvimento.**

## Instrução para o Assistente

Leia os seguintes arquivos de contexto antes de continuar o desenvolvimento:

1. `.ai/agents.md` - Visão geral, endpoints, regras de negócio, padrões de código
2. `.ai/roadmap.md` - Fases de desenvolvimento e status atual
3. `.ai/architecture.md` - Arquitetura e fluxos
4. `.ai/tech-decisions.md` - Decisões técnicas tomadas

## Status Atual

**Fase 1 (Setup)**: Concluída

- NestJS + Fastify configurado
- TypeORM + SQLite configurado
- BullMQ + Redis configurado
- Docker + docker-compose configurado
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

- [x] Configurar BullMQ Queue (`SYNC_QUEUE_NAME`)
- [x] Criar `SyncProcessor` (worker)
- [x] Lógica de deduplicação por `legacyId` (via `upsertByLegacyId`)
- [x] Histórico/log de execuções (SyncLog)
- [x] Endpoint `POST /sync`
- [x] Endpoints `GET /sync/status` e `GET /sync/history`
- [x] Cron job para sync periódico (a cada 5 minutos)
- [x] Garantir idempotência (verifica se já existe sync PENDING/RUNNING)

## Tarefas Pendentes (Fase 6 - Exportação CSV)

- [ ] Endpoint `GET /users/export/csv`
- [ ] Filtros `created_from`, `created_to`
- [ ] Streaming response

## Arquivos Principais do Projeto

```
user-service/
├── src/
│   ├── app.module.ts                    # Módulo principal (com ThrottlerModule, ScheduleModule)
│   ├── main.ts                          # Bootstrap com Fastify
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── user.entity.ts           # ✅ User entity (soft delete)
│   │   │   └── sync-log.entity.ts       # ✅ SyncLog entity (com SyncStatus enum)
│   │   └── repositories/
│   │       ├── index.ts                 # Barrel exports
│   │       ├── user.repository.interface.ts    # ✅ UserRepository interface
│   │       └── sync-log.repository.interface.ts # ✅ SyncLogRepository interface
│   ├── application/
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── user.service.ts          # ✅ UserService
│   │   │   └── sync.service.ts          # ✅ SyncService (enfileiramento + cron)
│   │   └── dtos/
│   │       ├── index.ts
│   │       ├── create-user.dto.ts       # ✅ CreateUserDto
│   │       ├── update-user.dto.ts       # ✅ UpdateUserDto
│   │       ├── pagination.dto.ts        # ✅ PaginationDto
│   │       └── user-response.dto.ts     # ✅ UserResponseDto, PaginatedUsersResponseDto
│   ├── infrastructure/
│   │   ├── config/
│   │   │   └── swagger.config.ts
│   │   ├── database/
│   │   │   ├── typeorm.config.ts
│   │   │   └── typeorm-logger.ts        # Logger TypeORM → NestJS format
│   │   ├── logger/
│   │   │   ├── custom-logger.service.ts # LoggerService (ConsoleLogger)
│   │   │   └── index.ts
│   │   ├── repositories/
│   │       ├── index.ts                 # Barrel exports
│   │       ├── user.repository.ts       # ✅ UserRepositoryImpl
│   │       ├── sync-log.repository.ts   # ✅ SyncLogRepositoryImpl
│   │       └── repositories.providers.ts # ✅ Providers centralizados
│   │   ├── legacy/                      # Cliente API legada
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── legacy-api.client.ts     # ✅ LegacyApiClient (axios + retry + circuit breaker)
│   │   │   ├── legacy-user.interface.ts # ✅ Interface LegacyUser
│   │   │   └── stream-parser.ts         # ✅ StreamParser para JSON concatenado
│   │   ├── resilience/                  # Padrões de resiliência
│   │   │   ├── index.ts                 # Barrel exports
│   │   │   ├── retry.ts                 # ✅ withRetry (exponential backoff)
│   │   │   └── circuit-breaker.ts       # ✅ CircuitBreaker
│   │   └── queue/                       # BullMQ
│   │       ├── index.ts                 # Barrel exports
│   │       ├── sync.constants.ts        # ✅ SYNC_QUEUE_NAME, SYNC_JOB_NAME
│   │       └── sync.processor.ts        # ✅ SyncProcessor (worker)
│   └── presentation/
│       ├── controllers/
│       │   ├── index.ts
│       │   ├── user.controller.ts       # ✅ UserController (CRUD endpoints)
│       │   └── sync.controller.ts       # ✅ SyncController (POST /sync, GET /sync/status)
│       └── filters/
│           ├── index.ts
│           └── http-exception.filter.ts # ✅ HttpExceptionFilter global
├── .env                                 # Variáveis de ambiente
├── docker-compose.yml
└── package.json
```

## Como Rodar

```bash
# Redis (em container separado)
docker run -d --name redis-local -p 6379:6379 redis:7-alpine

# Desenvolvimento local (recomendado)
npm run start:dev

# Swagger disponível em: http://localhost:3000/api/docs
```

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

| Arquivo | Propósito |
|---------|-----------|
| `.ai/CONTEXT.md` | Ponto de entrada para novos prompts |
| `.ai/agents.md` | Regras de negócio e padrões de código |
| `.ai/roadmap.md` | Fases e progresso do desenvolvimento |
| `.ai/architecture.md` | Arquitetura e componentes |
| `.ai/tech-decisions.md` | Log de decisões técnicas |
| `docs/TECHNICAL_IMPLEMENTATION.md` | Como cada parte foi implementada |
| `CHANGELOG.md` | Histórico de mudanças |
| `README.md` | Instruções de uso e setup |
