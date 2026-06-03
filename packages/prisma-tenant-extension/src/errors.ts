/**
 * Thrown when a Prisma query targets a tenant-scoped model but no
 * `organizationId` is available in the current ALS context (and the caller
 * is not a superadmin).
 *
 * **Semantics**: this is a **programmer error / wiring bug**, not a user
 * input error. The `TenantGuard` upstream should have either:
 *   (a) populated `TenantContextStorage` with a valid `organizationId`, or
 *   (b) rejected the request with a 4xx before the query reached the service.
 *
 * If this error reaches the surface, it means a controller is missing
 * `@UseGuards(TenantGuard)`, or a service is being called from a non-HTTP
 * context (e.g. a misconfigured test) without setting up the ALS.
 *
 * Per ADR 0004 D6 error registry: maps to **HTTP 500** at the controller
 * exception filter (not 401/403 — those are auth failures, this is a wiring
 * failure). Companion errors in the same family:
 *   - `NoActiveTransactionError` (ADR 0003 D1/D10)
 *   - `MissingRequestContextError` (ADR 0003)
 *   - `MissingActorError` (ADR 0004)
 */
export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation}. ` +
        `This is a wiring bug — a guard upstream should have populated the ` +
        `TenantContextStorage ALS before this query reached the extension.`,
    );
    this.name = 'MissingTenantContextError';
    // Maintains proper prototype chain for `instanceof` checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
