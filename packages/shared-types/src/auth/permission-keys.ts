/**
 * Definitive catalog of permission keys in the system per ADR 0004 D7.
 * Kept in sync with the auth.permission seed.
 */
export type PermissionKey =
  | 'okr:read'
  | 'okr:write'
  | 'okr:progress:write'
  | 'okr:admin'
  | 'core:org:manage'
  | 'core:period:manage'
  | 'core:member:manage'
  | 'core:module:manage'
  | 'core:user:read'
  | 'audit:read'
  | 'audit:read:all'
  // AI copilot permissions (ADR-0005)
  | 'ai:use'
  | 'ai:admin';

/**
 * Definitive catalog of role keys per ADR 0004 D7.
 * 'external-auditor' is declared but not assigned in MVP (reserved for future audit:read:all holder).
 */
export type RoleKey =
  | 'org-reader'
  | 'org-user'
  | 'org-admin'
  | 'external-auditor';
