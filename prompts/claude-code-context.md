# CLAUDE.md - Teste Técnico: Integração com Sistema Legado

> **Propósito**: Documento de contexto completo para desenvolvimento assistido por IA. Contém todas as decisões arquiteturais, requisitos do projeto e diretrizes de desenvolvimento.

---

## 📋 Visão Geral do Projeto

### Contexto do Negócio
Uma empresa possui um **sistema legado instável** que armazena dados de usuários. A missão é desenvolver um **novo serviço** que:
1. Sincronize dados do sistema legado
2. Mantenha base de dados própria, confiável e otimizada
3. Disponibilize endpoints REST modernos para consulta e manipulação

### O que será avaliado
| Competência | Observação |
|-------------|------------|
| Resolução de Problemas | Cenários de erro, dados inconsistentes, sistemas instáveis |
| Arquitetura de Software | DDD, separação de responsabilidades, organização |
| Design Patterns | Repository, Service Layer, Factory, etc. |
| Boas Práticas | Clean Code, tratamento de erros, logs, validações |
| Resiliência | Retry, circuit breaker, fallbacks, idempotência |

---

## 🎯 Requisitos Funcionais

### Sistema Legado (pasta `legacy-api/`)
- **Endpoint**: `GET /external/users`
- **Autenticação**: Header `x-api-key: YOUR_API_KEY`
- **Formato**: Streaming em lotes de 100 registros (arrays JSON concatenados)
- **Porta**: 3001

**Estrutura dos dados:**
```json
{
  "id": 1,
  "userName": "john_doe",
  "email": "john@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "deleted": false
}
```

**⚠️ Comportamentos instáveis simulados:**
| Problema | Probabilidade | Descrição |
|----------|---------------|-----------|
| Erro 500 | 20% | Internal Server Error no início |
| Erro 429 | 20% | Too Many Requests (rate limiting) |
| JSON Corrompido | 20% | JSON inválido no meio do stream |
| Duplicatas | - | Mesmo `userName` múltiplas vezes |
| Soft Delete | - | Usuários com `deleted: true` são retornados |

### Endpoints Obrigatórios do Novo Serviço

**Sincronização:**
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/sync` | Dispara sincronização (enfileira job) |

**Consulta:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users` | Lista usuários com paginação |
| GET | `/users/:user_name` | Busca por user_name |

**CRUD:**
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/users` | Cadastra novo usuário |
| PUT | `/users/:id` | Atualiza usuário |
| DELETE | `/users/:id` | Remove (soft-delete) |

**Exportação:**
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users/export/csv` | Exporta CSV com filtros `created_from`, `created_to` |

### Regras de Negócio
1. **Soft Delete**: Todos endpoints retornam apenas `deleted = false`
2. **Isolamento**: CRUD local não impacta sistema legado
3. **Unicidade**: `user_name` deve ser único
4. **Deduplicação**: Em duplicatas, manter registro com `createdAt` mais recente
5. **Idempotência**: Executar sync múltiplas vezes não causa inconsistências

---

## 🏗️ Decisões Arquiteturais

### Stack Tecnológica
| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Framework | NestJS + Fastify | Performance, estrutura robusta para DDD |
| Banco de Dados | SQLite + TypeORM | Requisito do teste, simplicidade |
| Fila | BullMQ + Redis | Jobs assíncronos, retry automático |
| Validação | class-validator | Padrão NestJS |
| Documentação | Swagger/OpenAPI | Diferencial do teste |

