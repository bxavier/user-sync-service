# Log de Decisões Técnicas

## TDR-001: Framework NestJS + Fastify

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Precisamos de um framework robusto para API REST com suporte a DDD.

### Decisão

Usar NestJS com adapter Fastify.

### Justificativa

- NestJS oferece estrutura modular ideal para DDD
- Fastify tem performance superior ao Express
- Suporte nativo a TypeScript
- Ecossistema rico (BullMQ, TypeORM, Swagger)

---

## TDR-002: Banco de Dados SQLite + TypeORM

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Precisamos de persistência simples para desenvolvimento local.

### Decisão

SQLite com TypeORM para desenvolvimento local.

### Justificativa

- Requisito do teste técnico
- Simplicidade - não requer servidor de banco
- TypeORM abstrai diferenças entre bancos
- Fácil migração para PostgreSQL/Aurora em produção

---

## TDR-003: BullMQ para Jobs Assíncronos

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Sincronização com sistema legado deve ser assíncrona e resiliente.

### Decisão

Usar BullMQ com Redis para fila de jobs.

### Justificativa

- Retry automático com backoff
- Persistência de jobs
- Dashboard de monitoramento
- Suporte a cron jobs

### Alternativa AWS (Documentação)

Em produção Lambda, usar SQS + Step Functions.

---

## TDR-004: Arquitetura DDD Simplificada

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Precisamos de separação de responsabilidades sem over-engineering.

### Decisão

DDD simplificado com 4 camadas principais.

### Estrutura

```
domain/       - Entidades e interfaces
application/  - Serviços e DTOs
infrastructure/ - Implementações
presentation/ - Controllers
```

### Justificativa

- Código organizado e testável
- Sem complexidade excessiva
- Fácil de entender e manter

---

## TDR-005: Desenvolvimento Local vs Produção AWS

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Aplicação deve rodar localmente com Docker mas ser documentada para deploy serverless.

### Decisão

Desenvolver com Docker + SQLite + BullMQ, documentar arquitetura Lambda.

### Mapeamento

| Local  | Produção AWS    |
| ------ | --------------- |
| Docker | Lambda          |
| SQLite | Aurora/DynamoDB |
| BullMQ | Step Functions  |
| Redis  | ElastiCache/SQS |

---

## TDR-006: Logger Customizado com NestJS ConsoleLogger

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

Precisamos de um logger consistente com suporte a metadata estruturada.

### Decisão

Criar LoggerService customizado estendendo o ConsoleLogger nativo do NestJS.

### Justificativa

- **Sem dependências externas**: Não adiciona Winston, Pino ou outras libs
- **Integração nativa**: Funciona com o lifecycle do NestJS
- **Metadata estruturada**: Suporte a objetos JSON nos logs
- **Method tracking**: Captura automaticamente o nome do método via stack trace
- **Formatação colorida**: Usa formatação nativa do NestJS

### Uso

```typescript
// Injeção via construtor
private readonly logger = new LoggerService(MyService.name);

// Log simples
this.logger.log('Message');

// Log com metadata
this.logger.log('Operation completed', { userId: 123, duration: '50ms' });

// Error com stack
this.logger.error('Failed', { error: error.message });
```

### Estrutura

```
infrastructure/
└── logger/
    ├── custom-logger.service.ts  # LoggerService
    └── index.ts                   # Barrel export
```

---

## TDR-007: Processamento Distribuído com BullMQ Batch Queue

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

A API legada retorna 1 milhão de usuários via streaming. Processar um por um é lento (~1000/min).

### Decisão

Implementar arquitetura de filas distribuídas com streaming + batch processing.

### Arquitetura

```
LegacyAPI → Streaming → SyncProcessor (orquestrador)
                              ↓
                        Batch Queue (1000 users/job)
                              ↓
                    SyncBatchProcessor (5 workers paralelos)
                              ↓
                        bulkUpsertByUserName
```

### Justificativa

- **Streaming real**: `axios` com `responseType: 'stream'` evita carregar 1M registros em memória
- **Batch processing**: Agrupa 1000 usuários por job, reduz overhead de filas
- **Paralelismo**: 5 workers processam simultaneamente
- **Bulk upsert**: Uma query para N registros (vs N queries)

### Resultados

- Antes: horas para 1M usuários
- Depois: ~27 minutos para 1M usuários

### Configuração

