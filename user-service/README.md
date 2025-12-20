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

### Sincronização (em desenvolvimento)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/sync` | Dispara sincronização com sistema legado |
| GET | `/sync/:id` | Consulta status de uma sincronização |
| GET | `/sync/history` | Lista histórico de sincronizações |

## Variáveis de ambiente

```env
# Servidor
PORT=3000

# Banco de dados
DATABASE_PATH=./data/database.sqlite

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API Legada
LEGACY_API_URL=http://localhost:3001
LEGACY_API_KEY=test-api-key-2024
LEGACY_API_TIMEOUT=30000

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

- **Retry com backoff exponencial**: Tenta novamente em caso de falha, com intervalos crescentes
- **Circuit Breaker**: Bloqueia requisições temporariamente após muitas falhas consecutivas
- **Parser tolerante**: Ignora JSON corrompido e continua processando o resto

## Status do desenvolvimento

- [x] Fase 1: Setup do projeto
- [x] Fase 2: Entidades e repositórios
- [x] Fase 3: CRUD de usuários
- [x] Fase 4: Cliente do sistema legado
- [ ] Fase 5: Sincronização com BullMQ
- [ ] Fase 6: Exportação CSV
- [ ] Fase 7: Testes e observabilidade
- [ ] Fase 8: Documentação final