### Arquitetura do Worker (Híbrida)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   POST /sync    │────▶│   BullMQ Queue  │────▶│  Sync Worker    │
│   (API)         │     │   (Redis)       │     │  (Consumer)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
┌─────────────────┐                                     │
│   Cron Job      │─────────────────────────────────────┘
│   (Scheduled)   │
└─────────────────┘
```

- **API** expõe `POST /sync` que enfileira job
- **Worker** (mesmo processo) consome jobs da fila
- **Cron** agenda sincronizações periódicas
- **Vantagem**: Pode escalar worker independentemente em produção (AWS)

### Estrutura DDD
```
src/
├── domain/                    # Camada de Domínio
│   ├── entities/              # Entidades de domínio
│   │   └── user.entity.ts
│   ├── repositories/          # Interfaces de repositório
│   │   └── user.repository.interface.ts
│   └── value-objects/         # Value Objects (se necessário)
│
├── application/               # Camada de Aplicação
│   ├── services/              # Casos de uso / Application Services
│   │   ├── user.service.ts
│   │   └── sync.service.ts
│   ├── dtos/                  # Data Transfer Objects
│   │   ├── create-user.dto.ts
│   │   ├── update-user.dto.ts
│   │   └── sync-result.dto.ts
│   └── interfaces/            # Interfaces de aplicação
│
├── infrastructure/            # Camada de Infraestrutura
│   ├── database/              # Configuração TypeORM
│   │   ├── typeorm.config.ts
│   │   └── migrations/
│   ├── repositories/          # Implementações concretas
│   │   └── user.repository.ts
│   ├── external/              # Integração com sistema legado
│   │   ├── legacy-api.client.ts
│   │   └── stream-parser.ts
│   ├── queue/                 # BullMQ configuration
│   │   ├── sync.processor.ts
│   │   └── sync.queue.ts
│   └── resilience/            # Circuit breaker, retry
│       └── retry.decorator.ts
│
├── presentation/              # Camada de Apresentação
│   ├── controllers/           # Controllers HTTP
│   │   ├── user.controller.ts
│   │   └── sync.controller.ts
│   ├── filters/               # Exception filters
│   └── interceptors/          # Logging, transform
│
├── shared/                    # Código compartilhado
│   ├── constants/
│   ├── utils/
│   └── types/
│
├── app.module.ts
└── main.ts
```

---

## 🔧 Padrões de Resiliência

### Retry com Exponential Backoff
```typescript
// Para erros 500 e 429 do sistema legado
const retryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};
```

### Circuit Breaker
```typescript
// Previne cascade failures
const circuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
};
```

### Stream Parser Resiliente
- Tratar JSON corrompido: ignorar chunks inválidos, continuar processamento
- Acumular buffer para parsing de arrays concatenados
- Log de chunks com erro para debugging

---

## 📝 Padrões de Código

### Princípios Core
- **SOLID** aplicado pragmaticamente
- **DRY** - extrair lógica repetida
- **KISS** - simplicidade sobre complexidade
- **YAGNI** - não implementar o que não é necessário agora

### TypeScript
- **NUNCA usar `any`** - sempre tipos explícitos
- Usar strict mode
- Interfaces para contratos, types para unions/intersections

### NestJS Conventions
```typescript
// Controllers
@Controller({
  path: 'users',
  version: '1'
})
@ApiTags('Users')
export class UserController { }

// Endpoints
@Get()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Lista usuários', description: 'Retorna lista paginada' })
@ApiResponse({ status: 200, description: 'Lista de usuários' })
async findAll(@Query() query: PaginationDto) { }
```

### DTOs com Validação
```typescript
export class CreateUserDto {
  @ApiProperty({ description: 'Nome de usuário único', example: 'john_doe' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  userName: string;

  @ApiProperty({ description: 'Email do usuário', example: 'john@example.com' })
  @IsEmail()
  email: string;
}
```

### Entities TypeORM
```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, name: 'user_name' })
  userName: string;

  @Column()
  email: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ default: false })
  deleted: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

## 📦 Entregáveis

### Obrigatórios
- [ ] Código-fonte em repositório Git
- [ ] `README.md` com instruções de instalação/execução
- [ ] `Dockerfile` funcional (limite 128MB memória)
- [ ] `AWS_ARCHITECTURE.md` - arquitetura proposta para AWS

### Diferenciais (TODOS serão implementados)
- [ ] Testes unitários e de integração
- [ ] Documentação Swagger/OpenAPI
- [ ] Rate limiting no novo serviço
- [ ] Health check endpoint
- [ ] Métricas e observabilidade
- [ ] `OPTIMIZATIONS.md` - melhorias no sistema legado

---

## 🗺️ Roadmap de Desenvolvimento

