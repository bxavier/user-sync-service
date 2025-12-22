# User Sync Service - Teste Técnico

Serviço de integração que sincroniza dados de um sistema legado instável, mantém base própria e disponibiliza endpoints REST.

## Sobre o Projeto

Este serviço foi desenvolvido como solução para o desafio de integração com um sistema legado que apresenta:

- **40% de taxa de erro** (20% HTTP 500 + 20% HTTP 429)
- **20% de dados corrompidos** (JSON inválido)
- **Duplicatas** por `user_name`
- **Soft deletes** misturados com registros ativos

O serviço implementa padrões de resiliência para lidar com essas instabilidades e processa **~1 milhão de usuários em ~18-20 minutos**.

A aplicação é **facilmente deployável em AWS** utilizando serviços gerenciados como ECS Fargate, ElastiCache (Redis) e RDS PostgreSQL. Veja a arquitetura proposta em [docs/AWS_ARCHITECTURE.md](docs/AWS_ARCHITECTURE.md).

## Stack Tecnológica

| Tecnologia | Justificativa |
|------------|---------------|
| **NestJS + Fastify** | Framework enterprise-grade, Fastify 2-3x mais rápido que Express |
| **SQLite + TypeORM** | Zero configuração, banco em arquivo único |
| **BullMQ + Redis** | Processamento assíncrono com retry automático |
| **Swagger** | Documentação interativa da API |

## Requisitos

- **Node.js 18+**
- **Docker** e **Docker Compose**

---

## Como Executar

### Opção 1: Docker Compose (Recomendado)

Sobe todos os serviços (API, Redis e Legacy API) com um comando:

```bash
cd user-sync-service

# Usando Make
make dev

# Ou diretamente com docker-compose
docker-compose -f docker/docker-compose.dev.yml up --build
```

### Opção 2: Desenvolvimento Local

```bash
cd user-sync-service

# 1. Suba o Redis
docker run -d --name redis-local -p 6379:6379 redis:7-alpine

# 2. Suba a API Legada (em outro terminal)
cd ../legacy-api/api
cp env.example .env
docker build -t api-legada .
docker run -m 128m --network=host api-legada

# 3. Instale dependências e rode o serviço
cd ../../user-sync-service
npm install
cp .env.example .env
npm run start:dev
```

### Opção 3: Build de Produção

```bash
cd user-sync-service

# Build da imagem
docker build -t user-sync-service -f docker/Dockerfile .

# Executar (requer Redis e Legacy API rodando)
docker run -m 128m -p 3000:3000 \
  -e REDIS_HOST=host.docker.internal \
  -e LEGACY_API_URL=http://host.docker.internal:3001 \
  -e LEGACY_API_KEY=test-api-key-2024 \
  user-sync-service
```

---

## URLs de Acesso

| URL | Descrição |
|-----|-----------|
| http://localhost:3000 | API REST |
| http://localhost:3000/api/docs | Swagger (documentação interativa) |
| http://localhost:3001 | API Legada (para testes) |

---

## Endpoints da API

### Usuários (`/users`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/users` | Lista usuários com paginação (`?page=1&limit=10`) |
| `GET` | `/users/:user_name` | Busca por userName |
| `GET` | `/users/export/csv` | Exporta CSV com filtros (`?created_from=&created_to=`) |
| `POST` | `/users` | Cria usuário |
| `PUT` | `/users/:id` | Atualiza usuário |
| `DELETE` | `/users/:id` | Remove usuário (soft delete) |

### Sincronização (`/sync`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/sync` | Dispara sincronização com sistema legado |
| `GET` | `/sync/status` | Status da última sync (com métricas) |
| `GET` | `/sync/history` | Histórico de sincronizações |
| `POST` | `/sync/reset` | Reseta sync travada |

### Health Check (`/health`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Liveness probe (para load balancers) |
| `GET` | `/health/details` | Readiness probe com status dos componentes |

**Status possíveis:** `healthy`, `degraded`, `unhealthy` (HTTP 503)

---

## Variáveis de Ambiente

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `NODE_ENV` | Não | `development` | Ambiente (development, production, test) |
| `PORT` | Não | `3000` | Porta do servidor |
| `DATABASE_PATH` | Não | `./data/database.sqlite` | Caminho do SQLite |
| `TYPEORM_LOGGING` | Não | `false` | Habilita logs SQL |
| `REDIS_HOST` | **Sim** | - | Host do Redis |
| `REDIS_PORT` | **Sim** | - | Porta do Redis |
| `LEGACY_API_URL` | **Sim** | - | URL da API legada |
| `LEGACY_API_KEY` | **Sim** | - | Chave de autenticação |
| `SYNC_BATCH_SIZE` | Não | `2000` | Usuários por batch |
| `SYNC_WORKER_CONCURRENCY` | Não | `1` | Workers paralelos |
| `SYNC_STALE_THRESHOLD_MINUTES` | Não | `30` | Timeout para sync travada (min) |
| `SYNC_ESTIMATED_TOTAL_RECORDS` | Não | `1000000` | Estimativa de registros no legado |
| `RATE_LIMIT_TTL` | Não | `60` | Janela de rate limit (segundos) |
| `RATE_LIMIT_MAX` | Não | `100` | Máximo de requests por janela |

