import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DraftDto {
  @IsIn(['objective', 'key_result'])
  entityType!: 'objective' | 'key_result';

  @IsString()
  @MinLength(5, { message: 'El pedido debe tener al menos 5 caracteres.' })
  @MaxLength(500)
  hint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  objectiveContext?: string;
}
