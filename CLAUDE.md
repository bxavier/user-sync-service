# CLAUDE.md - User Sync Service

> Documento de contexto para desenvolvimento assistido por IA. Contém arquitetura, padrões e diretrizes do projeto.

---

## Visão Geral

Serviço de integração que sincroniza dados de um sistema legado instável (~1M usuários), mantém base própria e disponibiliza endpoints REST.

### Stack Tecnológica

| Camada         | Tecnologia       |
| -------------- | ---------------- |
| Framework      | NestJS + Fastify |
| Banco de Dados | SQLite + TypeORM |
| Fila           | BullMQ + Redis   |
| Validação      | class-validator  |
| Documentação   | Swagger/OpenAPI  |

---

## Arquitetura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    POST /sync   │────▶│  Sync Queue     │────▶│ SyncProcessor   │
│   (Controller)  │     │  (user-sync)    │     │ (Orquestrador)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │ streaming
                                                         ▼
┌─────────────────┐                            ┌─────────────────┐
│  Legacy API     │◀───streaming───────────────│ LegacyApiClient │
│  (Port 3001)    │                            │ (axios stream)  │
└─────────────────┘                            └────────┬────────┘
                                                        │ batch (2000 users)
                                                        ▼
                                               ┌─────────────────┐
                                               │ Batch Queue     │
                                               │(user-sync-batch)│
                                               └────────┬────────┘
                                                        │ parallel workers
                                                        ▼
                                               ┌──────────────────┐
                                               │SyncBatchProcessor│
                                               │   (bulkUpsert)   │
                                               └────────┬─────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │    SQLite DB    │
                                               └─────────────────┘
