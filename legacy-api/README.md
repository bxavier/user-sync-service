# API de Usuários

API REST desenvolvida em Node.js com TypeScript para gerenciamento e consulta de usuários. A aplicação utiliza uma arquitetura em camadas (Domain, Infrastructure, Presentation) e implementa streaming de dados para otimizar a transferência de grandes volumes de informações.

## 📋 Tecnologias

- **Node.js** 20;
- **TypeScript** 5.7.2;
- **Express** 5.2.1;
- **SQLite** (better-sqlite3) 12.5.0;
- **Docker**;

## 🏗️ Arquitetura

O projeto segue uma arquitetura em camadas:

```
src/
├── domain/           # Lógica de negócio
│   ├── user.ts      # Entidade User
│   └── users.service.ts  # Serviço de usuários
├── infrastructure/   # Acesso a dados
│   ├── repository.ts # Repositório SQLite
│   └── users.db      # Banco de dados SQLite
└── presentation/     # Camada de apresentação
    ├── index.ts      # Configuração do Express
    ├── users.endpoint.ts  # Endpoint de usuários
    └── validation.handle.ts  # Middleware de validação
```

## 🚀 Como Executar

### Pré-requisitos

- Docker;

### Execução: deve simular serviço com baixa capacidade de memória

1. **Configurar variáveis de ambiente:**
```bash
cp env.example .env
```

2. **Construir a imagem:**
```bash
docker build -t api .
```

3. **Executar o container:**
```bash
docker run -m 128m --network=host api
```

## 📡 Endpoints

### GET /external/users

Retorna uma lista de usuários em formato JSON através de streaming.

**Headers obrigatórios:**
- `x-api-key`: Chave de API válida (deve corresponder à variável de ambiente `API_KEY`);

**Respostas:**

- `200 OK`: Stream de dados JSON com lista de usuários;
- `401 Unauthorized`: Chave de API inválida ou ausente;
- `429 Too Many Requests`: Simulação de limite de requisições (comportamento aleatório);
- `500 Internal Server Error`: Erro interno do servidor (comportamento aleatório);

**Exemplo de requisição:**
```bash
curl -H "x-api-key: sua-chave-api-aqui" http://localhost:3001/external/users
```

**Nota:** O endpoint implementa streaming de dados, retornando os usuários em lotes de 100 registros por vez. Em alguns casos, pode retornar dados corrompidos ou erros simulados para testes de resiliência.

## 🔐 Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `API_KEY` | Chave de API para autenticação | Sim |

### Configuração

Antes de executar a API, crie o arquivo `.env` a partir do template:

```bash
cp env.example .env
```

O arquivo `env.example` já contém uma API_KEY configurada para testes: `test-api-key-2024`


## 🗄️ Banco de Dados

O projeto utiliza SQLite como banco de dados. O arquivo `users.db` está localizado em `src/infrastructure/users.db` e é copiado para a pasta `dist` durante o build.

**Estrutura da tabela `users`:**
- `id`: INTEGER (chave primária);
- `user_name`: TEXT;
- `email`: TEXT;
- `created_at`: DATETIME;
- `deleted`: BOOLEAN;

## ⚠️ Observações

- O endpoint implementa comportamentos simulados para testes:
  - 20% de chance de retornar erro 500;
  - 20% de chance de retornar erro 429;
  - 20% de chance de enviar dados corrompidos no stream;
- A aplicação utiliza streaming para otimizar a transferência de grandes volumes de dados;
- Os dados são paginados em lotes de 100 registros;