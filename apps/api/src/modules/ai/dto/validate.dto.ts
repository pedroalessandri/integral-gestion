import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateDto {
  /** El copiloto solo asiste sobre objetivos (ADR-0009 D9). */
  @IsIn(['objective'])
  entityType!: 'objective';

  @IsString()
  @MinLength(10, { message: 'El texto a validar debe tener al menos 10 caracteres.' })
  @MaxLength(2000)
  text!: string;
}
