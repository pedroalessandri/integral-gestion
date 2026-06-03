/**
 * Request-scoped authentication context.
 *
 * Populated in two passes:
 *  - AuthGuard (global APP_GUARD): userId, auth0Sub, email, displayName, isSuperadmin, requestId.
 *    organizationId = null, permissions = [] after this pass.
 *  - TenantGuard (per-controller): organizationId + permissions[] resolved for (userId, organizationId).
 *
 * Readonly after TenantGuard returns. Do not mutate in services.
 *
 * Per ADR 0004 D2.
 */
export interface AuthContext {
  /** core.user.id */
  userId: string;
  /** JWT 'sub' claim, for debugging / correlation with Auth0. */
  auth0Sub: string;
  /** Cached from last UserSyncService upsert. */
  email: string;
  /** Cached from last UserSyncService upsert. */
  displayName: string;
  /** core.user.is_superadmin. */
  isSuperadmin: boolean;
  /** Null if endpoint is cross-tenant (e.g., /me) or user did not pick an org. */
  organizationId: string | null;
  /**
   * Permissions resolved for (userId, organizationId) via user_organization_role → role → role_permission → permission.
   * Superadmin carries the sentinel ['*'] (see ALL_PERMISSIONS). See hasPermission helper.
   */
  permissions: readonly string[];
  /** Copied from RequestContextStorage for convenience; that storage remains the source of truth. */
  requestId: string;
}
