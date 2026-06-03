import type { PermissionDto } from './permission.dto.js';

export interface RoleDto {
  id: string;
  /** e.g. 'org-admin', 'org-user'. See RoleKey for the MVP set. */
  key: string;
  name: string;
  description: string | null;
}

export interface RoleDetailDto extends RoleDto {
  permissions: PermissionDto[];
  /** ISO-8601 UTC. */
  createdAt: string;
}
