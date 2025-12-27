import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Unique user name',
    example: 'john_doe',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'userName must be a string' })
  @MaxLength(50, { message: 'userName must have at most 50 characters' })
  userName?: string;

  @ApiPropertyOptional({
    description: 'User email',
    example: 'john@example.com',
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email' })
  @MaxLength(255, { message: 'email must have at most 255 characters' })
  email?: string;
}
