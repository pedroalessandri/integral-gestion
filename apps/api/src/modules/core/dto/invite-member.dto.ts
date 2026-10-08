import { IsEmail, IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

const INVITABLE_ROLES = ['org-admin', 'org-user', 'org-reader'] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  roleKey!: string;

  /**
   * Alcance inicial (RN-P19/P20): obligatorio. Una unidad viva de la org o `null` = toda la org, elegido de forma
   * explícita. Si la propiedad falta, la validación falla (400): no se asume `null`.
   */
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsNotEmpty()
  orgUnitId!: string | null;
}