Exemplo completo em [.env.example](.env.example).

---

## Arquitetura do Projeto

```
src/
├── domain/           # Entidades e interfaces de repositório
│   ├── entities/     # User, SyncLog
│   └── repositories/ # Interfaces (contratos)
├── application/      # Lógica de negócio
│   ├── services/     # UserService, SyncService, HealthService
│   └── dtos/         # Validação de entrada/saída
├── infrastructure/   # Implementações técnicas
│   ├── config/       # Validação de env vars
│   ├── legacy/       # Cliente da API legada
│   ├── queue/        # Processadores BullMQ
│   ├── repositories/ # Implementações TypeORM
│   └── resilience/   # Circuit breaker, retry
└── presentation/     # Camada HTTP
    ├── controllers/  # REST endpoints
    └── filters/      # Tratamento de erros
```

---

## Padrões de Resiliência

O serviço implementa múltiplos padrões para lidar com a instabilidade da API legada:

| Padrão | Implementação |
|--------|---------------|
| **Retry com Backoff** | 100ms → 500ms (max 10 tentativas) |
| **Circuit Breaker** | Abre após 5 falhas, recupera em 30s |
| **Parser Tolerante** | Ignora JSON corrompido e continua |
| **Retry Queue** | Agenda retry em 10min se sync falhar |
| **Timeout de Sync** | Marca como FAILED após 30min |
| **Recovery no Startup** | Reseta syncs órfãs ao iniciar |

---

## Performance

O sistema foi otimizado para processar grandes volumes:

| Métrica | Valor |
|---------|-------|
| Throughput | ~800-850 registros/segundo |
| 1M usuários | ~18-20 minutos |
| Batch size | 1000 usuários |
| Retry delay | 100-500ms |

**Otimizações aplicadas:**
- Streaming HTTP (não carrega tudo em memória)
- Bulk Upsert com Raw SQL (`INSERT ... ON CONFLICT`)
- Non-blocking batch processing
- Deduplicação por `user_name` usando `legacy_created_at`

---

## Makefile

Comandos disponíveis para facilitar o desenvolvimento:

```bash
make dev         # Docker Compose com hot reload
make stop        # Para containers
make logs        # Logs do container api
make clean       # Remove containers e dados
make build       # Build de produção
make test        # Roda testes
make lint        # Verifica código
make help        # Lista todos os comandos
```

---

## Scripts NPM

```bash
npm run start:dev    # Desenvolvimento com hot reload
npm run build        # Build de produção
npm run start:prod   # Executa build compilado
npm run lint         # Verifica e corrige código
npm run test         # Testes unitários
npm run test:cov     # Testes com coverage
npm run test:e2e     # Testes end-to-end
```

---

## Testando a API

### 1. Disparar Sincronização

```bash
curl -X POST http://localhost:3000/sync
```

### 2. Verificar Status

```bash
curl http://localhost:3000/sync/status
```

### 3. Listar Usuários

```bash
curl "http://localhost:3000/users?page=1&limit=10"
```

### 4. Buscar por Username

```bash
curl http://localhost:3000/users/john_doe
```

### 5. Exportar CSV

```bash
curl "http://localhost:3000/users/export/csv?created_from=2024-01-01" > users.csv
```

### 6. Health Check

```bash
curl http://localhost:3000/health/details
```

---

## Documentação Adicional

| Documento | Descrição |
|-----------|-----------|
| [docs/AWS_ARCHITECTURE.md](docs/AWS_ARCHITECTURE.md) | Arquitetura proposta para deploy AWS |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de mudanças |

---

## Checklist do Teste Técnico

### Requisitos Essenciais

- [x] Endpoint de sincronização idempotente (`POST /sync`)
- [x] Tratamento de erros do sistema legado (retry, circuit breaker)
- [x] Deduplicação por `user_name` (usando `created_at` mais recente)
- [x] CRUD completo de usuários
- [x] Busca por `user_name` (`GET /users/:user_name`)
- [x] Exportação CSV com filtros (`GET /users/export/csv`)
- [x] Soft delete (todos endpoints retornam apenas `deleted=false`)
- [x] Estrutura DDD (Domain, Application, Infrastructure, Presentation)
- [x] Docker funcional com limite de memória
- [x] Documentação AWS

### Diferenciais Implementados

- [x] Documentação Swagger completa
- [x] Rate limiting
- [x] Health check com detalhes
- [x] Métricas de performance
- [ ] Testes automatizados (pendente)

---

## Decisões Técnicas

### Por que NestJS + Fastify?

- Framework maduro com suporte a DI, módulos e decorators
- Fastify é mais performático que Express (importante para alto throughput)
- Ecossistema rico (TypeORM, BullMQ, Swagger)

### Por que SQLite?

- Zero configuração (banco em arquivo)
- Suficiente para o escopo do teste
- Fácil migração para PostgreSQL/MySQL se necessário

### Por que BullMQ + Redis?

- Processamento assíncrono com retry automático
- Visibilidade do estado dos jobs
- Escalável (múltiplos workers)

### Por que Streaming?

- Não carrega 1M registros em memória
- Processa dados conforme chegam
- Essencial para rodar com limite de 128MB

---

## Contato

**Bruno Xavier**
- Site: https://brunoxavier.com.br
- Email: bruno@brunoxavier.com.br
