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

**Status**: Em progresso

### O que vamos implementar

Agora que temos o cliente da API legada funcionando, precisamos criar o fluxo completo de sincronização.

**1. Queue de sincronização**

Vamos registrar uma fila BullMQ chamada `sync-users`. Quando alguém chamar `POST /sync`, um job é adicionado nessa fila.

**2. SyncProcessor (Worker)**

O worker é quem processa os jobs da fila. O fluxo será:

```
1. Recebe job da fila
2. Cria registro no SyncLog (status: RUNNING)
3. Chama LegacyApiClient.fetchUsers()
4. Pra cada usuário retornado:
   - Chama UserRepository.upsertByLegacyId()
5. Atualiza SyncLog (status: COMPLETED ou FAILED)
```

**3. SyncService**

Serviço com a lógica de negócio:
- `triggerSync()`: Enfileira um job de sync
- `getSyncStatus(id)`: Consulta status de uma sync
- `getSyncHistory()`: Lista últimas execuções

Uma regra importante: se já tem uma sync rodando, não deixa disparar outra.

**4. SyncController**

Endpoints:

| Método | Rota | O que faz |
|--------|------|-----------|
| POST | `/sync` | Dispara sincronização |
| GET | `/sync/:id` | Consulta status |
| GET | `/sync/history` | Lista histórico |

### Garantias que vamos ter

- **Idempotência**: Rodar sync várias vezes não duplica dados
- **Rastreabilidade**: Toda execução fica registrada no SyncLog
- **Resiliência**: Se falhar, o SyncLog mostra o erro

### Arquivos que serão criados

```
src/
├── infrastructure/
│   └── queue/
│       ├── sync.constants.ts    # Nome da fila
│       ├── sync.processor.ts    # Worker
│       └── index.ts
├── application/
│   ├── services/sync.service.ts
│   └── dtos/sync-response.dto.ts
└── presentation/
    └── controllers/sync.controller.ts
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Servidor
PORT=3000

# Banco
DATABASE_PATH=./data/database.sqlite

# Redis (pra fila de jobs)
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

Depois da Fase 5, ainda falta:

- **Fase 6**: Exportação CSV (`GET /users/export/csv`)
- **Fase 7**: Testes, health check, melhorias de observabilidade
- **Fase 8**: Documentação final e revisão