### Fase 1: Setup e Infraestrutura Base
**Objetivo**: Projeto configurado e rodando
- [ ] Inicializar projeto NestJS com Fastify
- [ ] Configurar TypeORM + SQLite
- [ ] Configurar BullMQ + Redis
- [ ] Criar estrutura de pastas DDD
- [ ] Configurar ESLint, Prettier
- [ ] Setup Docker e docker-compose
- [ ] Configurar variáveis de ambiente

**Critério de conclusão**: `docker-compose up` sobe API + Redis

### Fase 2: Domínio e Persistência
**Objetivo**: Entidade User completa com repositório
- [ ] Criar User Entity
- [ ] Criar User Repository Interface (domain)
- [ ] Implementar User Repository (infrastructure)
- [ ] Criar migrations
- [ ] Configurar soft delete global

**Critério de conclusão**: Testes de repositório passando

### Fase 3: CRUD de Usuários
**Objetivo**: Endpoints REST funcionais
- [ ] DTOs de criação/atualização
- [ ] User Service (application layer)
- [ ] User Controller com todos endpoints
- [ ] Paginação em GET /users
- [ ] Busca por user_name
- [ ] Validações e error handling

**Critério de conclusão**: CRUD completo via Swagger

### Fase 4: Integração com Sistema Legado
**Objetivo**: Cliente resiliente para API legada
- [ ] Legacy API Client com axios/fetch
- [ ] Stream parser para JSON concatenado
- [ ] Implementar retry com exponential backoff
- [ ] Implementar circuit breaker
- [ ] Tratamento de JSON corrompido
- [ ] Logging detalhado

**Critério de conclusão**: Consegue consumir stream mesmo com erros

### Fase 5: Sincronização (Worker)
**Objetivo**: Sync idempotente e resiliente
- [ ] Sync Queue configuration
- [ ] Sync Processor (worker)
- [ ] Lógica de deduplicação por user_name
- [ ] Histórico/log de execuções
- [ ] Endpoint POST /sync
- [ ] Cron job para sync periódico
- [ ] Idempotência garantida

**Critério de conclusão**: Múltiplas syncs não geram duplicatas

### Fase 6: Exportação CSV
**Objetivo**: Endpoint de exportação funcional
- [ ] Endpoint GET /users/export/csv
- [ ] Filtros created_from, created_to
- [ ] Streaming response para grandes volumes

**Critério de conclusão**: Download de CSV com filtros

### Fase 7: Qualidade e Observabilidade
**Objetivo**: Produção-ready
- [ ] Health check endpoint
- [ ] Métricas básicas
- [ ] Rate limiting
- [ ] Swagger documentation completa
- [ ] Testes unitários (services)
- [ ] Testes de integração (controllers)

**Critério de conclusão**: Coverage > 70%, Swagger completo

### Fase 8: Documentação e Entrega
**Objetivo**: Projeto finalizado
- [ ] README.md completo
- [ ] AWS_ARCHITECTURE.md
- [ ] OPTIMIZATIONS.md (análise do sistema legado)
- [ ] CHANGELOG.md
- [ ] Dockerfile otimizado
- [ ] Revisão final de código

**Critério de conclusão**: Todos os entregáveis prontos

---

## 🐳 Docker Configuration

### Dockerfile (Multi-stage)
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_PATH=./data/database.sqlite
      - REDIS_HOST=redis
      - LEGACY_API_URL=http://host.docker.internal:3001
      - LEGACY_API_KEY=${LEGACY_API_KEY}
    deploy:
      resources:
        limits:
          memory: 128M
    depends_on:
      - redis
    volumes:
      - ./data:/app/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

---

## ☁️ AWS Architecture (Preview)

### Componentes Principais
- **ECS Fargate** ou **Lambda**: Compute para API e Worker
- **EventBridge**: Scheduler para sync periódico
- **SQS**: Fila de jobs de sincronização
- **RDS PostgreSQL** ou **DynamoDB**: Banco de dados
- **S3**: Armazenamento de exports CSV
- **CloudWatch**: Logs e métricas
- **API Gateway**: Entrada da API

