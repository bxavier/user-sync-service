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
- `LEGACY_API_TIMEOUT`: Timeout das requisições

**2. StreamParser**

A API legada retorna dados num formato estranho: arrays JSON concatenados.

```
[{user1}, {user2}][{user3}, {user4}]
```

O `StreamParser` sabe lidar com isso. Ele também ignora JSON corrompido e continua processando o resto.

**3. Retry com backoff exponencial**

Quando a requisição falha (erro 500, 429, etc), tentamos de novo. Mas não imediatamente - esperamos um tempo que vai aumentando:
- 1ª tentativa: espera 1 segundo
- 2ª tentativa: espera 2 segundos
- 3ª tentativa: espera 4 segundos

Isso evita sobrecarregar a API legada.

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
│   ├── legacy-api.client.ts      # Cliente HTTP
│   ├── stream-parser.ts          # Parser de JSON concatenado
│   └── legacy-user.interface.ts  # Tipagem dos dados
└── resilience/
    ├── retry.ts                  # Retry com backoff
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
- **Deduplicação**: `bulkUpsertByUserName` usa userName como chave única
- **Rastreabilidade**: SyncLog com status PENDING → RUNNING → PROCESSING → COMPLETED/FAILED
- **Recuperação de travadas**: 3 mecanismos (timeout 30min, recovery no startup, reset manual)
- **Performance**: 1M usuários em ~18 minutos (streaming + batch + 20 workers paralelos)

### Arquivos criados

```
src/
├── infrastructure/
│   └── queue/
│       ├── sync.constants.ts        # SYNC_QUEUE_NAME, SYNC_BATCH_QUEUE_NAME
│       ├── sync.processor.ts        # Orquestrador (streaming + batch queueing)
│       ├── sync-batch.processor.ts  # Workers paralelos (concurrency: 20)
│       └── index.ts
├── application/
│   └── services/sync.service.ts     # Idempotência + cron + recovery
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
| `SYNC_BATCH_SIZE` | Não | 2000 | Usuários por batch |
| `SYNC_WORKER_CONCURRENCY` | Não | 20 | Workers paralelos |
| `SYNC_CRON_EXPRESSION` | Não | `0 */6 * * *` | Cron da sync (a cada 6h) |
| `SYNC_RETRY_ATTEMPTS` | Não | 3 | Tentativas de retry |
| `SYNC_RETRY_DELAY` | Não | 1000 | Delay inicial do retry (ms) |
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
SYNC_BATCH_SIZE=2000
SYNC_WORKER_CONCURRENCY=20
SYNC_CRON_EXPRESSION=0 */6 * * *

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

## Próximos Passos

Depois da Fase 6.5, ainda falta:

- **Fase 7**: Qualidade e Observabilidade
  - Health check endpoint (`GET /health`)
  - Testes unitários e de integração
  - Coverage > 70%

- **Fase 8**: Documentação e Entrega
  - README.md completo
  - docs/AWS_ARCHITECTURE.md
  - docs/OPTIMIZATIONS.md
  - Revisão final de código
