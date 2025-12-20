# Arquitetura do User Service

## Visão Geral

Serviço que sincroniza dados de um sistema legado instável e expõe endpoints REST modernos.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   POST /sync    │────▶│   BullMQ Queue  │────▶│  Sync Processor │
│   (Controller)  │     │   (Redis)       │     │  (Worker)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐                            ┌─────────────────┐
│  Legacy API     │◀───────────────────────────│  Legacy Client  │
│  (Port 3001)    │                            │  (Resiliente)   │
└─────────────────┘                            └────────┬────────┘
                                                        │
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
- **Repository Interfaces** (✅ implementado):
  - `UserRepository` - findAll, findById, findByUserName, create, update, softDelete, upsertByLegacyId
  - `SyncLogRepository` - create, update, findById, findLatest, findAll

### Application Layer
- **Services**: Lógica de negócio (UserService, SyncService)
- **DTOs**: Objetos de transferência com validação

### Infrastructure Layer
- **Database**: Configuração TypeORM + SQLite (✅ implementado)
  - `typeorm.config.ts` - configuração do banco
  - `typeorm-logger.ts` - logger integrado ao NestJS
- **Repositories** (✅ implementado):
  - `UserRepositoryImpl` - implementação com TypeORM
  - `SyncLogRepositoryImpl` - implementação com TypeORM
  - `repositories.providers.ts` - providers centralizados para DI
- **Legacy**: Cliente para API legada + Stream Parser (a implementar)
- **Queue**: BullMQ para jobs assíncronos (configurado no AppModule)
- **Resilience**: Retry, Circuit Breaker (a implementar)
- **Logger**: LoggerService customizado (✅ estende ConsoleLogger)

### Presentation Layer
- **Controllers**: Endpoints REST
- **Filters**: Tratamento global de exceções

## Padrões de Resiliência

### Retry com Exponential Backoff
```typescript
const retryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};
```

### Circuit Breaker
```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
};
```

## Fluxo de Sincronização

1. `POST /sync` enfileira job no BullMQ
2. Worker consome job da fila
3. Legacy Client busca dados com retry
4. Stream Parser processa JSON concatenado
5. Deduplicação por `user_name` (mantém mais recente)
6. Upsert no banco de dados
7. SyncLog registra resultado

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| SQLite | Simplicidade para dev local, requisito do teste |
| BullMQ | Jobs assíncronos com retry automático |
| Fastify | Performance superior ao Express |
| TypeORM | Abstrações DDD, suporte a SQLite |
