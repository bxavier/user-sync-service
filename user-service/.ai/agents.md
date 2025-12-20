# CLAUDE.md - User Service

> **Propósito**: Documento de contexto para desenvolvimento assistido por IA. Contém boas práticas, padrões e diretrizes do projeto.

---

## Visão Geral do Projeto

Serviço de integração que sincroniza dados de um sistema legado instável, mantém base própria e disponibiliza endpoints REST.

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

---

## Alertas Importantes

### NÃO FAZER
- Usar `any` em TypeScript
- Criar abstrações desnecessárias
- Ignorar erros silenciosamente
- Commits sem padrão conventional

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
