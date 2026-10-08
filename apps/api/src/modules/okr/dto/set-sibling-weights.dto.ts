import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class SiblingWeightDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  /** Integer 0..10000, o `null` para dejar al hermano sin peso. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp!: number | null;
}

/**
 * Reemplazo atómico de los pesos de todo un grupo de hermanos (RN-P6/RN-P7):
 * o todos con peso y suman 10000, o todos `null`.
 */
export class SetSiblingWeightsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SiblingWeightDto)
  weights!: SiblingWeightDto[];
}
