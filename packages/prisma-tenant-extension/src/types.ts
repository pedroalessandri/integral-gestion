/**
 * Contract that the caller must implement and pass to `tenantExtension()`.
 *
 * Both methods are called **lazily at query time** — they must read the
 * current AsyncLocalStorage context on every invocation, NOT capture values
 * at construction time. This is what makes the extension safe for concurrent
 * requests in a single Node.js process.
 *
 * Per ADR 0004 D6: `TenantContextProvider` is owned by `packages/prisma-tenant-extension`;
 * the concrete implementation (reading from `TenantContextStorage` ALS) lives in
 * `apps/api/src/modules/auth/`.
 */
export interface TenantContextProvider {
  /**
   * Returns the organization ID for the current request, or `null` if no
   * tenant context is active (e.g. the guard has not run yet, or the endpoint
   * is superadmin-only with no active org).
   *
   * Called lazily on every query — must reflect the ALS state at the moment
   * of the query, not at extension-construction time.
   */
  getOrganizationId(): string | null;

  /**
   * Returns `true` when the current request belongs to a superadmin, enabling
   * full bypass of tenant scoping.
   *
   * Called lazily on every query — same ALS-reading requirement as
   * `getOrganizationId()`.
   */
  isSuperadmin(): boolean;
}

/**
 * Minimal shape passed to future consumer customization hooks.
 *
 * Reserved for forward-compatibility: if a future ADR needs to let the
 * host application intercept specific model+operation combinations (e.g.
 * to emit telemetry or apply row-level policies beyond organizationId),
 * this type is the extension point. It is currently unused by the extension
 * itself and is exported for type-level consumers only.
 */
export type OperationContext = {
  /** Prisma model name, e.g. `'Objective'`, `'KeyResult'`. */
  readonly model: string;
  /** Prisma operation name, e.g. `'findMany'`, `'create'`. */
  readonly operation: string;
};
