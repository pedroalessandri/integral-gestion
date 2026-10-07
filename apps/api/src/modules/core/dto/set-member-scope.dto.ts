import { IsString, IsNotEmpty, ValidateIf } from 'class-validator';

export class SetMemberScopeBodyDto {
  /** null = alcance toda la org (unidad central, RN-P19). La propiedad debe venir explícita. */
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsNotEmpty()
  orgUnitId!: string | null;
}
