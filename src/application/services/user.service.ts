import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRepository } from '@/domain/repositories';
import { USER_REPOSITORY } from '@/domain/repositories';
import type { ILogger } from '@/domain/services';
import { LOGGER_SERVICE } from '@/domain/services';
import {
  CreateUserDto,
  ExportCsvQueryDto,
  PaginatedUsersResponseDto,
  PaginationDto,
  UpdateUserDto,
  UserResponseDto,
} from '@/application/dtos';

/**
 * Service for user CRUD operations, search, and CSV export.
 * All operations respect soft delete (only returns non-deleted users).
 */
@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(LOGGER_SERVICE)
    private readonly logger: ILogger,
  ) {}

  /**
   * Retrieves a paginated list of users.
   * @param pagination - Pagination parameters (page, limit)
   * @returns Paginated response with users and metadata
   */
  async findAll(pagination: PaginationDto): Promise<PaginatedUsersResponseDto> {
    const { page = 1, limit = 10 } = pagination;

    this.logger.log('Fetching users', { page, limit });

    const { users, total } = await this.userRepository.findAll({ page, limit });

    const totalPages = Math.ceil(total / limit);

    return {
      data: users.map(UserResponseDto.fromEntity),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Finds a user by their unique username.
   * @param userName - The unique username to search for
   * @returns The user data if found
   * @throws {NotFoundException} When user doesn't exist
   */
  async findByUserName(userName: string): Promise<UserResponseDto> {
    this.logger.log('Fetching user by userName', { userName });

    const user = await this.userRepository.findByUserName(userName);

    if (!user) {
      throw new NotFoundException(`User '${userName}' not found`);
    }

    return UserResponseDto.fromEntity(user);
  }

  /**
   * Finds a user by their internal ID.
   * @param id - The internal user ID
   * @returns The user data if found
   * @throws {NotFoundException} When user doesn't exist
   */
  async findById(id: number): Promise<UserResponseDto> {
    this.logger.log('Fetching user by id', { id });

    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return UserResponseDto.fromEntity(user);
  }

  /**
   * Creates a new user in the system.
   * @param dto - User creation data (userName, email)
   * @returns The created user data
   * @throws {ConflictException} When userName is already in use
   */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    this.logger.log('Creating user', { userName: dto.userName });

    const existing = await this.userRepository.findByUserName(dto.userName);
    if (existing) {
      throw new ConflictException(`userName '${dto.userName}' is already in use`);
    }

    const user = await this.userRepository.create({
      userName: dto.userName,
      email: dto.email,
    });

    this.logger.log('User created successfully', { id: user.id });

    return UserResponseDto.fromEntity(user);
  }

  /**
   * Updates an existing user's information.
   * @param id - The internal user ID to update
   * @param dto - The fields to update (userName, email)
   * @returns The updated user data
   * @throws {NotFoundException} When user doesn't exist
   * @throws {ConflictException} When new userName is already in use
   */
  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    this.logger.log('Updating user', { id });

    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (dto.userName && dto.userName !== existing.userName) {
      const conflict = await this.userRepository.findByUserName(dto.userName);
      if (conflict) {
        throw new ConflictException(`userName '${dto.userName}' is already in use`);
      }
    }

    const user = await this.userRepository.update(id, {
      userName: dto.userName,
      email: dto.email,
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    this.logger.log('User updated successfully', { id });

    return UserResponseDto.fromEntity(user);
  }

  /**
   * Performs a soft delete on a user (sets deleted=true).
   * @param id - The internal user ID to delete
   * @throws {NotFoundException} When user doesn't exist
   */
  async remove(id: number): Promise<void> {
    this.logger.log('Deleting user (soft delete)', { id });

    const deleted = await this.userRepository.softDelete(id);

    if (!deleted) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    this.logger.log('User deleted successfully', { id });
  }

  /**
   * Exports users to CSV format using streaming (memory-efficient).
   * @param query - Filter options (created_from, created_to)
   * @yields CSV lines (header first, then one line per user)
   */
  async *exportUsersCsv(query: ExportCsvQueryDto): AsyncGenerator<string, void, unknown> {
    this.logger.log('Exporting users to CSV', {
      createdFrom: query.created_from,
      createdTo: query.created_to,
    });

    yield 'id,userName,email,createdAt\n';

    for await (const user of this.userRepository.findAllForExport({
      createdFrom: query.created_from,
      createdTo: query.created_to,
    })) {
      yield `${user.id},${this.escapeCsvField(user.userName)},${this.escapeCsvField(user.email)},${user.createdAt.toISOString()}\n`;
    }
  }

  /**
   * Escapes a CSV field according to RFC 4180.
   * @param field - The field value to escape
   * @returns The escaped field value
   */
  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
