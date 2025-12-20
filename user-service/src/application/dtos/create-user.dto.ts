import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome de usuário único',
    example: 'john_doe',
    maxLength: 50,
  })
  @IsNotEmpty({ message: 'userName é obrigatório' })
  @IsString({ message: 'userName deve ser uma string' })
  @MaxLength(50, { message: 'userName deve ter no máximo 50 caracteres' })
  userName: string;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'john@example.com',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'email é obrigatório' })
  @IsEmail({}, { message: 'email deve ser um email válido' })
  @MaxLength(255, { message: 'email deve ter no máximo 255 caracteres' })
  email: string;
}
