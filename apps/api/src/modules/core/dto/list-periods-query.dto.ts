import { IsOptional, IsIn, IsInt, Min, Max, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListPeriodsQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'future'])
  status?: 'open' | 'closed' | 'future';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }: { value: unknown }) => (value ? parseInt(String(value), 10) : 50))
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
