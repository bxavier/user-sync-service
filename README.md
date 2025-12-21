# User Service

Serviço de integração que sincroniza dados de um sistema legado instável, mantém base própria e disponibiliza endpoints REST.

## O que este serviço faz

1. **Busca dados** de uma API legada (que simula falhas, rate limiting e JSON corrompido)
2. **Armazena localmente** em SQLite com deduplicação
3. **Disponibiliza endpoints REST** para consulta e manipulação dos dados

## Stack

| Tecnologia | Uso |
|------------|-----|
| NestJS + Fastify | Framework web |
| SQLite + TypeORM | Banco de dados |
| BullMQ + Redis | Fila de jobs assíncronos |
| Swagger | Documentação da API |

## Como rodar

### Pré-requisitos

- Node.js 18+
- Docker (para Redis)

### Desenvolvimento local

```bash
# 1. Suba o Redis
docker run -d --name redis-local -p 6379:6379 redis:7-alpine

# 2. Instale as dependências
npm install

# 3. Configure o ambiente (opcional - já tem defaults)
cp .env.example .env

# 4. Rode em modo dev
npm run start:dev
```

### Com Docker Compose

```bash
docker-compose up --build
```

## URLs

| URL | Descrição |
|-----|-----------|
| http://localhost:3000 | API |
| http://localhost:3000/api/docs | Swagger (documentação interativa) |

## Endpoints disponíveis

### Usuários

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users` | Lista usuários (com paginação) |
| GET | `/users/:user_name` | Busca por userName |
| POST | `/users` | Cria usuário |
| PUT | `/users/:id` | Atualiza usuário |
| DELETE | `/users/:id` | Remove usuário (soft delete) |

### Sincronização

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/sync` | Dispara sincronização com sistema legado |
| GET | `/sync/status` | Status da última sync (com métricas de performance) |
| GET | `/sync/history` | Lista histórico de sincronizações |
| POST | `/sync/reset` | Reseta sync travada |

### Health Check

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Liveness probe (simples, para load balancers) |
| GET | `/health/details` | Readiness probe com detalhes (para observabilidade) |

**Status possíveis:**
- `healthy` - Todos os componentes OK
- `degraded` - Componentes não-críticos com problema
- `unhealthy` - Componentes críticos falharam (HTTP 503)

## Variáveis de ambiente

```env
# Servidor
PORT=3000
NODE_ENV=development

# Banco de dados
DATABASE_PATH=./data/database.sqlite
TYPEORM_LOGGING=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API Legada
LEGACY_API_URL=http://localhost:3001
LEGACY_API_KEY=test-api-key-2024

# Sincronização
SYNC_CRON_EXPRESSION=0 */6 * * *
SYNC_BATCH_SIZE=1000
SYNC_WORKER_CONCURRENCY=1
SYNC_RETRY_DELAY_MS=600000
SYNC_RETRY_ATTEMPTS=3
SYNC_RETRY_DELAY=1000

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

## Estrutura do projeto

```
src/
├── domain/           # Entidades e interfaces
├── application/      # Serviços e DTOs
├── infrastructure/   # Implementações (DB, HTTP, Queue)
└── presentation/     # Controllers e filtros
```

## Documentação adicional

| Documento | Descrição |
|-----------|-----------|
| [docs/TECHNICAL_IMPLEMENTATION.md](docs/TECHNICAL_IMPLEMENTATION.md) | Como cada parte foi implementada |
| [.ai/CONTEXT.md](.ai/CONTEXT.md) | Contexto para desenvolvimento com IA |
| [.ai/roadmap.md](.ai/roadmap.md) | Status das fases de desenvolvimento |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de mudanças |

## Scripts disponíveis

```bash
npm run start:dev    # Desenvolvimento com hot reload
npm run build        # Build de produção
npm run start:prod   # Roda build de produção
npm run lint         # Verifica código
npm run test         # Roda testes
```

## Resiliência

O serviço implementa padrões de resiliência para lidar com a instabilidade da API legada:

- **Retry rápido**: Tenta novamente em caso de falha (100ms → 500ms max)
- **Circuit Breaker**: Bloqueia requisições temporariamente após 5 falhas consecutivas
- **Parser tolerante**: Ignora JSON corrompido e continua processando o resto
- **Retry Queue**: Se o sync falhar completamente, agenda retry automático em 10 minutos

## Performance

O sistema de sincronização foi otimizado para processar **1 milhão de usuários em ~18-20 minutos** (~800-850 reg/s):

| Otimização | Descrição |
|------------|-----------|
| Streaming HTTP | Processa dados conforme chegam, sem carregar tudo em memória |
| Bulk Upsert com Raw SQL | INSERT com ON CONFLICT direto no SQLite |
| Retry rápido | Delays de 100-500ms ao invés de segundos |
| Batch Processing | Batches de 1000 usuários processados via BullMQ |
| Non-blocking callbacks | Enfileira batches sem bloquear o stream |

## Status do desenvolvimento

- [x] Fase 1: Setup do projeto
- [x] Fase 2: Entidades e repositórios
- [x] Fase 3: CRUD de usuários
- [x] Fase 4: Cliente do sistema legado
- [x] Fase 5: Sincronização com BullMQ
- [x] Fase 6: Exportação CSV
- [x] Fase 6.5: Refatoração ConfigModule
- [x] Fase 7: Qualidade e Observabilidade (Health check, Swagger)
- [ ] Fase 8: Testes unitários e de integração
