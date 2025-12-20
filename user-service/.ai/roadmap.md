# Roadmap de Desenvolvimento

## Fluxo de Implementação

**IMPORTANTE**: Antes de implementar qualquer tarefa abaixo, o assistente DEVE:
1. Explicar o que será implementado e por quê
2. Descrever a abordagem técnica escolhida
3. Aguardar aprovação do usuário antes de aplicar as mudanças

---

## Status Geral

| Fase | Status | Descrição |
|------|--------|-----------|
| 1 | ✅ Concluído | Setup do Projeto |
| 2 | ✅ Concluído | Domínio e Persistência |
| 3 | 🔄 Em Progresso | CRUD de Usuários |
| 4 | Pendente | Cliente do Sistema Legado |
| 5 | Pendente | Sincronização com BullMQ |
| 6 | Pendente | Exportação CSV |
| 7 | Pendente | Qualidade e Observabilidade |
| 8 | Pendente | Documentação e Entrega |

---

## Fase 1: Setup do Projeto
**Status**: Concluído

### Tarefas
- [x] Inicializar projeto NestJS com Fastify
- [x] Configurar TypeORM + SQLite
- [x] Configurar BullMQ + Redis
- [x] Criar estrutura de pastas DDD simplificado
- [x] Setup Docker e docker-compose
- [x] Configurar variáveis de ambiente (.env)
- [x] Configurar ESLint, Prettier
- [x] Criar documentação .ai/

### Critério de Conclusão
`docker-compose up` sobe API + Redis + Legacy API

---

## Fase 2: Domínio e Persistência
**Status**: ✅ Concluído

### Tarefas
- [x] Criar `User` entity (TypeORM) - campos: id, legacyId, userName, email, legacyCreatedAt, createdAt, updatedAt, deleted, deletedAt
- [x] Criar `SyncLog` entity - campos: id, status (enum), startedAt, finishedAt, totalProcessed, errorMessage, durationMs
- [x] Configurar soft delete (campo `deleted` + `deletedAt` na User entity)
- [x] Registrar entidades no AppModule (`TypeOrmModule.forFeature`)
- [x] Criar interface `UserRepository`
- [x] Implementar `UserRepositoryImpl`
- [x] Criar interface `SyncLogRepository`
- [x] Implementar `SyncLogRepositoryImpl`
- [x] Centralizar providers em `repositories.providers.ts`

### Critério de Conclusão
Entidades mapeadas, banco criado automaticamente, repositórios implementados

---

## Fase 3: CRUD de Usuários
**Status**: 🔄 Em Progresso

### Tarefas
- [ ] DTOs com validação (class-validator)
- [ ] `UserService` com lógica de negócio
- [ ] `UserController` com endpoints
- [ ] Exception filter global
- [ ] Swagger documentation

### Critério de Conclusão
CRUD completo testável via Swagger

---

## Fase 4: Cliente do Sistema Legado
**Status**: Pendente

### Tarefas
- [ ] `LegacyApiClient` com axios
- [ ] `StreamParser` para JSON concatenado
- [ ] Retry com exponential backoff
- [ ] Circuit breaker simples
- [ ] Tratamento de JSON corrompido
- [ ] Logging detalhado

### Critério de Conclusão
Consegue consumir stream mesmo com erros simulados

---

## Fase 5: Sincronização com BullMQ
**Status**: Pendente

### Tarefas
- [ ] Configurar BullMQ Queue
- [ ] Criar `SyncProcessor` (worker)
- [ ] Lógica de deduplicação por `user_name`
- [ ] Histórico/log de execuções (SyncLog)
- [ ] Endpoint `POST /sync`
- [ ] Cron job para sync periódico
- [ ] Garantir idempotência

### Critério de Conclusão
Múltiplas syncs não geram duplicatas

---

## Fase 6: Exportação CSV
**Status**: Pendente

### Tarefas
- [ ] Endpoint `GET /users/export/csv`
- [ ] Filtros `created_from`, `created_to`
- [ ] Streaming response

### Critério de Conclusão
Download de CSV com filtros funcionando

---

## Fase 7: Qualidade e Observabilidade
**Status**: Pendente

### Tarefas
- [ ] Health check endpoint (`GET /health`)
- [ ] Rate limiting (@nestjs/throttler)
- [ ] Swagger completo
- [ ] Testes unitários
- [ ] Testes de integração com mocks

### Critério de Conclusão
Coverage > 70%, Swagger documentando todos endpoints

---

## Fase 8: Documentação e Entrega
**Status**: Pendente

### Tarefas
- [ ] `README.md` completo
- [ ] `docs/AWS_ARCHITECTURE.md`
- [ ] `docs/OPTIMIZATIONS.md`
- [ ] `CHANGELOG.md` atualizado
- [ ] Revisão final de código

### Critério de Conclusão
Todos entregáveis prontos
