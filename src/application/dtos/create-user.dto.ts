import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique user name',
    example: 'john_doe',
    maxLength: 50,
  })
  @IsNotEmpty({ message: 'userName is required' })
  @IsString({ message: 'userName must be a string' })
  @MaxLength(50, { message: 'userName must have at most 50 characters' })
  userName: string;

  @ApiProperty({
    description: 'User email',
    example: 'john@example.com',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'email is required' })
  @IsEmail({}, { message: 'email must be a valid email' })
  @MaxLength(255, { message: 'email must have at most 255 characters' })
  email: string;
}
