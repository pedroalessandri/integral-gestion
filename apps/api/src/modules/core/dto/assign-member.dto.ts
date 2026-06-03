import { IsString, IsNotEmpty } from 'class-validator';

export class AssignMemberDto {
  /** User ID or email. The user must exist in core.user (must have logged in once). */
  @IsString()
  @IsNotEmpty()
  userIdOrEmail!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;
}
