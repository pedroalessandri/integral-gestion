import { IsOptional, IsString } from 'class-validator';

export class ListMembersQueryDto {
  /** Filter by role key (e.g. "org-admin", "org-user", "org-reader"). */
  @IsOptional()
  @IsString()
  roleKey?: string;

  /** @deprecated Use roleKey. Kept for backward compat. */
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
