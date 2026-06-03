/**
 * Declarative set of Prisma model names that require automatic tenant scoping.
 *
 * A model is in this set if ALL of the following are true:
 *   1. It has a required (non-nullable) `organizationId` column.
 *   2. Rows from different organizations must never be visible to each other.
 *   3. Its `organizationId` is an invariant — it cannot change after creation.
 *
 * Per ADR 0004 D6: this set is maintained manually (not auto-detected via DMMF)
 * because some models have a nullable `organization_id` by design (e.g.
 * `audit.event`), and the decision to scope a model is semantic, not syntactic.
 * When a future ADR adds a new model with `organizationId`, edit this set explicitly.
 *
 * Models NOT in this set (with rationale):
 *   - `Organization`  — IS the tenant root; scoping by org would be circular.
 *   - `User`          — global identity; membership is expressed via UserOrganizationRole.
 *   - `Module`        — global catalog; not per-tenant.
 *   - `Role`          — global auth catalog (auth schema), not per-org.
 *   - `Permission`    — global auth catalog (auth schema), not per-org.
 *   - `RolePermission`— global auth catalog (auth schema), not per-org.
 *   - `AuditEvent`    — audit.event has NULLABLE organization_id by ADR 0003 design;
 *                       scoping it would hide cross-tenant audit records from superadmins
 *                       and break the append-only audit contract.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  /**
   * `okr.objective` — per ADR 0001.
   * Every Objective belongs to exactly one organization and one period.
   * organizationId is required and non-mutable.
   */
  'Objective',

  /**
   * `okr.key_result` — per ADR 0001.
   * A KeyResult belongs to an Objective which belongs to one organization.
   * organizationId is denormalized onto KeyResult for query efficiency.
   */
  'KeyResult',

  /**
   * `okr.task` — per ADR 0001.
   * A Task belongs to a KeyResult. organizationId is denormalized for
   * the same reason as KeyResult.
   */
  'Task',

  /**
   * `core.period` — per ADR 0002 D6.
   * Periods are scoped to an organization (each org manages its own Q cycles).
   */
  'Period',

  /**
   * `core.user_organization_role` — per ADR 0002 D6.
   * Membership rows belong to an organization. An org admin must only see
   * memberships within their own organization.
   */
  'UserOrganizationRole',

  /**
   * `core.organization_module` — per ADR 0002 D6.
   * Module enablement flags are per-organization. An org's flags must not
   * be visible to other organizations.
   */
  'OrganizationModule',
]);
