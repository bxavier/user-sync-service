# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

#### Fase 1: Setup do Projeto
- Setup inicial do projeto NestJS com Fastify
- Configuração TypeORM + SQLite
- Configuração BullMQ + Redis
- Estrutura de pastas DDD simplificado
- Docker e docker-compose para desenvolvimento local
- Variáveis de ambiente (.env.example)
- Configuração Swagger separada
- LoggerService customizado (estende ConsoleLogger do NestJS)
- TypeORM logger integrado ao formato NestJS
- Documentação do projeto (.ai/)
  - agents.md - Boas práticas e diretrizes
  - architecture.md - Decisões arquiteturais
  - roadmap.md - Roadmap de desenvolvimento
  - tech-decisions.md - Log de decisões técnicas
  - CONTEXT.md - Contexto para novos prompts

#### Fase 2: Domínio e Persistência
- Entidade `User` com soft delete (campo `deleted` + `deletedAt`)
- Entidade `SyncLog` com enum `SyncStatus`
- Interface `UserRepository` + implementação `UserRepositoryImpl`
- Interface `SyncLogRepository` + implementação `SyncLogRepositoryImpl`
- Providers centralizados em `repositories.providers.ts`

#### Fase 3: CRUD de Usuários
- DTOs com validação (`CreateUserDto`, `UpdateUserDto`, `PaginationDto`, `UserResponseDto`)
- `UserService` com lógica de negócio
- `UserController` com endpoints REST completos
  - `GET /users` - Lista com paginação
  - `GET /users/:user_name` - Busca por user_name
  - `POST /users` - Cria novo usuário
  - `PUT /users/:id` - Atualiza usuário
  - `DELETE /users/:id` - Soft delete
- `HttpExceptionFilter` global com logging
- Documentação Swagger via decorators

#### Fase 4: Cliente do Sistema Legado
- `LegacyApiClient` com axios para consumir API legada (streaming real com `responseType: 'stream'`)
- `withRetry` - Retry com exponential backoff
- `CircuitBreaker` - Circuit breaker para proteção contra falhas cascata
- Interface `LegacyUser` para tipagem dos dados do sistema legado

#### Fase 5: Sincronização com BullMQ
- `SyncProcessor` - Orquestrador que recebe streaming e enfileira batches
- `SyncBatchProcessor` - Worker paralelo (concurrency: 5) que processa batches de 1000 usuários
- `bulkUpsertByUserName` - Bulk insert/update usando userName como chave única
- `SyncService` com idempotência (verifica PENDING/RUNNING/PROCESSING)
- `SyncController` com endpoints POST /sync, GET /sync/status, GET /sync/history
- Cron job para sincronização periódica (a cada 5 minutos)
- Status `PROCESSING` no enum `SyncStatus` para rastrear fase de batch processing
- Performance: 1M usuários sincronizados em ~27 minutos

### Fixed
- Corrigido erro de compilação em `LegacyApiClient` (propriedade inexistente no CircuitBreakerConfig)
- Corrigido método `findLatest` no `SyncLogRepository` (usar find com take:1 em vez de findOne)
