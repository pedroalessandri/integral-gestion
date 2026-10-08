import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const INVITABLE_ROLES = ['org-admin', 'org-user', 'org-reader'] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  roleKey!: string;

  /** Alcance inicial (RN-P19/P20). Omitido o null = toda la org. Debe ser una unidad viva de la org. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  orgUnitId?: string | null;
}
