import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Nome de usuário único',
    example: 'john_doe',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'userName deve ser uma string' })
  @MaxLength(50, { message: 'userName deve ter no máximo 50 caracteres' })
  userName?: string;

  @ApiPropertyOptional({
    description: 'Email do usuário',
    example: 'john@example.com',
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail({}, { message: 'email deve ser um email válido' })
  @MaxLength(255, { message: 'email deve ter no máximo 255 caracteres' })
  email?: string;
}
