import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class DraftDto {
  /** El copiloto solo asiste sobre objetivos (ADR-0009 D9). */
  @IsIn(['objective'])
  entityType!: 'objective';

  @IsString()
  @MinLength(5, { message: 'El pedido debe tener al menos 5 caracteres.' })
  @MaxLength(500)
  hint!: string;
}
