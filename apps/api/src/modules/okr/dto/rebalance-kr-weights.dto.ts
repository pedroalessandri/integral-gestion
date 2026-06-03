import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';

export class RebalanceKrWeightsItemDto {
  @IsString()
  krId!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  weightBp!: number;
}

export class RebalanceKrWeightsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RebalanceKrWeightsItemDto)
  items!: RebalanceKrWeightsItemDto[];
}