```

### Camadas DDD

```
src/
├── domain/           # Entidades e interfaces de repositório
├── application/      # Serviços e DTOs
├── infrastructure/   # Implementações concretas
└── presentation/     # Controllers e filtros
```

---

## Sistema Legado

- **Endpoint**: `GET /external/users`
- **Autenticação**: Header `x-api-key: {LEGACY_API_KEY}`
- **Porta**: 3001
- **Formato**: Streaming JSON concatenado (arrays de 100 registros, sem separador)

### Comportamentos Instáveis

| Problema              | Probabilidade | Tratamento                        |
| --------------------- | ------------- | --------------------------------- |
| Erro 500              | 20%           | Retry com exponential backoff     |
| Erro 429 (rate limit) | 20%           | Circuit breaker                   |
| JSON Corrompido       | 20%           | StreamParser extrai JSONs válidos |
| Duplicatas            | Frequente     | Deduplicação por userName         |
| Soft Delete           | Frequente     | Respeita flag `deleted: true`     |

### Limitações Críticas

| Característica    | Impacto                                |
| ----------------- | -------------------------------------- |
| Sem paginação     | Streaming completo obrigatório         |
| Sem cursor/offset | Se conexão cair, recomeça do zero      |
| ~1M usuários      | Streaming leva ~18-20 min              |
| Lambda 15min      | **Não funciona** - necessário ECS Task |

---

## Endpoints da API

### Users

| Método | Endpoint          | Descrição               |
| ------ | ----------------- | ----------------------- |
| GET    | /users            | Lista paginada          |
| GET    | /users/:user_name | Busca por userName      |
| GET    | /users/export/csv | Exporta CSV (streaming) |
| POST   | /users            | Cria usuário            |
| PUT    | /users/:id        | Atualiza usuário        |
| DELETE | /users/:id        | Soft delete             |

### Sync

| Método | Endpoint      | Descrição             |
| ------ | ------------- | --------------------- |
| POST   | /sync         | Dispara sincronização |
| GET    | /sync/status  | Status com métricas   |
| GET    | /sync/history | Histórico             |
| POST   | /sync/reset   | Reseta sync travada   |

### Health

| Método | Endpoint        | Descrição              |
| ------ | --------------- | ---------------------- |
| GET    | /health         | Liveness probe         |
| GET    | /health/details | Readiness com detalhes |

---

## Regras de Negócio

1. **Soft Delete**: Todos endpoints retornam apenas `deleted = false`
2. **Unicidade**: `user_name` deve ser único
3. **Deduplicação**: Em duplicatas, manter registro com `createdAt` mais recente
4. **Idempotência**: Múltiplas syncs não causam inconsistências

---

## Padrões de Resiliência

### Retry com Exponential Backoff

```typescript
const retryConfig = {
  maxAttempts: 10,
  initialDelayMs: 100,
  maxDelayMs: 500,
  backoffMultiplier: 1.5,
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

1. **Timeout automático**: Syncs > 30 min são marcadas como FAILED
2. **Recovery no startup**: OnModuleInit marca syncs órfãs como FAILED
3. **Reset manual**: `POST /sync/reset`

---

## Variáveis de Ambiente

| Variável                       | Obrigatório | Default                  | Descrição                          |
| ------------------------------ | ----------- | ------------------------ | ---------------------------------- |
| `NODE_ENV`                     | Não         | `development`            | Ambiente (dev/prod/test)           |
| `PORT`                         | Não         | `3000`                   | Porta da aplicação                 |
| `DATABASE_PATH`                | Não         | `./data/database.sqlite` | Caminho do SQLite                  |
| `REDIS_HOST`                   | **Sim**     | -                        | Host do Redis                      |
| `REDIS_PORT`                   | **Sim**     | -                        | Porta do Redis                     |
| `LEGACY_API_URL`               | **Sim**     | -                        | URL da API legada                  |
| `LEGACY_API_KEY`               | **Sim**     | -                        | Chave de autenticação              |
| `SYNC_BATCH_SIZE`              | Não         | `2000`                   | Usuários por batch                 |
| `SYNC_WORKER_CONCURRENCY`      | Não         | `1`                      | Workers paralelos                  |
| `SYNC_STALE_THRESHOLD_MINUTES` | Não         | `30`                     | Timeout para sync travada (min)    |
| `SYNC_ESTIMATED_TOTAL_RECORDS` | Não         | `1000000`                | Estimativa de registros no legado  |
| `TYPEORM_LOGGING`              | Não         | `true`                   | Habilita logs do TypeORM           |
| `RATE_LIMIT_TTL`               | Não         | `60`                     | TTL do rate limit (segundos)       |
| `RATE_LIMIT_MAX`               | Não         | `100`                    | Máximo de requests por TTL         |

---

## Estrutura de Arquivos

```
src/
├── app.module.ts                    # Módulo principal
├── main.ts                          # Bootstrap Fastify
├── domain/
│   ├── entities/
│   │   ├── user.entity.ts           # User (soft delete)
│   │   └── sync-log.entity.ts       # SyncLog (enum SyncStatus)
│   └── repositories/
│       ├── user.repository.interface.ts
│       └── sync-log.repository.interface.ts
├── application/
│   ├── services/
│   │   ├── user.service.ts          # CRUD + CSV export
│   │   ├── sync.service.ts          # Enfileiramento + cron
│   │   └── health.service.ts        # Verificação componentes
│   └── dtos/                        # DTOs com validação
├── infrastructure/
│   ├── config/
│   │   ├── env.validation.ts        # Validação env vars
│   │   └── swagger.config.ts
│   ├── repositories/                # Implementações TypeORM
│   ├── legacy/                      # LegacyApiClient
│   ├── resilience/                  # Retry, CircuitBreaker
│   └── queue/                       # BullMQ processors
└── presentation/
    ├── controllers/                 # REST endpoints
    └── filters/                     # HttpExceptionFilter
```

---

## Padrões de Código

### TypeScript

- **NUNCA usar `any`** - sempre tipos explícitos
- Interfaces para contratos, types para unions

### NestJS

```typescript
@Controller('users')
@ApiTags('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Lista usuários' })
  @ApiResponse({ status: 200, description: 'Lista de usuários' })
  async findAll(@Query() query: PaginationDto) {}
}
```

### DTOs

```typescript
export class CreateUserDto {
  @ApiProperty({ example: 'john_doe' })
  @IsNotEmpty()
  @IsString()
  userName: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}
```

---

## Princípios

- **SOLID** aplicado pragmaticamente
- **KISS** - simplicidade sobre complexidade
- **YAGNI** - não implementar o que não é necessário
- **DRY** - evite repetição desnecessária de código
- **Controllers thin** - lógica apenas nos services

---

### Pendente

- Testes unitários e de integração
- `docs/OPTIMIZATIONS.md`
- `README.md` completo

---

## Como Rodar

```bash
# Docker Compose (recomendado)
make dev

# Local (requer Redis)
docker run -d --name redis-local -p 6379:6379 redis:7-alpine
npm run start:dev

# Swagger: http://localhost:3000/api/docs
```

### Comandos do Makefile

| Comando      | Descrição                          |
| ------------ | ---------------------------------- |
| `make dev`   | Inicia em modo desenvolvimento     |
| `make stop`  | Para todos os containers           |
| `make logs`  | Mostra logs (follow mode)          |
| `make build` | Builda imagem de produção          |
| `make clean` | Remove containers, volumes e dados |
| `make help`  | Lista todos os comandos            |

---

## Commits

```
type(scope): description

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Types**: feat, fix, refactor, docs, test, chore, perf
