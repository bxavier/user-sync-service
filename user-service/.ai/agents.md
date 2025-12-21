# CLAUDE.md - User Service

> **Propósito**: Documento de contexto para desenvolvimento assistido por IA. Contém boas práticas, padrões e diretrizes do projeto.

---

## Visão Geral do Projeto

Serviço de integração que sincroniza dados de um sistema legado instável, mantém base própria e disponibiliza endpoints REST.

### Sistema Legado (legacy-api/)

- **Endpoint**: `GET /external/users`
- **Autenticação**: Header `x-api-key: test-api-key-2024`
- **Porta**: 3001
- **Formato**: Streaming em lotes de 100 registros (arrays JSON concatenados)

**Estrutura dos dados do legado:**
```json
{
  "id": 1,
  "userName": "john_doe",
  "email": "john@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "deleted": false
}
```

**Comportamentos instáveis simulados:**
| Problema | Probabilidade |
|----------|---------------|
| Erro 500 | 20% |
| Erro 429 (rate limit) | 20% |
| JSON Corrompido | 20% |
| Duplicatas | Frequente |
| Soft Delete | Retorna `deleted: true` |

### Endpoints Obrigatórios

**Sincronização:**
- `POST /sync` - Dispara sincronização (enfileira job)

**Consulta:**
- `GET /users` - Lista com paginação
- `GET /users/:user_name` - Busca por user_name

**CRUD:**
- `POST /users` - Cadastra novo
- `PUT /users/:id` - Atualiza
- `DELETE /users/:id` - Soft-delete

**Exportação:**
- `GET /users/export/csv` - Exporta com filtros `created_from`, `created_to`

### Regras de Negócio

1. **Soft Delete**: Todos endpoints retornam apenas `deleted = false`
2. **Unicidade**: `user_name` deve ser único
3. **Deduplicação**: Em duplicatas, manter registro com `createdAt` mais recente
4. **Idempotência**: Múltiplas syncs não causam inconsistências

### Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Framework | NestJS + Fastify |
| Banco de Dados | SQLite + TypeORM |
| Fila | BullMQ + Redis |
| Validação | class-validator |
| Documentação | Swagger/OpenAPI |

---

## Padrões de Código

### TypeScript
- **NUNCA usar `any`** - sempre tipos explícitos
- Usar strict mode
- Interfaces para contratos, types para unions/intersections

### NestJS Conventions
```typescript
// Controllers
@Controller('users')
@ApiTags('users')
export class UserController { }

// Endpoints com documentação
@Get()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Lista usuários' })
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

---

## Estrutura DDD Simplificada

```
src/
├── domain/           # Entidades e interfaces de repositório
├── application/      # Serviços e DTOs
├── infrastructure/   # Implementações concretas
├── presentation/     # Controllers e filtros
└── shared/           # Utilitários compartilhados
```

---

## Princípios Core

- **SOLID** aplicado pragmaticamente
- **DRY** - extrair lógica repetida
- **KISS** - simplicidade sobre complexidade
- **YAGNI** - não implementar o que não é necessário
- **ZERO OVERENGINEERING** - implementar apenas o necessário para o requisito

---

## Fluxo de Desenvolvimento

**IMPORTANTE**: Antes de implementar qualquer código, o assistente DEVE:
1. **Explicar** o que será implementado e por quê
2. **Descrever** a abordagem técnica escolhida
3. **Aguardar aprovação** do usuário antes de aplicar as mudanças

Isso garante alinhamento e permite que o usuário entenda e valide cada decisão técnica.

---

## Estilo de Documentação

Ao explicar conceitos ou implementações:
- **Um passo de cada vez**: Implementar e explicar cada componente individualmente
- **Simples e direto**: Explicar para desenvolvedores, sem simplificações excessivas
- **Motivo antes do código**: Sempre dizer o "porquê" antes do "como"

### Formato preferido:

```
## [Nome do componente]

**O que faz**: [descrição técnica em 1 frase]

**Por que**: [justificativa técnica]

**Código**: [implementação]
```

---

## Alertas Importantes

### NÃO FAZER
- Usar `any` em TypeScript
- Criar abstrações desnecessárias
- Ignorar erros silenciosamente
- Commits sem padrão conventional
- **OVERENGINEERING** - sempre verificar se o requisito exige antes de implementar

### SEMPRE FAZER
- Tipar tudo explicitamente
- Tratar todos os erros possíveis
- Logar operações importantes
- Documentar endpoints com Swagger
- Manter CHANGELOG atualizado

---

## Git Workflow

### Conventional Commits
```
type(scope): description

[optional body]
```

**Types**: feat, fix, refactor, docs, test, chore, perf

**Exemplos**:
```bash
feat(sync): implement streaming parser for legacy API
fix(users): handle duplicate userName constraint
docs(readme): add installation instructions
```

---

## Como Rodar

### Desenvolvimento Local (Recomendado)
```bash
# Terminal 1 - Redis
docker run -d --name redis-local -p 6379:6379 redis:7-alpine

# Terminal 2 - Legacy API
cd ../legacy-api/api && npm install && npm run dev

# Terminal 3 - User Service
cd user-service && npm install && npm run start:dev
```

### Com Docker Compose
```bash
docker-compose up --build
```

### URLs
- API: http://localhost:3000
- Swagger: http://localhost:3000/api/docs
- Legacy API: http://localhost:3001

---

## Entregáveis

### Obrigatórios
- [x] Código-fonte em repositório Git
- [x] `README.md` com instruções
- [x] `Dockerfile` funcional (limite 128MB)
- [ ] `docs/AWS_ARCHITECTURE.md`

### Diferenciais
- [ ] Testes unitários e de integração
- [x] Documentação Swagger/OpenAPI (contact, license, DTOs documentados)
- [x] Rate limiting (ThrottlerModule)
- [x] Health check endpoint (`/health`, `/health/details`)
- [ ] `docs/OPTIMIZATIONS.md`
