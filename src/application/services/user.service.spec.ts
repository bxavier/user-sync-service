import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@/domain/models';
import type { UserRepository } from '@/domain/repositories';
import { USER_REPOSITORY } from '@/domain/repositories';
import type { ILogger } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import { CreateUserDto, ExportCsvQueryDto, PaginationDto, UpdateUserDto } from '@/application/dtos';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockLogger: jest.Mocked<ILogger>;

  const createMockUser = (overrides: Partial<User> = {}): User => {
    return new User({
      id: 1,
      legacyId: null,
      userName: 'john_doe',
      email: 'john@example.com',
      legacyCreatedAt: null,
      createdAt: new Date('2024-06-01T12:00:00Z'),
      updatedAt: new Date('2024-06-01T12:00:00Z'),
      deleted: false,
      deletedAt: null,
      ...overrides,
    });
  };

  beforeEach(async () => {
    mockUserRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByUserName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      upsertByLegacyId: jest.fn(),
      bulkUpsertByUserName: jest.fn(),
      findAllForExport: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: LOGGER_SERVICE, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('findAll', () => {
    it('should return paginated users with correct metadata', async () => {
      const users = [createMockUser({ id: 1 }), createMockUser({ id: 2, userName: 'jane_doe' })];
      mockUserRepository.findAll.mockResolvedValue({ users, total: 25 });

      const pagination: PaginationDto = { page: 1, limit: 10 };
      const result = await service.findAll(pagination);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(3);
    });

    it('should use default pagination when not provided', async () => {
      mockUserRepository.findAll.mockResolvedValue({ users: [], total: 0 });

      await service.findAll({});

      expect(mockUserRepository.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it('should calculate totalPages correctly', async () => {
      mockUserRepository.findAll.mockResolvedValue({ users: [], total: 100 });

      const result = await service.findAll({ page: 1, limit: 15 });

      expect(result.totalPages).toBe(7); // ceil(100/15) = 7
    });

    it('should log the operation', async () => {
      mockUserRepository.findAll.mockResolvedValue({ users: [], total: 0 });

      await service.findAll({ page: 2, limit: 20 });

      expect(mockLogger.log).toHaveBeenCalledWith('Fetching users', { page: 2, limit: 20 });
    });
  });

  describe('findByUserName', () => {
    it('should return user when found', async () => {
      const user = createMockUser();
      mockUserRepository.findByUserName.mockResolvedValue(user);

      const result = await service.findByUserName('john_doe');

      expect(result.userName).toBe('john_doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findByUserName.mockResolvedValue(null);

      await expect(service.findByUserName('unknown')).rejects.toThrow(NotFoundException);
      await expect(service.findByUserName('unknown')).rejects.toThrow("User 'unknown' not found");
    });

    it('should log the operation', async () => {
      mockUserRepository.findByUserName.mockResolvedValue(createMockUser());

      await service.findByUserName('john_doe');

      expect(mockLogger.log).toHaveBeenCalledWith('Fetching user by userName', {
        userName: 'john_doe',
      });
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = createMockUser({ id: 5 });
      mockUserRepository.findById.mockResolvedValue(user);

      const result = await service.findById(5);

      expect(result.id).toBe(5);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
      await expect(service.findById(999)).rejects.toThrow('User with id 999 not found');
    });

    it('should log the operation', async () => {
      mockUserRepository.findById.mockResolvedValue(createMockUser({ id: 10 }));

      await service.findById(10);

      expect(mockLogger.log).toHaveBeenCalledWith('Fetching user by id', { id: 10 });
    });
  });

  describe('create', () => {
    it('should create user when userName is unique', async () => {
      const newUser = createMockUser({ id: 1, userName: 'new_user', email: 'new@example.com' });
      mockUserRepository.findByUserName.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(newUser);

      const dto: CreateUserDto = { userName: 'new_user', email: 'new@example.com' };
      const result = await service.create(dto);

      expect(result.userName).toBe('new_user');
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        userName: 'new_user',
        email: 'new@example.com',
      });
    });

    it('should throw ConflictException when userName already exists', async () => {
      mockUserRepository.findByUserName.mockResolvedValue(createMockUser());

      const dto: CreateUserDto = { userName: 'john_doe', email: 'another@example.com' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        "userName 'john_doe' is already in use",
      );
    });

    it('should not call create when userName exists', async () => {
      mockUserRepository.findByUserName.mockResolvedValue(createMockUser());

      const dto: CreateUserDto = { userName: 'john_doe', email: 'test@example.com' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should log user creation', async () => {
      mockUserRepository.findByUserName.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(createMockUser({ id: 5 }));

      await service.create({ userName: 'new_user', email: 'new@example.com' });

      expect(mockLogger.log).toHaveBeenCalledWith('Creating user', { userName: 'new_user' });
      expect(mockLogger.log).toHaveBeenCalledWith('User created successfully', { id: 5 });
    });
  });

  describe('update', () => {
    it('should update user when exists', async () => {
      const existingUser = createMockUser({ id: 1 });
      const updatedUser = createMockUser({
        id: 1,
        userName: 'updated_name',
        email: 'updated@example.com',
      });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const dto: UpdateUserDto = { userName: 'updated_name', email: 'updated@example.com' };
      const result = await service.update(1, dto);

      expect(result.userName).toBe('updated_name');
      expect(result.email).toBe('updated@example.com');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const dto: UpdateUserDto = { email: 'new@example.com' };

      await expect(service.update(999, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when new userName already in use', async () => {
      const existingUser = createMockUser({ id: 1, userName: 'original' });
      const conflictingUser = createMockUser({ id: 2, userName: 'taken' });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByUserName.mockResolvedValue(conflictingUser);

      const dto: UpdateUserDto = { userName: 'taken' };

      await expect(service.update(1, dto)).rejects.toThrow(ConflictException);
      await expect(service.update(1, dto)).rejects.toThrow("userName 'taken' is already in use");
    });

    it('should not check for conflict when userName not changing', async () => {
      const existingUser = createMockUser({ id: 1, userName: 'john_doe' });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(existingUser);

      const dto: UpdateUserDto = { userName: 'john_doe', email: 'new@example.com' };
      await service.update(1, dto);

      expect(mockUserRepository.findByUserName).not.toHaveBeenCalled();
    });

    it('should allow partial update (email only)', async () => {
      const existingUser = createMockUser({ id: 1 });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(existingUser);

      const dto: UpdateUserDto = { email: 'new@example.com' };
      await service.update(1, dto);

      expect(mockUserRepository.update).toHaveBeenCalledWith(1, {
        userName: undefined,
        email: 'new@example.com',
      });
    });

    it('should throw NotFoundException if update returns null', async () => {
      const existingUser = createMockUser({ id: 1 });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(null);

      const dto: UpdateUserDto = { email: 'new@example.com' };

      await expect(service.update(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('should log the update operation', async () => {
      const existingUser = createMockUser({ id: 5 });
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue(existingUser);

      await service.update(5, { email: 'new@example.com' });

      expect(mockLogger.log).toHaveBeenCalledWith('Updating user', { id: 5 });
      expect(mockLogger.log).toHaveBeenCalledWith('User updated successfully', { id: 5 });
    });
  });

  describe('remove', () => {
    it('should soft delete user when exists', async () => {
      mockUserRepository.softDelete.mockResolvedValue(true);

      await expect(service.remove(1)).resolves.toBeUndefined();

      expect(mockUserRepository.softDelete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.softDelete.mockResolvedValue(false);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      await expect(service.remove(999)).rejects.toThrow('User with id 999 not found');
    });

    it('should log the delete operation', async () => {
      mockUserRepository.softDelete.mockResolvedValue(true);

      await service.remove(10);

      expect(mockLogger.log).toHaveBeenCalledWith('Deleting user (soft delete)', { id: 10 });
      expect(mockLogger.log).toHaveBeenCalledWith('User deleted successfully', { id: 10 });
    });
  });

  describe('exportUsersCsv', () => {
    it('should yield CSV header first', async () => {
      async function* emptyGenerator(): AsyncGenerator<User> {}
      mockUserRepository.findAllForExport.mockReturnValue(emptyGenerator());

      const generator = service.exportUsersCsv({});
      const firstLine = await generator.next();

      expect(firstLine.value).toBe('id,userName,email,createdAt\n');
    });

    it('should yield user data as CSV rows', async () => {
      const users = [
        createMockUser({ id: 1, userName: 'user1', email: 'user1@test.com' }),
        createMockUser({ id: 2, userName: 'user2', email: 'user2@test.com' }),
      ];

      async function* userGenerator(): AsyncGenerator<User> {
        for (const user of users) {
          yield user;
        }
      }
      mockUserRepository.findAllForExport.mockReturnValue(userGenerator());

      const generator = service.exportUsersCsv({});
      const results: string[] = [];

      for await (const row of generator) {
        results.push(row);
      }

      expect(results).toHaveLength(3); // header + 2 users
      expect(results[0]).toBe('id,userName,email,createdAt\n');
      expect(results[1]).toContain('1,user1,user1@test.com');
      expect(results[2]).toContain('2,user2,user2@test.com');
    });

    it('should escape fields with commas', async () => {
      const user = createMockUser({ id: 1, userName: 'user,with,commas', email: 'test@test.com' });

      async function* userGenerator(): AsyncGenerator<User> {
        yield user;
      }
      mockUserRepository.findAllForExport.mockReturnValue(userGenerator());

      const generator = service.exportUsersCsv({});
      const results: string[] = [];

      for await (const row of generator) {
        results.push(row);
      }

      expect(results[1]).toContain('"user,with,commas"');
    });

    it('should escape fields with quotes', async () => {
      const user = createMockUser({ id: 1, userName: 'user"with"quotes', email: 'test@test.com' });

      async function* userGenerator(): AsyncGenerator<User> {
        yield user;
      }
      mockUserRepository.findAllForExport.mockReturnValue(userGenerator());

      const generator = service.exportUsersCsv({});
      const results: string[] = [];

      for await (const row of generator) {
        results.push(row);
      }

      expect(results[1]).toContain('"user""with""quotes"');
    });

    it('should escape fields with newlines', async () => {
      const user = createMockUser({
        id: 1,
        userName: 'user\nwith\nnewlines',
        email: 'test@test.com',
      });

      async function* userGenerator(): AsyncGenerator<User> {
        yield user;
      }
      mockUserRepository.findAllForExport.mockReturnValue(userGenerator());

      const generator = service.exportUsersCsv({});
      const results: string[] = [];

      for await (const row of generator) {
        results.push(row);
      }

      expect(results[1]).toContain('"user\nwith\nnewlines"');
    });

    it('should pass date filters to repository', async () => {
      async function* emptyGenerator(): AsyncGenerator<User> {}
      mockUserRepository.findAllForExport.mockReturnValue(emptyGenerator());

      const query: ExportCsvQueryDto = {
        created_from: new Date('2024-01-01'),
        created_to: new Date('2024-12-31'),
      };

      const generator = service.exportUsersCsv(query);
      // Consume the generator
      for await (const _ of generator) {
        // consume
      }

      expect(mockUserRepository.findAllForExport).toHaveBeenCalledWith({
        createdFrom: new Date('2024-01-01'),
        createdTo: new Date('2024-12-31'),
      });
    });

    it('should log the export operation', async () => {
      async function* emptyGenerator(): AsyncGenerator<User> {}
      mockUserRepository.findAllForExport.mockReturnValue(emptyGenerator());

      const query: ExportCsvQueryDto = {
        created_from: new Date('2024-01-01'),
        created_to: new Date('2024-06-30'),
      };

      const generator = service.exportUsersCsv(query);
      for await (const _ of generator) {
        // consume
      }

      expect(mockLogger.log).toHaveBeenCalledWith('Exporting users to CSV', {
        createdFrom: new Date('2024-01-01'),
        createdTo: new Date('2024-06-30'),
      });
    });
  });
});
