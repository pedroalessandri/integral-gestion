import { IsEmail, IsIn } from 'class-validator';

const INVITABLE_ROLES = ['org-admin', 'org-user', 'org-reader'] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  roleKey!: string;
}
