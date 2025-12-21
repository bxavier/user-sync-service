# Como Este Projeto Foi Construído

Este documento explica, passo a passo, como cada parte do User Service foi implementada. A ideia é que qualquer desenvolvedor consiga entender as decisões tomadas e dar continuidade ao projeto.

---

## Sumário

1. [Sobre o Projeto](#sobre-o-projeto)
2. [Fase 1: Configuração Inicial](#fase-1-configuração-inicial)
3. [Fase 2: Entidades e Repositórios](#fase-2-entidades-e-repositórios)
4. [Fase 3: CRUD de Usuários](#fase-3-crud-de-usuários)
5. [Fase 4: Integração com Sistema Legado](#fase-4-integração-com-sistema-legado)
6. [Fase 5: Sincronização Automática](#fase-5-sincronização-automática)
7. [Fase 6: Exportação CSV](#fase-6-exportação-csv)
8. [Fase 6.5: Refatoração ConfigModule](#fase-65-refatoração-configmodule)
9. [Fase 7: Otimizações de Performance](#fase-7-otimizações-de-performance)
10. [Fase 8: Health Check e Observabilidade](#fase-8-health-check-e-observabilidade)

---

## Sobre o Projeto

O User Service é um serviço que:
- Busca dados de usuários de uma API legada (que falha bastante)
- Guarda esses dados em um banco próprio
- Disponibiliza endpoints REST para consulta e manipulação

A API legada é instável de propósito - ela simula erros 500, rate limiting, JSON corrompido e duplicatas. Nosso serviço precisa lidar com tudo isso.

### Stack escolhida

| O quê | Por quê |
|-------|---------|
| NestJS + Fastify | Framework robusto, Fastify é mais rápido que Express |
| SQLite + TypeORM | Simples pra rodar local, TypeORM facilita queries |
| BullMQ + Redis | Fila de jobs com retry automático |
| Swagger | Documentação da API que já funciona como playground |

---

## Fase 1: Configuração Inicial

**Status**: Concluído

### O que fizemos

Configuramos a base do projeto. Nada de código de negócio ainda, só a infraestrutura.

**1. Criamos o projeto NestJS com Fastify**

O Fastify é mais rápido que o Express padrão. A configuração fica em `main.ts`.

**2. Configuramos o banco de dados**

Usamos SQLite pra facilitar - não precisa instalar nada. O arquivo `typeorm.config.ts` cuida disso. O banco é criado automaticamente na pasta `data/`.

**3. Configuramos o Redis e BullMQ**

A fila de jobs usa Redis. Configuramos no `app.module.ts` para ler host e porta de variáveis de ambiente.

**4. Criamos um logger customizado**

O logger padrão do NestJS é bom, mas precisávamos de metadata estruturada (tipo `{ userId: 123, action: 'create' }`). Estendemos o `ConsoleLogger` em `custom-logger.service.ts`.

**5. Docker**

Criamos `Dockerfile` e `docker-compose.yml` pra subir tudo com um comando.

### Arquivos principais

```
src/
├── main.ts                              # Bootstrap com Fastify
├── app.module.ts                        # Módulo principal
└── infrastructure/
    ├── database/typeorm.config.ts       # Config do banco
    ├── database/typeorm-logger.ts       # Logger do TypeORM
    └── logger/custom-logger.service.ts  # Logger customizado
```

---

## Fase 2: Entidades e Repositórios

**Status**: Concluído

### O que fizemos

Criamos as entidades (tabelas) e os repositórios (camada de acesso a dados).

**1. Entidade User**

Representa um usuário. Campos importantes:
- `legacyId`: ID do usuário no sistema legado (pra gente saber de onde veio)
- `userName`: nome único do usuário
- `deleted` / `deletedAt`: soft delete (não apagamos de verdade, só marcamos)

**2. Entidade SyncLog**

Registra cada execução de sincronização. Assim sabemos:
- Quando rodou
- Quanto tempo levou
- Quantos usuários processou
- Se deu erro

**3. Repositórios com interfaces**

Seguimos o padrão de criar uma interface primeiro (`UserRepository`) e depois a implementação (`UserRepositoryImpl`). Isso facilita testes e troca de implementação.

O método mais importante é o `upsertByLegacyId`:
- Se o usuário já existe (pelo legacyId), atualiza
- Se não existe, cria
- Só atualiza se o dado novo for mais recente que o existente

Isso garante que rodar a sync várias vezes não causa problema.

### Arquivos principais

```
src/
├── domain/
│   ├── entities/
│   │   ├── user.entity.ts         # Entidade User
│   │   └── sync-log.entity.ts     # Entidade SyncLog
│   └── repositories/
│       ├── user.repository.interface.ts      # Interface
│       └── sync-log.repository.interface.ts  # Interface
└── infrastructure/
    └── repositories/
        ├── user.repository.ts       # Implementação
        ├── sync-log.repository.ts   # Implementação
        └── repositories.providers.ts # Config de DI
```

---

## Fase 3: CRUD de Usuários

**Status**: Concluído

### O que fizemos

Criamos os endpoints REST para gerenciar usuários.

**1. DTOs de validação**

DTOs (Data Transfer Objects) definem o formato dos dados de entrada e saída. Usamos decorators do `class-validator`:

```typescript
// CreateUserDto
@IsNotEmpty()
@MaxLength(50)
userName: string;

@IsEmail()
email: string;
```

**2. UserService**

A lógica de negócio fica aqui. Por exemplo, antes de criar um usuário, verificamos se o `userName` já existe.

**3. UserController**

Expõe os endpoints. Cada método tem documentação Swagger via decorators.

**4. Filtro de exceções**

O `HttpExceptionFilter` captura erros e retorna uma resposta padronizada:

```json
{
  "statusCode": 400,
  "message": "userName já está em uso",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Endpoints disponíveis

| Método | Rota | O que faz |
|--------|------|-----------|
| GET | `/users` | Lista usuários (com paginação) |
| GET | `/users/:user_name` | Busca por userName |
| POST | `/users` | Cria usuário |
| PUT | `/users/:id` | Atualiza usuário |
| DELETE | `/users/:id` | Remove usuário (soft delete) |

### Arquivos principais

```
src/
├── application/
│   ├── dtos/
│   │   ├── create-user.dto.ts
│   │   ├── update-user.dto.ts
│   │   ├── pagination.dto.ts
│   │   └── user-response.dto.ts
│   └── services/
│       └── user.service.ts
└── presentation/
    ├── controllers/user.controller.ts
    └── filters/http-exception.filter.ts
```

---

## Fase 4: Integração com Sistema Legado

**Status**: Concluído

### O que fizemos

Criamos o cliente HTTP para buscar dados da API legada, com toda a resiliência necessária.

**1. LegacyApiClient**

Cliente HTTP usando axios. Configuração via variáveis de ambiente:
- `LEGACY_API_URL`: URL base da API
- `LEGACY_API_KEY`: Chave de autenticação

**2. Parser de JSON Concatenado**

A API legada retorna dados num formato estranho: arrays JSON concatenados.

```
[{user1}, {user2}][{user3}, {user4}]
```

O método `extractArrays()` no `LegacyApiClient` sabe lidar com isso. Ele também ignora JSON corrompido (20% das respostas) e continua processando o resto.

**3. Retry rápido (otimizado)**

Quando a requisição falha (erro 500, 429, etc), tentamos de novo com delays curtos:
- `initialDelayMs: 100` - começa com 100ms
- `maxDelayMs: 500` - máximo de 500ms
- `backoffMultiplier: 1.5` - cresce devagar
- `maxAttempts: 10` - até 10 tentativas

Isso é crucial porque a API legada tem 40% de chance de erro no início de cada requisição.

**4. Circuit Breaker**

Se a API falhar muitas vezes seguidas (5 vezes), o circuit breaker "abre" e bloqueia novas requisições por 30 segundos. Isso:
- Dá tempo pra API legada se recuperar
- Evita que nosso serviço fique travado esperando

### Como os componentes se conectam

```
LegacyApiClient
    └── CircuitBreaker.execute()
            └── withRetry()
                    └── axios.get('/external/users')
                            └── StreamParser.parse()
```

### Arquivos principais

```
src/infrastructure/
├── legacy/
│   ├── legacy-api.client.ts      # Cliente HTTP com streaming e parser embutido
│   └── legacy-user.interface.ts  # Tipagem dos dados
└── resilience/
    ├── retry.ts                  # Retry com backoff rápido
    └── circuit-breaker.ts        # Circuit breaker
```

---

## Fase 5: Sincronização Automática

**Status**: Concluído

### O que foi implementado

A sincronização usa uma arquitetura distribuída para processar 1 milhão de usuários em ~27 minutos.

**1. Arquitetura de Filas**

Duas filas BullMQ:
- `user-sync`: Recebe o job principal (orquestrador)
- `user-sync-batch`: Recebe jobs de batch (1000 usuários cada)

**2. SyncProcessor (Orquestrador)**

Recebe streaming da API legada e enfileira batches:

```
1. Recebe job da fila user-sync
2. Atualiza SyncLog para RUNNING
3. Inicia streaming com LegacyApiClient.fetchUsersStreaming()
4. A cada 1000 usuários, enfileira job na fila user-sync-batch
5. Quando streaming termina, atualiza SyncLog para PROCESSING
```

**3. SyncBatchProcessor (Workers)**

Processa batches em paralelo (concurrency: 5):

```
1. Recebe job com 1000 usuários
2. Executa bulkUpsertByUserName (uma query para todos)
3. Retorna resultado
```

**4. SyncService**

Serviço com a lógica de negócio:
- `triggerSync()`: Verifica idempotência e enfileira job
- `getLatestSync()`: Retorna última sincronização
- `getSyncHistory()`: Lista histórico
- `handleScheduledSync()`: Cron job a cada 6 horas (configurável via env)

**5. SyncController**

Endpoints:

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | `/sync` | Dispara sincronização |
| GET | `/sync/status` | Status da última sync (com métricas) |
| GET | `/sync/history` | Lista histórico |
| POST | `/sync/reset` | Reseta sync travada |

### Garantias implementadas

- **Idempotência**: Verifica PENDING/RUNNING/PROCESSING antes de criar novo job
- **Deduplicação**: `bulkUpsertByUserName` usa userName como chave única (raw SQL)
- **Rastreabilidade**: SyncLog com status PENDING → RUNNING → PROCESSING → COMPLETED/FAILED
- **Recuperação de travadas**: 3 mecanismos (timeout 30min, recovery no startup, reset manual)
- **Retry automático**: Se sync falhar, agenda retry em 10 minutos via `user-sync-retry` queue
- **Performance**: 1M usuários em ~18-20 minutos (~800-850 reg/s)

### Arquivos criados

```
src/
├── infrastructure/
│   └── queue/
│       ├── sync.constants.ts         # Nomes das filas e jobs
│       ├── sync.processor.ts         # Orquestrador (streaming + batch queueing)
│       ├── sync-batch.processor.ts   # Workers paralelos (concurrency: 5)
│       ├── sync-retry.processor.ts   # Retry automático após falha
│       └── index.ts
├── application/
│   └── services/sync.service.ts      # Idempotência + cron + recovery
└── presentation/
    └── controllers/sync.controller.ts
```

---

## Fase 6: Exportação CSV

**Status**: Concluído

### O que fizemos

Implementamos exportação de usuários em formato CSV com streaming para suportar grandes volumes de dados.

**1. Endpoint de Exportação**

`GET /users/export/csv` com suporte a filtros:
- `created_from`: Data inicial (ISO 8601)
- `created_to`: Data final (ISO 8601)

Retorna um arquivo CSV com streaming response - não carrega todos os dados em memória.

**2. ExportCsvQueryDto**

DTO para validação dos parâmetros de filtro:

```typescript
@IsOptional()
@IsDateString()
created_from?: string;

@IsOptional()
@IsDateString()
created_to?: string;
```

**3. findAllForExport no Repositório**

Async generator que retorna usuários em batches de 1000:

```typescript
async *findAllForExport(filters: ExportFilters): AsyncGenerator<User[]> {
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const users = await this.repository.find({
      where: this.buildWhereClause(filters),
      take: batchSize,
      skip: offset,
    });

    if (users.length === 0) break;
    yield users;
    offset += batchSize;
  }
}
```

**4. Lógica de CSV no UserService**

A formatação do CSV fica no service, não no controller:

```typescript
async *exportUsersCsv(filters: ExportFilters): AsyncGenerator<string> {
  yield 'id,userName,email,legacyId,createdAt\n'; // Header

  for await (const batch of this.userRepository.findAllForExport(filters)) {
    for (const user of batch) {
      yield `${user.id},${user.userName},${user.email},${user.legacyId},${user.createdAt}\n`;
    }
  }
}
```

### Arquivos principais

```
src/
├── application/
│   ├── dtos/export-csv-query.dto.ts  # Filtros com validação
│   └── services/user.service.ts       # exportUsersCsv()
├── domain/
│   └── repositories/user.repository.interface.ts  # findAllForExport()
├── infrastructure/
│   └── repositories/user.repository.ts  # Implementação com batches
└── presentation/
    └── controllers/user.controller.ts  # GET /users/export/csv
```

---

## Fase 6.5: Refatoração ConfigModule

**Status**: Concluído

### O que fizemos

Refatoramos toda a configuração do projeto para usar o padrão NestJS idiomático com validação centralizada.

**1. ConfigModule com Validação**

Criamos `env.validation.ts` com uma classe que valida todas as variáveis de ambiente no startup:

```typescript
export class EnvironmentVariables {
  @IsString()
  REDIS_HOST: string;

  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_PORT: number;

  @IsInt()
  @Min(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  SYNC_BATCH_SIZE: number = 2000;

  // ... outras variáveis
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig);
  if (errors.length > 0) {
    throw new Error(`Environment validation failed`);
  }
  return validatedConfig;
}
```

A aplicação **não inicia** se env vars obrigatórias estiverem faltando (fail-fast).

**2. Migração para forRootAsync**

Todos os módulos agora usam `forRootAsync` com `ConfigService`:

```typescript
// Antes (ruim)
TypeOrmModule.forRoot({
  host: process.env.DATABASE_PATH,
})

// Depois (bom)
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    database: config.get('DATABASE_PATH'),
  }),
})
```

Módulos migrados:
- TypeOrmModule
- BullModule
- ThrottlerModule

**3. Recuperação de Syncs Travadas**

Implementamos 3 mecanismos para evitar syncs fantasma:

```
┌─────────────────────────────────────────────────────────────┐
│                    Sync Recovery                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Timeout Automático (30 min)                              │
│    - triggerSync() verifica syncs antigas                   │
│    - Marca como FAILED se > 30 min em andamento             │
│                                                             │
│ 2. Recovery no Startup                                      │
│    - OnModuleInit marca syncs órfãs como FAILED             │
│    - Qualquer sync em andamento é considerada interrompida  │
│                                                             │
│ 3. Reset Manual (POST /sync/reset)                          │
│    - Força sync atual a ser marcada como FAILED             │
│    - Permite iniciar nova sync imediatamente                │
└─────────────────────────────────────────────────────────────┘
```

**4. Controllers Thin**

Movemos toda lógica de negócio dos controllers para os services:

```typescript
// Antes (ruim) - Controller com lógica
@Get('status')
async getStatus() {
  const syncLog = await this.syncService.getLatestSync();
  const elapsedMs = syncLog.durationMs ?? (Date.now() - syncLog.startedAt);
  const recordsPerSecond = syncLog.totalProcessed / (elapsedMs / 1000);
  // ... mais cálculos
  return { ...syncLog, recordsPerSecond };
}

// Depois (bom) - Controller só delega
@Get('status')
async getStatus(): Promise<SyncStatusDto> {
  return this.syncService.getLatestSyncStatus();
}
```

**5. Worker Concurrency via OnModuleInit**

O BullMQ `WorkerHost` inicializa o worker após o construtor, então configuramos a concurrency no lifecycle hook:

```typescript
@Processor(SYNC_BATCH_QUEUE_NAME)
export class SyncBatchProcessor extends WorkerHost implements OnModuleInit {
  private readonly workerConcurrency: number;

  constructor(configService: ConfigService) {
    super();
    this.workerConcurrency = configService.get<number>('SYNC_WORKER_CONCURRENCY', 20);
  }

  onModuleInit() {
    this.worker.concurrency = this.workerConcurrency;
  }
}
```

**6. DTOs Centralizados**

Criamos DTOs para todas as respostas de sync:
- `SyncStatusDto`: Status com métricas (recordsPerSecond, progressPercent, etc.)
- `TriggerSyncResponseDto`: Resposta do POST /sync
- `ResetSyncResponseDto`: Resposta do POST /sync/reset

### Arquivos principais

```
src/
├── infrastructure/
│   └── config/
│       └── env.validation.ts  # Validação centralizada
├── application/
│   └── dtos/
│       ├── sync-status.dto.ts
│       ├── trigger-sync-response.dto.ts
│       └── reset-sync-response.dto.ts
└── app.module.ts  # forRootAsync em todos os módulos
```

### Arquivos removidos

- `typeorm.config.ts` - Configuração agora inline no AppModule
- Constantes `BATCH_SIZE` e `WORKER_CONCURRENCY` - Agora via env vars

---

## Variáveis de Ambiente

Todas as variáveis são validadas no startup via `class-validator`. A aplicação não inicia se variáveis obrigatórias estiverem faltando.

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `NODE_ENV` | Não | development | Ambiente (development, production, test) |
| `PORT` | Não | 3000 | Porta do servidor |
| `DATABASE_PATH` | Não | ./data/database.sqlite | Caminho do banco SQLite |
| `TYPEORM_LOGGING` | Não | true | Habilita logs SQL |
| `REDIS_HOST` | **Sim** | - | Host do Redis |
| `REDIS_PORT` | **Sim** | - | Porta do Redis |
| `LEGACY_API_URL` | **Sim** | - | URL da API legada |
| `LEGACY_API_KEY` | **Sim** | - | Chave de autenticação |
| `SYNC_BATCH_SIZE` | Não | 1000 | Usuários por batch |
| `SYNC_WORKER_CONCURRENCY` | Não | 1 | Workers paralelos |
| `SYNC_CRON_EXPRESSION` | Não | `0 */6 * * *` | Cron da sync (a cada 6h) |
| `SYNC_RETRY_ATTEMPTS` | Não | 3 | Tentativas de retry HTTP |
| `SYNC_RETRY_DELAY` | Não | 1000 | Delay inicial do retry HTTP (ms) |
| `SYNC_RETRY_DELAY_MS` | Não | 600000 | Delay para retry de sync falha (10 min) |
| `RATE_LIMIT_TTL` | Não | 60 | TTL do rate limiting (s) |
| `RATE_LIMIT_MAX` | Não | 100 | Max requests por TTL |

Exemplo de `.env`:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Banco
DATABASE_PATH=./data/database.sqlite
TYPEORM_LOGGING=true

# Redis (obrigatório)
REDIS_HOST=localhost
REDIS_PORT=6379

# API Legada (obrigatório)
LEGACY_API_URL=http://localhost:3001
LEGACY_API_KEY=test-api-key-2024

# Sync (opcional - valores default são bons)
SYNC_BATCH_SIZE=1000
SYNC_WORKER_CONCURRENCY=1
SYNC_CRON_EXPRESSION=0 */6 * * *
SYNC_RETRY_DELAY_MS=600000

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

---

## Como Rodar

```bash
# 1. Suba o Redis
docker run -d --name redis-local -p 6379:6379 redis:7-alpine

# 2. Instale as dependências
npm install

# 3. Rode em modo dev
npm run start:dev

# Swagger fica em: http://localhost:3000/api/docs
```

---

## Fase 7: Otimizações de Performance

**Status**: Concluído

### O problema

A sincronização inicial estava lenta (~170 reg/s, ~83 minutos para 1M usuários). O objetivo era chegar próximo ao limite teórico da API legada (~1000 reg/s, ~17 minutos).

### Diagnóstico

Adicionamos logs de timing em vários pontos para identificar o gargalo:

```typescript
// LegacyApiClient - tempo entre chunks
stream.on('data', (chunk) => {
  const timeSinceLastChunk = Date.now() - lastChunkTime;
  // ...
});

// UserRepository - tempo de bulk upsert
const startTime = Date.now();
// ... upsert
console.log(`[DB] bulkUpsert: ${totalMs}ms`);
```

Os logs mostraram que:
- **Parse e DB**: Instantâneo (0-4ms)
- **Retry HTTP**: Delays de 2-30 segundos por erro (40% de taxa de erro)

### Soluções implementadas

**1. Retry HTTP rápido**

```typescript
// Antes (lento)
{
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

// Depois (otimizado)
{
  initialDelayMs: 100,
  maxDelayMs: 500,
  backoffMultiplier: 1.5,
  maxAttempts: 10,
}
```

**2. Raw SQL Bulk Upsert**

O TypeORM `upsert()` com SQLite causava erro "Cannot update entity because entity id is not set". Substituímos por raw SQL:

```typescript
const sql = `
  INSERT INTO "users" (...)
  VALUES ${placeholders.join(', ')}
  ON CONFLICT ("user_name") DO UPDATE SET
    "email" = excluded."email",
    ...
  WHERE excluded."legacy_created_at" > "users"."legacy_created_at"
`;
await this.dataSource.query(sql, values);
```

**3. Streaming non-blocking**

O callback `onBatch` enfileira sem esperar:

```typescript
// Antes (bloqueante)
await onBatch(allUsers);

// Depois (non-blocking)
pendingBatches.push(onBatch(allUsers));
// ... aguarda tudo no final
await Promise.all(pendingBatches);
```

**4. Retry Queue para falhas**

Se o sync falhar completamente (após esgotar retries HTTP), agenda novo sync:

```typescript
// SyncProcessor catch
this.scheduleRetry(syncLogId, errorMessage);

// scheduleRetry()
await this.retryQueue.add(SYNC_RETRY_JOB_NAME, jobData, {
  delay: this.retryDelayMs, // 10 minutos
});
```

### Resultado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Throughput | ~170 reg/s | ~800-850 reg/s |
| Tempo para 1M | ~83 minutos | ~18-20 minutos |
| Retry delay | 2-30 segundos | 100-500ms |

O throughput está próximo do limite teórico da API legada (~1000 reg/s), considerando:
- API envia 100 reg a cada 100ms = 1000 reg/s
- 40% de taxa de erro (20% 500 + 20% 429)
- 20% de dados corrompidos ignorados

### Arquivos modificados

```
src/
├── infrastructure/
│   ├── legacy/
│   │   └── legacy-api.client.ts    # Retry rápido, logs de timing
│   ├── queue/
│   │   ├── sync.processor.ts       # ConfigService, retry queue
│   │   ├── sync-retry.processor.ts # Novo: processa retries
│   │   └── sync.constants.ts       # Novas constantes
│   ├── repositories/
│   │   └── user.repository.ts      # Raw SQL bulk upsert
│   └── resilience/
│       └── retry.ts                # Logs de tempo de espera
└── .env                            # SYNC_RETRY_DELAY_MS
```

---

## Fase 8: Health Check e Observabilidade

**Status**: Concluído

### O que fizemos

Implementamos health checks robustos para observabilidade com ferramentas como Datadog e Zabbix.

**1. Dois endpoints de health check**

| Endpoint | Propósito | Rate Limit |
|----------|-----------|------------|
| `GET /health` | Liveness probe (load balancers, Kubernetes) | Global (100 req/min) |
| `GET /health/details` | Readiness probe (observabilidade) | Restritivo (10 req/min) |

**2. HealthService**

Verifica cada componente com timeout de 3 segundos:

```typescript
// Verificação do banco de dados
await this.dataSource.query('SELECT 1');

// Verificação do Redis
const client = await this.syncQueue.client;
await client.ping();

// Verificação da API legada
await axios.head(this.legacyApiUrl, { timeout: 3000 });
```

**3. Lógica de status**

```
┌─────────────────────────────────────────────────────────────┐
│                    Status de Saúde                           │
├─────────────────────────────────────────────────────────────┤
│ healthy   - Todos os componentes críticos OK                │
│ degraded  - Componentes não-críticos com problema           │
│            (ex: API legada indisponível)                    │
│ unhealthy - Componentes críticos falharam → HTTP 503        │
│            (Database ou Redis)                               │
└─────────────────────────────────────────────────────────────┘
```

**4. Resposta do `/health/details`**

```json
{
  "status": "healthy",
  "timestamp": "2025-12-21T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "uptimeFormatted": "1d 0h 0m",
  "components": {
    "database": { "status": "healthy", "latencyMs": 2 },
    "redis": { "status": "healthy", "latencyMs": 1 },
    "legacyApi": { "status": "degraded", "latencyMs": 150 }
  },
  "system": {
    "memoryUsage": { "heapUsed": 52428800, "heapTotal": 67108864 },
    "cpuUsage": { "user": 1234567, "system": 987654 }
  },
  "sync": {
    "lastSync": { "id": 42, "status": "COMPLETED" },
    "queueStats": { "waiting": 0, "active": 0, "completed": 1500 }
  }
}
```

**5. Rate limiting**

```typescript
@Get('details')
@Throttle({ default: { ttl: 60000, limit: 10 } })
async checkDetails(): Promise<HealthDetailsResponseDto> {
  // ...
}
```

### Arquivos criados

```
src/
├── application/
│   ├── dtos/
│   │   └── health-response.dto.ts  # DTOs das respostas
│   └── services/
│       └── health.service.ts       # Lógica de verificação
└── presentation/
    └── controllers/
        └── health.controller.ts    # Endpoints REST
```

---

## Próximos Passos

Ainda falta:

- **Testes**: Unitários e de integração
  - Coverage > 70%

- **Documentação final**:
  - docs/AWS_ARCHITECTURE.md
  - Revisão final de código
