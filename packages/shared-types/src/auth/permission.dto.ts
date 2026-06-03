export interface PermissionDto {
  /** e.g. 'okr:write', 'core:period:manage'. See PermissionKey for the MVP set. */
  key: string;
  description: string;
}

export interface PermissionDetailDto extends PermissionDto {
  roles: Array<{ key: string; name: string }>;
  /** ISO-8601 UTC. */
  createdAt: string;
}
