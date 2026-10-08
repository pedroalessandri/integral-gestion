import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { SetObjectiveIndicatorWeightsDto as SetObjectiveIndicatorWeightsContract } from '@gestion-publica/shared-types/metrics';

export class IndicatorWeightDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  /** Entero 0..10000, o `null` para dejar al hermano sin peso. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp!: number | null;
}

/** Reemplazo atómico de los pesos de todo el grupo de indicadores del objetivo (RN-P6/P7). */
export class SetObjectiveIndicatorWeightsDto implements SetObjectiveIndicatorWeightsContract {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IndicatorWeightDto)
  weights!: IndicatorWeightDto[];
}
