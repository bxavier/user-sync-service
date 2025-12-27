import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ExportCsvQueryDto {
  @ApiPropertyOptional({
    description: 'Filter users created from this date',
    example: '2024-01-01',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'created_from must be a valid date' })
  created_from?: Date;

  @ApiPropertyOptional({
    description: 'Filter users created until this date',
    example: '2024-12-31',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'created_to must be a valid date' })
  created_to?: Date;
}
