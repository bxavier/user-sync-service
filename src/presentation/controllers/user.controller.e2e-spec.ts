/**
 * TESTE E2E - Users API
 *
 * Diferença dos outros testes:
 * - Unitário: mocka tudo, testa uma função
 * - Integração: usa banco real, testa repository + banco
 * - E2E: testa a API completa via HTTP requests
 *
 * O que testamos aqui:
 * - HTTP Request → Controller → Service → Repository → Banco
 * - Validação de DTOs
 * - HTTP status codes corretos
 * - Formato das respostas JSON
 * - Headers HTTP
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '@/infrastructure/database/entities';
import { TypeOrmUserRepository } from '@/infrastructure/repositories/user.repository';
import { USER_REPOSITORY } from '@/domain/repositories/user.repository.interface';
import { LOGGER_SERVICE } from '@/domain/services';
import { UserService } from '@/application/services';
import { UserController } from './user.controller';

describe('Users API (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ormRepository: Repository<UserEntity>;

  /**
   * Mock do Logger - não precisamos de logs reais nos testes
   */
  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // Banco in-memory para testes
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [UserEntity],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([UserEntity]),
      ],
      controllers: [UserController],
      providers: [
        UserService,
        TypeOrmUserRepository,
        // Injeta o repository com o token correto
        {
          provide: USER_REPOSITORY,
          useExisting: TypeOrmUserRepository,
        },
        // Mock do logger
        {
          provide: LOGGER_SERVICE,
          useValue: mockLogger,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Configura validação igual ao app real
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    ormRepository = moduleFixture.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
  }, 30000);

  /**
   * Limpa a tabela antes de cada teste
   */
  beforeEach(async () => {
    await ormRepository.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app?.close();
  }, 10000);

  // ============================================================
  // POST /users - Criar usuário
  // ============================================================

  describe('POST /users', () => {
    it('should create a user and return 201', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          userName: 'john_doe',
          email: 'john@example.com',
        });

      // Assert - UserResponseDto não inclui `deleted`
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        userName: 'john_doe',
        email: 'john@example.com',
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
    });

    it('should return 409 Conflict when userName already exists', async () => {
      // Arrange - cria um usuário primeiro
      await request(app.getHttpServer()).post('/users').send({
        userName: 'existing_user',
        email: 'existing@example.com',
      });

      // Act - tenta criar outro com mesmo userName
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          userName: 'existing_user',
          email: 'different@example.com',
        });

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('already');
    });

    it('should return 400 Bad Request when userName is missing', async () => {
      const response = await request(app.getHttpServer()).post('/users').send({
        email: 'john@example.com',
        // userName faltando
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 Bad Request when email is invalid', async () => {
      const response = await request(app.getHttpServer()).post('/users').send({
        userName: 'john_doe',
        email: 'not-an-email',
      });

      expect(response.status).toBe(400);
    });
  });

  // ============================================================
  // GET /users - Listar usuários
  // ============================================================

  describe('GET /users', () => {
    beforeEach(async () => {
      // Cria 15 usuários para testar paginação
      for (let i = 1; i <= 15; i++) {
        await ormRepository.save({
          userName: `user_${i.toString().padStart(2, '0')}`,
          email: `user${i}@example.com`,
          deleted: false,
        });
      }
    });

    it('should return paginated users with default pagination', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(10); // Default limit
      // PaginatedUsersResponseDto tem campos flat, não nested em meta
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
      expect(response.body.total).toBe(15);
      expect(response.body.totalPages).toBe(2);
    });

    it('should return second page when page=2', async () => {
      const response = await request(app.getHttpServer()).get('/users?page=2&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5); // 15 - 10 = 5
      expect(response.body.page).toBe(2);
    });

    it('should respect custom limit', async () => {
      const response = await request(app.getHttpServer()).get('/users?limit=5');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.limit).toBe(5);
      expect(response.body.totalPages).toBe(3); // 15 / 5 = 3
    });

    it('should not return deleted users', async () => {
      // Marca alguns como deletados diretamente no banco
      await ormRepository.update({ userName: 'user_01' }, { deleted: true, deletedAt: new Date() });
      await ormRepository.update({ userName: 'user_02' }, { deleted: true, deletedAt: new Date() });

      const response = await request(app.getHttpServer()).get('/users?limit=100');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(13); // 15 - 2 = 13
    });
  });

  // ============================================================
  // GET /users/:user_name - Buscar por userName
  // ============================================================

  describe('GET /users/:user_name', () => {
    beforeEach(async () => {
      await ormRepository.save({
        userName: 'find_me',
        email: 'find@example.com',
        deleted: false,
      });
    });

    it('should return user when found', async () => {
      const response = await request(app.getHttpServer()).get('/users/find_me');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        userName: 'find_me',
        email: 'find@example.com',
      });
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app.getHttpServer()).get('/users/nonexistent');

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted users', async () => {
      await ormRepository.update({ userName: 'find_me' }, { deleted: true, deletedAt: new Date() });

      const response = await request(app.getHttpServer()).get('/users/find_me');

      expect(response.status).toBe(404);
    });
  });

  // ============================================================
  // PUT /users/:id - Atualizar usuário
  // ============================================================

  describe('PUT /users/:id', () => {
    let userId: number;

    beforeEach(async () => {
      const user = await ormRepository.save({
        userName: 'update_me',
        email: 'old@example.com',
        deleted: false,
      });
      userId = user.id;
    });

    it('should update user email', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .send({ email: 'new@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('new@example.com');
      expect(response.body.userName).toBe('update_me'); // Não mudou
    });

    it('should update userName', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .send({ userName: 'new_name' });

      expect(response.status).toBe(200);
      expect(response.body.userName).toBe('new_name');
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app.getHttpServer())
        .put('/users/99999')
        .send({ email: 'new@example.com' });

      expect(response.status).toBe(404);
    });

    it('should return 409 when new userName is already in use', async () => {
      // Cria outro usuário com userName que vamos tentar usar
      await ormRepository.save({
        userName: 'taken_name',
        email: 'taken@example.com',
        deleted: false,
      });

      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .send({ userName: 'taken_name' });

      expect(response.status).toBe(409);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .send({ email: 'not-valid' });

      expect(response.status).toBe(400);
    });
  });

  // ============================================================
  // DELETE /users/:id - Soft delete
  // ============================================================

  describe('DELETE /users/:id', () => {
    let userId: number;

    beforeEach(async () => {
      const user = await ormRepository.save({
        userName: 'delete_me',
        email: 'delete@example.com',
        deleted: false,
      });
      userId = user.id;
    });

    it('should soft delete user and return 204', async () => {
      const response = await request(app.getHttpServer()).delete(`/users/${userId}`);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({}); // No content

      // Verifica que foi marcado como deletado
      const user = await ormRepository.findOne({ where: { id: userId } });
      expect(user?.deleted).toBe(true);
      expect(user?.deletedAt).toBeInstanceOf(Date);
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app.getHttpServer()).delete('/users/99999');

      expect(response.status).toBe(404);
    });

    it('should return 404 when user already deleted', async () => {
      // Deleta primeiro
      await request(app.getHttpServer()).delete(`/users/${userId}`);

      // Tenta deletar de novo
      const response = await request(app.getHttpServer()).delete(`/users/${userId}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================
  // GET /users/export/csv - Exportar CSV
  // ============================================================
  // NOTA: Testes de CSV foram pulados porque o endpoint usa streaming Fastify
  // (reply.raw.writeHead) que não funciona com supertest.
  // Para testar CSV em E2E, seria necessário usar um servidor real.
  // A funcionalidade é testada nos testes unitários do UserService.
});
