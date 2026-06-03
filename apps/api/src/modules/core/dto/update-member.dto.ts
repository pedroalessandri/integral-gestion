import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateMemberDto {
  @IsString()
  @IsNotEmpty()
  roleId!: string;
}
