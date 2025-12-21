import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ExportCsvQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar usuários criados a partir desta data',
    example: '2024-01-01',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'created_from deve ser uma data válida' })
  created_from?: Date;

  @ApiPropertyOptional({
    description: 'Filtrar usuários criados até esta data',
    example: '2024-12-31',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'created_to deve ser uma data válida' })
  created_to?: Date;
}
