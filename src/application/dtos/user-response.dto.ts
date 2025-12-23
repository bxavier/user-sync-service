import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../domain/models';

export class UserResponseDto {
  @ApiProperty({ description: 'ID do usuário', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nome de usuário', example: 'john_doe' })
  userName: string;

  @ApiProperty({ description: 'Email do usuário', example: 'john@example.com' })
  email: string;

  @ApiProperty({
    description: 'Data de criação no sistema legado',
    example: '2024-01-15T10:30:00.000Z',
    nullable: true,
  })
  legacyCreatedAt: Date | null;

  @ApiProperty({
    description: 'Data de criação',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id!;
    dto.userName = user.userName;
    dto.email = user.email;
    dto.legacyCreatedAt = user.legacyCreatedAt;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto], description: 'Lista de usuários' })
  data: UserResponseDto[];

  @ApiProperty({ description: 'Total de registros', example: 100 })
  total: number;

  @ApiProperty({ description: 'Página atual', example: 1 })
  page: number;

  @ApiProperty({ description: 'Itens por página', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total de páginas', example: 10 })
  totalPages: number;
}
