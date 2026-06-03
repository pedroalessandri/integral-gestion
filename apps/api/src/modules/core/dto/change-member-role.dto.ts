import { IsIn } from 'class-validator';

const ASSIGNABLE_ROLES = ['org-admin', 'org-user', 'org-reader'] as const;

export class ChangeMemberRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  roleKey!: string;
}
