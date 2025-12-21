import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { USER_REPOSITORY } from '../../domain/repositories';
import type { UserRepository } from '../../domain/repositories';
import {
  CreateUserDto,
  UpdateUserDto,
  PaginationDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
  ExportCsvQueryDto,
} from '../dtos';
import { LoggerService } from '../../infrastructure/logger';
import { User } from '../../domain/entities';

@Injectable()
export class UserService {
  private readonly logger = new LoggerService(UserService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async findAll(pagination: PaginationDto): Promise<PaginatedUsersResponseDto> {
    const { page = 1, limit = 10 } = pagination;

    this.logger.log('Buscando usuários', { page, limit });

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

  async findByUserName(userName: string): Promise<UserResponseDto> {
    this.logger.log('Buscando usuário por userName', { userName });

    const user = await this.userRepository.findByUserName(userName);

    if (!user) {
      throw new NotFoundException(`Usuário '${userName}' não encontrado`);
    }

    return UserResponseDto.fromEntity(user);
  }

  async findById(id: number): Promise<UserResponseDto> {
    this.logger.log('Buscando usuário por id', { id });

    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`Usuário com id ${id} não encontrado`);
    }

    return UserResponseDto.fromEntity(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    this.logger.log('Criando usuário', { userName: dto.userName });

    const existing = await this.userRepository.findByUserName(dto.userName);
    if (existing) {
      throw new ConflictException(`userName '${dto.userName}' já está em uso`);
    }

    const user = await this.userRepository.create({
      userName: dto.userName,
      email: dto.email,
    });

    this.logger.log('Usuário criado com sucesso', { id: user.id });

    return UserResponseDto.fromEntity(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    this.logger.log('Atualizando usuário', { id });

    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Usuário com id ${id} não encontrado`);
    }

    if (dto.userName && dto.userName !== existing.userName) {
      const conflict = await this.userRepository.findByUserName(dto.userName);
      if (conflict) {
        throw new ConflictException(`userName '${dto.userName}' já está em uso`);
      }
    }

    const user = await this.userRepository.update(id, {
      userName: dto.userName,
      email: dto.email,
    });

    if (!user) {
      throw new NotFoundException(`Usuário com id ${id} não encontrado`);
    }

    this.logger.log('Usuário atualizado com sucesso', { id });

    return UserResponseDto.fromEntity(user);
  }

  async remove(id: number): Promise<void> {
    this.logger.log('Removendo usuário (soft delete)', { id });

    const deleted = await this.userRepository.softDelete(id);

    if (!deleted) {
      throw new NotFoundException(`Usuário com id ${id} não encontrado`);
    }

    this.logger.log('Usuário removido com sucesso', { id });
  }

  async *exportUsers(
    query: ExportCsvQueryDto,
  ): AsyncGenerator<User, void, unknown> {
    this.logger.log('Exportando usuários para CSV', {
      createdFrom: query.created_from,
      createdTo: query.created_to,
    });

    yield* this.userRepository.findAllForExport({
      createdFrom: query.created_from,
      createdTo: query.created_to,
    });
  }

  async *exportUsersCsv(
    query: ExportCsvQueryDto,
  ): AsyncGenerator<string, void, unknown> {
    this.logger.log('Exportando usuários para CSV', {
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

  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
