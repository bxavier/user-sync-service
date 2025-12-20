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
| Local | Produção AWS |
|-------|--------------|
| Docker | Lambda |
| SQLite | Aurora/DynamoDB |
| BullMQ | Step Functions |
| Redis | ElastiCache/SQS |