### Diagrama (será detalhado em AWS_ARCHITECTURE.md)
```
                    ┌─────────────┐
                    │ EventBridge │
                    │  (Cron)     │
                    └──────┬──────┘
                           │
┌──────────┐    ┌──────────▼──────────┐    ┌─────────────┐
│   API    │───▶│        SQS          │───▶│   Worker    │
│ Gateway  │    │   (Sync Queue)      │    │ (Fargate)   │
└────┬─────┘    └─────────────────────┘    └──────┬──────┘
     │                                            │
     │         ┌─────────────────────┐            │
     └────────▶│    ECS Fargate      │◀───────────┘
               │    (API Service)    │
               └──────────┬──────────┘
                          │
               ┌──────────▼──────────┐
               │   RDS PostgreSQL    │
               │   (ou DynamoDB)     │
               └─────────────────────┘
```

---

## 📁 Estrutura de Arquivos do Projeto

```
project-root/
├── .ai/
│   ├── agents.md              # Este arquivo (referência)
│   ├── architecture.md        # Decisões arquiteturais detalhadas
│   ├── roadmap.md            # Status do roadmap
│   └── tech-decisions.md     # Log de decisões técnicas
├── docs/
│   ├── AWS_ARCHITECTURE.md   # Arquitetura AWS (obrigatório)
│   └── OPTIMIZATIONS.md      # Melhorias sistema legado (bônus)
├── legacy-api/               # Sistema legado fornecido
│   ├── Dockerfile
│   ├── env.example
│   └── ...
├── src/                      # Código fonte (estrutura DDD acima)
├── test/                     # Testes
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── docker-compose.yml
├── Dockerfile
├── nest-cli.json
├── package.json
├── README.md
└── tsconfig.json
```

---

## 🚨 Alertas Importantes

### NÃO FAZER
- ❌ Usar `any` em TypeScript
- ❌ Criar abstrações desnecessárias
- ❌ Ignorar erros silenciosamente
- ❌ Commits sem padrão conventional
- ❌ Código sem testes para lógica crítica

### SEMPRE FAZER
- ✅ Tipar tudo explicitamente
- ✅ Tratar todos os erros possíveis
- ✅ Logar operações importantes
- ✅ Documentar endpoints com Swagger
- ✅ Testar cenários de erro do sistema legado
- ✅ Manter CHANGELOG atualizado

---

## 🔗 Comandos Úteis

```bash
# Desenvolvimento
npm run start:dev          # API em modo watch
npm run start:debug        # Com debugger

# Testes
npm run test               # Unit tests
npm run test:e2e          # Integration tests
npm run test:cov          # Coverage

# Build
npm run build             # Compila para dist/
docker-compose up --build # Sobe tudo

# Database
npm run migration:generate -- -n MigrationName
npm run migration:run
npm run migration:revert

# Lint
npm run lint
npm run format
```

---

