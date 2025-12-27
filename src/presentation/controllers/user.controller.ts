import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  CreateUserDto,
  ExportCsvQueryDto,
  PaginatedUsersResponseDto,
  PaginationDto,
  UpdateUserDto,
  UserResponseDto,
} from '@/application/dtos';
import { UserService } from '@/application/services';

@Controller('users')
@ApiTags('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List users with pagination' })
  @ApiOkResponse({
    description: 'User list returned successfully',
    type: PaginatedUsersResponseDto,
  })
  async findAll(@Query() query: PaginationDto): Promise<PaginatedUsersResponseDto> {
    return this.userService.findAll(query);
  }

  @Get('export/csv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export users in CSV format' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV file with users',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  async exportCsv(@Query() query: ExportCsvQueryDto, @Res() reply: FastifyReply): Promise<void> {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="users-${Date.now()}.csv"`,
      'Transfer-Encoding': 'chunked',
    });

    for await (const csvLine of this.userService.exportUsersCsv(query)) {
      reply.raw.write(csvLine);
    }

    reply.raw.end();
  }

  @Get(':user_name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find user by userName' })
  @ApiParam({
    name: 'user_name',
    description: 'User name',
    example: 'john_doe',
  })
  @ApiOkResponse({
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  async findByUserName(@Param('user_name') userName: string): Promise<UserResponseDto> {
    return this.userService.findByUserName(userName);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new user' })
  @ApiCreatedResponse({
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiConflictResponse({ description: 'userName is already in use' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', description: 'User ID', example: 1 })
  @ApiOkResponse({
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'userName is already in use' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user (soft delete)' })
  @ApiParam({ name: 'id', description: 'User ID', example: 1 })
  @ApiNoContentResponse({ description: 'User removed successfully' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.userService.remove(id);
  }
}
