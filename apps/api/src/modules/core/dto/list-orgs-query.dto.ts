import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListOrgsQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsString()
  search?: string;

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