## 📚 Referências

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [DDD by Martin Fowler](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Express.js](https://expressjs.com/) - Referência do teste
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Referência do teste

---

## 🔄 Git Workflow

### Conventional Commits
Todos os commits devem seguir o padrão:
```
type(scope): description

[optional body]
[optional footer]
```

**Types válidos:**
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `refactor`: Refatoração sem mudança de comportamento
- `docs`: Documentação
- `test`: Adição/correção de testes
- `chore`: Tarefas de manutenção
- `perf`: Melhorias de performance

**Exemplos:**
```bash
feat(sync): implement streaming parser for legacy API
fix(users): handle duplicate userName constraint violation
refactor(infrastructure): extract retry logic to decorator
docs(readme): add installation instructions
test(sync): add integration tests for corrupted JSON handling
```

### Branches
- `main`: Código de produção
- `develop`: Integração de features
- `feature/*`: Novas funcionalidades
- `fix/*`: Correções

---

## 🧪 Estratégia de Testes

### Unit Tests
- Services (application layer)
- Stream parser
- Retry/Circuit breaker logic
- DTOs validation

### Integration Tests
- Controllers (endpoints)
- Repository (database operations)
- Sync workflow completo

### Mocks
```typescript
// Mock do Legacy API Client
const mockLegacyApiClient = {
  fetchUsers: jest.fn().mockResolvedValue(mockUserStream)
};

// Mock do Repository
const mockUserRepository = {
  findAll: jest.fn(),
  findByUserName: jest.fn(),
  save: jest.fn(),
  upsertByUserName: jest.fn()
};
```

---

## 🌊 Stream Parser - Detalhes Técnicos

### Problema
O sistema legado envia múltiplos arrays JSON concatenados:
```
[{user1}, {user2}][{user3}, {user4}][{user5}]
```
Isso **NÃO** é JSON válido. Precisamos parsear incrementalmente.

### Solução
```typescript
// Pseudocódigo da estratégia
class StreamParser {
  private buffer = '';
  
  processChunk(chunk: string): User[] {
    this.buffer += chunk;
    const users: User[] = [];
    
    // Encontrar arrays completos no buffer
    let startIndex = 0;
    let bracketCount = 0;
    let inArray = false;
    
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] === '[') {
        if (!inArray) startIndex = i;
        inArray = true;
        bracketCount++;
      } else if (this.buffer[i] === ']') {
        bracketCount--;
        if (bracketCount === 0 && inArray) {
          // Array completo encontrado
          const arrayStr = this.buffer.slice(startIndex, i + 1);
          try {
            const parsed = JSON.parse(arrayStr);
            users.push(...parsed);
          } catch (e) {
            // JSON corrompido - logar e ignorar
            console.warn('Corrupted JSON chunk, skipping');
          }
          inArray = false;
        }
      }
    }
    
    // Manter no buffer apenas o que não foi processado
    // ...
    
    return users;
  }
}
```

---

## 🛡️ Error Handling Strategy

### Custom Exceptions
```typescript
// Domain exceptions
export class UserNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
  }
}

export class DuplicateUserNameException extends ConflictException {
  constructor(userName: string) {
    super(`User with userName '${userName}' already exists`);
  }
}

// Infrastructure exceptions
export class LegacyApiException extends ServiceUnavailableException {
  constructor(message: string, public readonly statusCode?: number) {
    super(`Legacy API error: ${message}`);
  }
}
```

### Global Exception Filter
```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Mapear exceções para respostas HTTP padronizadas
    // Logar todas as exceções
    // Não expor detalhes internos em produção
  }
}
```

---

## 📊 Sync Execution Log

### Schema para histórico de sincronizações
```typescript
@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'datetime', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'datetime', name: 'finished_at', nullable: true })
  finishedAt: Date;

  @Column({ 
    type: 'varchar', 
    enum: ['pending', 'running', 'completed', 'failed'] 
  })
  status: string;

  @Column({ name: 'total_records', default: 0 })
  totalRecords: number;

  @Column({ name: 'new_records', default: 0 })
  newRecords: number;

  @Column({ name: 'updated_records', default: 0 })
  updatedRecords: number;

  @Column({ name: 'skipped_records', default: 0 })
  skippedRecords: number;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string;
}
```

---

## ⚙️ Environment Variables

```bash
# .env.example

# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_PATH=./data/database.sqlite

# Redis (for BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# Legacy API
LEGACY_API_URL=http://localhost:3001
LEGACY_API_KEY=your-api-key-here

# Sync Configuration
SYNC_CRON_EXPRESSION=0 */6 * * *  # Every 6 hours
SYNC_RETRY_ATTEMPTS=3
SYNC_RETRY_DELAY=1000

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

---

## 🎯 Definition of Done (Por Fase)

Cada fase só é considerada completa quando:

- [ ] Código implementado e funcionando
- [ ] Testes escritos e passando
- [ ] Documentação Swagger atualizada (se aplicável)
- [ ] Sem erros de lint
- [ ] Commit seguindo conventional commits
- [ ] CHANGELOG.md atualizado
- [ ] Code review mental (está simples? está claro?)

---

*Documento gerado para auxiliar desenvolvimento com Claude Code CLI*
*Última atualização: Dezembro 2024*
