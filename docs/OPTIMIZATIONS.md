# Otimizacoes do Sistema Legado

> Analise dos problemas identificados no sistema legado (`/legacy-api/api/`) e propostas de otimizacao.
> Este documento atende ao requisito bonus do teste tecnico.

---

## Sumario

1. [Resumo Executivo](#1-resumo-executivo)
2. [Problemas Criticos](#2-problemas-criticos)
3. [Problemas de Performance](#3-problemas-de-performance)
4. [Problemas de Qualidade de Codigo](#4-problemas-de-qualidade-de-codigo)
5. [Problemas de Arquitetura](#5-problemas-de-arquitetura)
6. [Propostas de Otimizacao](#6-propostas-de-otimizacao)
7. [Resultados Esperados](#7-resultados-esperados)

---

## 1. Resumo Executivo

### Metricas do Sistema Legado

| Metrica | Valor Atual |
|---------|-------------|
| Linhas de codigo | 112 |
| Tamanho do banco | ~80 MB |
| Registros estimados | ~1.000.000 usuarios |
| Tempo de sync atual | ~16-20 minutos |
| Conexoes por sync | ~20.000 (nunca fechadas) |
| Cobertura de testes | 0% |

### Problemas por Severidade

| Severidade | Quantidade | Exemplos |
|------------|------------|----------|
| **Critico** | 3 | Conexao DB por query, servico instanciado em loop, I/O bloqueante |
| **Alto** | 4 | Vazamento de recursos, sem tratamento de erros, tipos `any` |
| **Medio** | 3 | Delays artificiais, N+1 queries, sem validacao |
| **Baixo** | 2 | Sem logs, sem testes |

---

## 2. Problemas Criticos

### 2.1 Nova Conexao de Banco por Query

**Arquivo:** `src/infrastructure/repository.ts`

**Problema:** Cada chamada ao repositorio abre uma nova conexao com o banco:

```typescript
// ❌ PROBLEMA: Nova conexao a cada chamada
async count(): Promise<number> {
  const database = new Database(databasePath);  // Nova conexao
  const statement = database.prepare('SELECT COUNT(*) AS count FROM users');
  return (statement.get() as any).count;
  // Conexao nunca e fechada!
}

async findAll(skip: number, limit: number): Promise<User[]> {
  const database = new Database(databasePath);  // Outra nova conexao
  // ...
}
```

**Impacto:**
- Para 1M usuarios em batches de 100 = 10.000 iteracoes
- Cada iteracao: 1 count + 1 findAll = 2 conexoes
- **Total: 20.000 conexoes abertas** (nunca fechadas)
- Vazamento de memoria e file descriptors
- Erro "Too many open files" apos tempo

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Singleton com conexao reutilizavel
class Repository {
  private static instance: Repository;
  private database: Database;

  private constructor() {
    this.database = new Database(databasePath);
  }

  static getInstance(): Repository {
    if (!Repository.instance) {
      Repository.instance = new Repository();
    }
    return Repository.instance;
  }

  async count(): Promise<number> {
    const statement = this.database.prepare('SELECT COUNT(*) AS count FROM users');
    return statement.get().count;
  }

  close(): void {
    this.database.close();
  }
}
```

---

### 2.2 Servico Instanciado em Loop

**Arquivo:** `src/presentation/users.endpoint.ts`

**Problema:** Nova instancia do servico a cada iteracao:

```typescript
// ❌ PROBLEMA: 10.000 instancias criadas
while (hasMore) {
  const usersService = new UsersService();  // Nova instancia!
  const { total, data } = await usersService.getPaginatedUsers(skip, limit);
  // ...
}
```

**Impacto:**
- 10.000 instancias de `UsersService` criadas
- Cada `UsersService` cria um `Repository`
- Cada `Repository` cria uma conexao de banco
- **Cascata de vazamento de memoria**

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Instancia unica fora do loop
const usersService = new UsersService();  // Uma vez

while (hasMore) {
  const { total, data } = await usersService.getPaginatedUsers(skip, limit);
  // ...
}
```

---

### 2.3 I/O Sincrono Bloqueante

**Arquivo:** `src/infrastructure/repository.ts`

**Problema:** Biblioteca `better-sqlite3` e sincrona mas usada com `async/await`:

```typescript
// ❌ PROBLEMA: API sincrona enganando com async
async count(): Promise<number> {
  const statement = database.prepare('...');
  return (statement.get() as any).count;  // BLOQUEANTE!
}
```

**Impacto:**
- `better-sqlite3` bloqueia o event loop
- Servidor nao consegue processar outras requests
- `async/await` e apenas cosmetico - nao ha paralelismo
- Performance limitada a 1 operacao por vez

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Usar driver assincrono
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
  filename: databasePath,
  driver: sqlite3.Database
});

async count(): Promise<number> {
  const result = await db.get('SELECT COUNT(*) AS count FROM users');
  return result.count;  // Realmente assincrono
}
```

---

## 3. Problemas de Performance

### 3.1 Delay Artificial de 100ms

**Arquivo:** `src/presentation/users.endpoint.ts` (linha 37)

**Problema:**

```typescript
// ❌ PROBLEMA: Delay desnecessario
await new Promise((resolve) => setTimeout(resolve, 100));
```

**Impacto:**
- 10.000 batches x 100ms = 1.000.000ms = **~16.7 minutos**
- Tempo gasto apenas em espera

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Remover delay ou tornar configuravel
const delay = parseInt(process.env.BATCH_DELAY_MS || '0');
if (delay > 0) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}
```

**Resultado esperado:** Sync em **~30 segundos** ao inves de 16 minutos.

---

### 3.2 Padrao N+1 Queries

**Arquivo:** `src/domain/users.service.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: COUNT executado antes de cada LOOP
async getPaginatedUsers(skip: number, limit: number) {
  const total = await repository.count();  // Query 1 (repetida)
  const data = await repository.findAll(skip, limit);  // Query 2
  return { total, data };
}
```

**Impacto:**
- `count()` e chamado 10.000 vezes, sempre retornando o mesmo valor
- Query desnecessaria em cada iteracao

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Count apenas uma vez
async *streamAllUsers(batchSize: number = 100): AsyncGenerator<User[]> {
  const total = await repository.count();  // Uma vez
  let skip = 0;

  while (skip < total) {
    const batch = await repository.findAll(skip, batchSize);
    yield batch;
    skip += batchSize;
  }
}
```

---

### 3.3 SELECT * Desnecessario

**Arquivo:** `src/infrastructure/repository.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Busca todas as colunas
const statement = database.prepare('SELECT * FROM users LIMIT ? OFFSET ?');
```

**Impacto:**
- Transfere dados que podem nao ser necessarios
- Maior uso de memoria e I/O

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Selecionar apenas colunas necessarias
const statement = database.prepare(`
  SELECT id, user_name, email, created_at, deleted
  FROM users
  LIMIT ? OFFSET ?
`);
```

---

## 4. Problemas de Qualidade de Codigo

### 4.1 Uso Excessivo de `any`

**Arquivo:** `src/infrastructure/repository.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Tipos any em toda parte
return (statement.get() as any).count;
return statement.map((row: any) => new User(
  row.id,
  row.user_name,
  // ...
));
```

**Impacto:**
- Erros de tipo nao detectados em compile-time
- IntelliSense nao funciona
- Contradiz `strict: true` no tsconfig.json

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Interfaces tipadas
interface UserRow {
  id: number;
  user_name: string;
  email: string;
  created_at: string;
  deleted: number;
}

interface CountResult {
  count: number;
}

async count(): Promise<number> {
  const result = statement.get() as CountResult;
  return result.count;
}

async findAll(skip: number, limit: number): Promise<User[]> {
  const rows = statement.all(limit, skip) as UserRow[];
  return rows.map((row) => new User(
    row.id,
    row.user_name,
    row.email,
    new Date(row.created_at),
    row.deleted === 1
  ));
}
```

---

### 4.2 Sem Tratamento de Erros

**Arquivo:** `src/infrastructure/repository.ts`, `src/presentation/users.endpoint.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Nenhum try-catch
async count(): Promise<number> {
  const database = new Database(databasePath);  // Pode falhar
  const statement = database.prepare('...');     // Pode falhar
  return (statement.get() as any).count;         // Pode ser undefined
}
```

**Impacto:**
- Servidor crasha em erros de banco
- Nenhuma mensagem util ao cliente
- Nenhum log de erro

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Try-catch com logging
async count(): Promise<number> {
  try {
    const statement = this.database.prepare('SELECT COUNT(*) AS count FROM users');
    const result = statement.get() as CountResult;
    return result.count ?? 0;
  } catch (error) {
    console.error('Error counting users:', error);
    throw new Error('Failed to count users');
  }
}
```

---

### 4.3 Recursos Nunca Liberados

**Arquivo:** `src/infrastructure/repository.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Conexao nunca fechada
const database = new Database(databasePath);
// ... uso
// FALTA: database.close()
```

**Impacto:**
- File descriptors vazam
- "Too many open files" apos varias syncs

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  Repository.getInstance().close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Interrupted, closing connections...');
  Repository.getInstance().close();
  process.exit(0);
});
```

---

## 5. Problemas de Arquitetura

### 5.1 Sem Injecao de Dependencia

**Arquivo:** `src/domain/users.service.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Acoplamento forte
export class UsersService {
  async getPaginatedUsers(skip: number, limit: number) {
    const repository = new Repository();  // Dependencia hardcoded
    // ...
  }
}
```

**Impacto:**
- Impossivel mockar para testes
- Impossivel trocar implementacao
- Violacao do principio D (SOLID)

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Injecao de dependencia
export class UsersService {
  constructor(private readonly repository: IRepository) {}

  async getPaginatedUsers(skip: number, limit: number) {
    const total = await this.repository.count();
    const data = await this.repository.findAll(skip, limit);
    return { total, data };
  }
}

// Uso
const repository = Repository.getInstance();
const service = new UsersService(repository);
```

---

### 5.2 Sem Validacao de Input

**Arquivo:** `src/presentation/users.endpoint.ts`

**Problema:**

```typescript
// ❌ PROBLEMA: Nenhuma validacao
let skip = 0;
let limit = 100;
// Nao ha validacao de query params
```

**Impacto:**
- Cliente pode enviar valores negativos
- Cliente pode enviar limit muito alto (DoS)
- Sem paginacao customizavel

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Validacao e parametros configuráveis
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

const requestedLimit = parseInt(req.query.limit as string) || DEFAULT_LIMIT;
const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
```

---

### 5.3 Sem Health Check

**Problema:** Nenhum endpoint de health check.

**Impacto:**
- Load balancers nao conseguem verificar saude
- Container pode parecer saudavel mas estar em estado inconsistente

**Solucao Proposta:**

```typescript
// ✅ SOLUCAO: Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const count = await Repository.getInstance().count();
    res.json({
      status: 'healthy',
      database: 'connected',
      records: count
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

---

## 6. Propostas de Otimizacao

### 6.1 Refatoracao Completa Proposta

```
legacy-api/api/src/
├── domain/
│   ├── user.ts                    # (manter)
│   └── users.service.ts           # Refatorar: DI + streaming
├── infrastructure/
│   ├── repository.ts              # Refatorar: Singleton + tipos
│   └── database.ts                # NOVO: Gerenciador de conexao
└── presentation/
    ├── index.ts                   # Refatorar: Health check + graceful shutdown
    ├── users.endpoint.ts          # Refatorar: Servico reutilizado
    └── validation.handle.ts       # (manter)
```

### 6.2 Codigo Refatorado Completo

#### `infrastructure/database.ts` (NOVO)

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const databasePath = path.resolve(__dirname, 'users.db');

class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database;

  private constructor() {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');  // Melhor performance
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  getConnection(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseManager;
```

#### `infrastructure/repository.ts` (REFATORADO)

```typescript
import DatabaseManager from './database';
import { User } from '../domain/user';

interface UserRow {
  id: number;
  user_name: string;
  email: string;
  created_at: string;
  deleted: number;
}

export class Repository {
  private db = DatabaseManager.getInstance().getConnection();

  count(): number {
    const result = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    return result.count;
  }

  findAll(skip: number, limit: number): User[] {
    const rows = this.db
      .prepare('SELECT id, user_name, email, created_at, deleted FROM users LIMIT ? OFFSET ?')
      .all(limit, skip) as UserRow[];

    return rows.map((row) => new User(
      row.id,
      row.user_name,
      row.email,
      new Date(row.created_at),
      row.deleted === 1
    ));
  }
}
```

#### `domain/users.service.ts` (REFATORADO)

```typescript
import { Repository } from '../infrastructure/repository';
import { User } from './user';

export class UsersService {
  private repository: Repository;

  constructor(repository?: Repository) {
    this.repository = repository || new Repository();
  }

  async *streamAllUsers(batchSize: number = 100): AsyncGenerator<User[]> {
    const total = this.repository.count();
    let skip = 0;

    while (skip < total) {
      yield this.repository.findAll(skip, batchSize);
      skip += batchSize;
    }
  }
}
```

#### `presentation/users.endpoint.ts` (REFATORADO)

```typescript
import express from 'express';
import { Readable } from 'stream';
import { UsersService } from '../domain/users.service';

const usersService = new UsersService();  // Uma instancia

export const usersEndpoint = async (req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'application/json');

  // Erros simulados (mantidos para teste)
  if (Math.random() < 0.2) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  if (Math.random() < 0.2) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const stream = new Readable({ read: () => {} });
  stream.pipe(res);

  try {
    for await (const batch of usersService.streamAllUsers(100)) {
      // Corrupcao simulada (mantida para teste)
      if (Math.random() < 0.2) {
        stream.push('{/dados/:/corrompidos/}');
      }
      stream.push(JSON.stringify(batch));
    }
    stream.push(null);
  } catch (error) {
    console.error('Streaming error:', error);
    stream.destroy(error as Error);
  }
};
```

#### `presentation/index.ts` (REFATORADO)

```typescript
import express from 'express';
import { usersEndpoint } from './users.endpoint';
import { validateHandle } from './validation.handle';
import DatabaseManager from '../infrastructure/database';

const app = express();

// Health check
app.get('/health', (req, res) => {
  try {
    const db = DatabaseManager.getInstance().getConnection();
    const result = db.prepare('SELECT 1').get();
    res.json({ status: 'healthy' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: (error as Error).message });
  }
});

app.get('/external/users', validateHandle, usersEndpoint);

const port = 3001;
const server = app.listen(port, () => {
  console.log(`Legacy API running on port ${port}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    DatabaseManager.getInstance().close();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## 7. Resultados Esperados

### Comparacao Antes vs Depois

| Metrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| **Tempo de sync** | ~16-20 min | ~30 seg | **32x mais rapido** |
| **Conexoes de banco** | 20.000 | 1 | **20.000x menos** |
| **Instancias de servico** | 10.000 | 1 | **10.000x menos** |
| **Uso de memoria** | Crescente | Constante | **Sem vazamento** |
| **File descriptors** | Vazando | Gerenciados | **Sem leak** |
| **Tratamento de erros** | Nenhum | Completo | **Recuperavel** |
| **Type safety** | ~40% any | 0% any | **100% tipado** |
| **Graceful shutdown** | Nenhum | Implementado | **Recursos liberados** |

### Teste Comparativo Sugerido

```bash
# Antes da otimizacao
time curl -H "x-api-key: test-api-key-2024" http://localhost:3001/external/users > /dev/null
# Esperado: ~16-20 minutos

# Depois da otimizacao (sem delay)
time curl -H "x-api-key: test-api-key-2024" http://localhost:3001/external/users > /dev/null
# Esperado: ~30 segundos
```

### Monitoramento de Recursos

```bash
# Antes: File descriptors crescem indefinidamente
lsof -p $(pgrep -f "node.*legacy") | wc -l
# Esperado: >1000 apos alguns syncs

# Depois: File descriptors estaveis
lsof -p $(pgrep -f "node.*legacy") | wc -l
# Esperado: <50 (constante)
```

---

## Conclusao

O sistema legado apresenta problemas fundamentais de arquitetura que causam:

1. **Vazamento de recursos** (conexoes, memoria, file descriptors)
2. **Performance degradada** (delays artificiais, queries duplicadas)
3. **Codigo fragil** (sem tratamento de erros, sem tipos)

As otimizacoes propostas resolvem esses problemas mantendo a compatibilidade com os comportamentos intencionais de teste (erros 500/429 e JSON corrompido), enquanto melhoram drasticamente a performance e confiabilidade do sistema.

---

*Documento criado em: 2025-12-27*
*Baseado na analise do codigo em `/legacy-api/api/`*
