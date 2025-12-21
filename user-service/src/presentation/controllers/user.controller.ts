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
import type { FastifyReply } from 'fastify';
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
import { UserService } from '../../application/services';
import {
  CreateUserDto,
  UpdateUserDto,
  PaginationDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
  ExportCsvQueryDto,
} from '../../application/dtos';

@Controller('users')
@ApiTags('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista usuários com paginação' })
  @ApiOkResponse({
    description: 'Lista de usuários retornada com sucesso',
    type: PaginatedUsersResponseDto,
  })
  async findAll(
    @Query() query: PaginationDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.userService.findAll(query);
  }

  @Get('export/csv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporta usuários em formato CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Arquivo CSV com usuários',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  async exportCsv(
    @Query() query: ExportCsvQueryDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
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
  @ApiOperation({ summary: 'Busca usuário por userName' })
  @ApiParam({
    name: 'user_name',
    description: 'Nome de usuário',
    example: 'john_doe',
  })
  @ApiOkResponse({
    description: 'Usuário encontrado',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async findByUserName(
    @Param('user_name') userName: string,
  ): Promise<UserResponseDto> {
    return this.userService.findByUserName(userName);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra novo usuário' })
  @ApiCreatedResponse({
    description: 'Usuário criado com sucesso',
    type: UserResponseDto,
  })
  @ApiConflictResponse({ description: 'userName já está em uso' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(dto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualiza usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário', example: 1 })
  @ApiOkResponse({
    description: 'Usuário atualizado com sucesso',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  @ApiConflictResponse({ description: 'userName já está em uso' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove usuário (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID do usuário', example: 1 })
  @ApiNoContentResponse({ description: 'Usuário removido com sucesso' })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.userService.remove(id);
  }
}