```typescript
const BATCH_SIZE = 1000;

@Processor(SYNC_BATCH_QUEUE_NAME, {
  concurrency: 5, // 5 workers paralelos
})
export class SyncBatchProcessor {}
```

---

## TDR-008: Deduplicação por userName

**Data**: 2024-12-20
**Status**: Aprovado

### Contexto

A regra de negócio exige unicidade por `userName`, não por `legacyId`.

### Decisão

Usar `userName` como chave de conflito no upsert.

### Implementação

```typescript
await this.repository.upsert(entities, {
  conflictPaths: ['userName'],
  skipUpdateIfNoValuesChanged: true,
});
```

### Justificativa

- Respeita a regra de negócio (unicidade por userName)
- Permite que usuários do legado sejam "mesclados" por userName
- Mantém `legacyId` apenas como referência de origem

---

## TDR-009: ConfigModule com Validação Centralizada

**Data**: 2024-12-21
**Status**: Aprovado

### Contexto

Aplicação usava `process.env` diretamente em vários lugares. Precisamos de validação centralizada e tipagem forte para variáveis de ambiente.

### Decisão

Usar `ConfigModule.forRoot` do NestJS com validação via class-validator.

### Implementação

```typescript
// env.validation.ts
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
  // ...
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig);
  if (errors.length > 0) {
    throw new Error(`Environment validation failed`);
  }
  return validatedConfig;
}

// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validate,
});
```

### Justificativa

- **Fail-fast**: Aplicação não inicia se env vars obrigatórias estiverem faltando
- **Tipagem forte**: `ConfigService<EnvironmentVariables>` oferece autocomplete
- **Valores default**: Definidos na classe, não espalhados pelo código
- **Validação**: Min/max, tipos, formatos validados automaticamente
- **Padrão NestJS**: Forma idiomática do framework

### Variáveis Configuráveis

| Variável                  | Default       | Descrição          |
| ------------------------- | ------------- | ------------------ |
| `SYNC_BATCH_SIZE`         | 1000          | Usuários por batch |
| `SYNC_WORKER_CONCURRENCY` | 1             | Workers paralelos  |
| `TYPEORM_LOGGING`         | true          | Habilita logs SQL  |
| `SYNC_CRON_EXPRESSION`    | `0 */6 * * *` | Cron da sync       |

---

## TDR-010: Recuperação de Syncs Travadas

**Data**: 2024-12-21
**Status**: Aprovado

### Contexto

Syncs podem ficar travadas em status RUNNING/PROCESSING se a aplicação crashar ou for reiniciada durante uma sincronização.

### Decisão

Implementar 3 mecanismos de recuperação:

1. **Timeout automático**: Ao iniciar nova sync, verifica se há syncs em andamento há mais de 30 min e marca como FAILED
2. **Recovery no startup**: No `OnModuleInit` do SyncService, marca qualquer sync em andamento como FAILED
3. **Reset manual**: Endpoint `POST /sync/reset` para forçar reset de sync travada

### Implementação

```typescript
// SyncLogRepository
async markStaleAsFailed(thresholdMinutes: number, errorMessage: string): Promise<number> {
  const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const result = await this.repository.update(
    {
      status: In([SyncStatus.PENDING, SyncStatus.RUNNING, SyncStatus.PROCESSING]),
      startedAt: LessThan(threshold),
    },
    {
      status: SyncStatus.FAILED,
      finishedAt: new Date(),
      errorMessage,
    },
  );
  return result.affected ?? 0;
}

// SyncService
async onModuleInit() {
  await this.syncLogRepository.markStaleAsFailed(0, 'Sync interrompida: aplicação reiniciada');
}
```

### Justificativa

- Evita syncs fantasma bloqueando novas execuções
- Permite operação autônoma sem intervenção manual
- Mantém histórico de falhas para auditoria

---

## TDR-011: Lógica de Negócio nos Services (não Controllers)

**Data**: 2024-12-21
**Status**: Aprovado

### Contexto

Controllers estavam com lógica de cálculo de métricas (recordsPerSecond, progressPercent, etc) e formatação de dados (CSV).

### Decisão

Mover toda lógica de negócio para a camada Application (services), deixando controllers apenas como adaptadores HTTP.

### Antes

```typescript
// sync.controller.ts - RUIM
async getStatus() {
  const syncLog = await this.syncService.getLatestSync();
  const elapsedMs = syncLog.durationMs ?? (Date.now() - syncLog.startedAt);
  const recordsPerSecond = syncLog.totalProcessed / (elapsedMs / 1000);
  // ... mais cálculos
  return { ...syncLog, recordsPerSecond, progressPercent };
}
```

