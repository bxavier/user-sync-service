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

**Próxima Fase**: Fase 2 - Domínio e Persistência

## Tarefas Pendentes (Fase 2)

- [ ] Criar `User` entity (TypeORM)
- [ ] Criar `SyncLog` entity
- [ ] Criar interface `UserRepository`
- [ ] Implementar `UserRepositoryImpl`
- [ ] Configurar soft delete

## Arquivos Principais do Projeto

```
user-service/
├── src/
│   ├── app.module.ts                    # Módulo principal
│   ├── main.ts                          # Bootstrap com Fastify
│   ├── domain/
│   │   ├── entities/                    # User, SyncLog (a criar)
│   │   └── repositories/                # Interfaces (a criar)
│   ├── application/
│   │   ├── services/                    # UserService, SyncService (a criar)
│   │   └── dtos/                        # DTOs (a criar)
│   ├── infrastructure/
│   │   ├── config/
│   │   │   └── swagger.config.ts
│   │   ├── database/
│   │   │   ├── typeorm.config.ts
│   │   │   └── typeorm-logger.ts        # Logger TypeORM → NestJS format
│   │   ├── logger/
│   │   │   ├── custom-logger.service.ts # LoggerService (ConsoleLogger)
│   │   │   └── index.ts
│   │   ├── repositories/                # Implementações (a criar)
│   │   ├── legacy/                      # Cliente API legada (a criar)
│   │   ├── queue/                       # BullMQ (a criar)
│   │   └── resilience/                  # Retry, Circuit Breaker (a criar)
│   └── presentation/
│       ├── controllers/                 # Controllers (a criar)
│       └── filters/                     # Exception filters (a criar)
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

## Commits

Usar conventional commits:
```
feat(scope): descrição curta

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```
