import type { AuthContext } from './auth-context.js';
import type { PermissionKey } from './permission-keys.js';

/**
 * Sentinel added to AuthContext.permissions when the user is superadmin.
 * See ADR 0004 D3 for rationale (vs null, vs full catalog expansion).
 */
export const ALL_PERMISSIONS = '*' as const;

/**
 * Pure check: does this AuthContext grant the given permission?
 *
 * Returns true if the sentinel '*' is present OR the specific key is present.
 * Zero dependencies, safe to call from frontend or backend.
 */
export function hasPermission(
  ctx: Pick<AuthContext, 'permissions'>,
  key: PermissionKey,
): boolean {
  return ctx.permissions.includes(ALL_PERMISSIONS) || ctx.permissions.includes(key);
}