### Depois

```typescript
// sync.controller.ts - BOM
async getStatus() {
  return this.syncService.getLatestSyncStatus();
}

// sync.service.ts
async getLatestSyncStatus(): Promise<SyncStatusDto> {
  const syncLog = await this.syncLogRepository.findLatest();
  // ... cálculos aqui
  return { ...syncLog, recordsPerSecond, progressPercent };
}
```

### Justificativa

- Controllers são thin (apenas delegam)
- Lógica testável unitariamente no service
- Reutilizável por outros consumers (CLI, jobs, etc)
- Separação clara de responsabilidades

---

## TDR-012: Worker Concurrency via OnModuleInit

**Data**: 2024-12-21
**Status**: Aprovado

### Contexto

Ao tentar configurar `this.worker.concurrency` no construtor do `SyncBatchProcessor`, recebemos erro: "Worker has not yet been initialized".

### Decisão

Usar o lifecycle hook `OnModuleInit` para configurar a concurrency do worker após a inicialização completa do módulo.

### Implementação

```typescript
@Processor(SYNC_BATCH_QUEUE_NAME)
export class SyncBatchProcessor extends WorkerHost implements OnModuleInit {
  private readonly workerConcurrency: number;

  constructor(configService: ConfigService) {
    super();
    this.workerConcurrency = configService.get<number>(
      'SYNC_WORKER_CONCURRENCY',
      20,
    );
  }

  onModuleInit() {
    this.worker.concurrency = this.workerConcurrency;
  }
}
```

### Justificativa

- `WorkerHost` do `@nestjs/bullmq` inicializa o worker após o construtor
- `OnModuleInit` é chamado quando o módulo está completamente inicializado
- Permite usar `ConfigService` no construtor e aplicar no momento correto

---

## TDR-013: Health Check com Dois Endpoints

**Data**: 2025-12-21
**Status**: Aprovado

### Contexto

Precisamos de health checks para observabilidade com ferramentas como Datadog e Zabbix, além de suporte a liveness/readiness probes do Kubernetes.

### Decisão

Implementar dois endpoints de health check:

1. `GET /health` - Liveness probe simples e rápido
2. `GET /health/details` - Readiness probe com detalhes completos

### Implementação

**Arquitetura:**

```
HealthController
    └── HealthService
            ├── checkDatabase() → DataSource.query('SELECT 1')
            ├── checkRedis() → Queue.client.ping()
            ├── checkLegacyApi() → axios.head()
            ├── getQueueStats() → Queue.getJobCounts()
            └── getLastSync() → DataSource.query()
```

**Lógica de status:**

- `healthy`: Todos os componentes críticos (DB, Redis) OK
- `degraded`: Componentes não-críticos (API legada) com problema
- `unhealthy`: Componentes críticos falharam → HTTP 503

**Rate limiting:**

- `/health`: Rate limit global (100 req/min)
- `/health/details`: Rate limit restritivo (10 req/min) via `@Throttle`

**Timeouts:**

- Cada verificação de componente tem timeout de 3s para evitar bloqueio

### Exemplo de resposta `/health/details`

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
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

### Justificativa

- **Dois endpoints**: Separação entre liveness (rápido, para load balancers) e readiness (completo, para observabilidade)
- **Rate limit restritivo**: Evita abuso do endpoint detalhado
- **Componentes críticos vs não-críticos**: API legada indisponível não deve marcar o serviço como unhealthy
- **Formato genérico**: Compatível com Datadog, Zabbix e outras ferramentas de monitoramento

---

## TDR-014: Documentação Swagger Completa

**Data**: 2025-12-21
**Status**: Aprovado

### Contexto

Precisamos de documentação Swagger completa para facilitar integração e testes.

### Decisão

Documentar todos os endpoints com decorators do NestJS/Swagger e adicionar metadata no DocumentBuilder.

### Implementação

- DTOs com `@ApiProperty` e `@ApiPropertyOptional`
- Endpoints com `@ApiOperation`, `@ApiResponse`, `@ApiParam`
- DocumentBuilder com `setContact` e `setLicense`

### Justificativa

- Swagger UI funciona como playground interativo
- Facilita integração por outros times
- Documentação sempre atualizada junto com o código
