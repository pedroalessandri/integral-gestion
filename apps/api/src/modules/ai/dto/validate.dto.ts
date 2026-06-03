import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateDto {
  @IsIn(['objective', 'key_result'])
  entityType!: 'objective' | 'key_result';

  @IsString()
  @MinLength(10, { message: 'El texto a validar debe tener al menos 10 caracteres.' })
  @MaxLength(2000)
  text!: string;
}
