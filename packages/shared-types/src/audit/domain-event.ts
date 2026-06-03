/**
 * Discriminated union of all domain events emitted by the system.
 *
 * Total variants: 29 (18 core + 11 okr) per ADR 0002 and ADR 0001 audit event tables.
 * Discriminator: `action` (globally unique per entity+verb convention).
 *
 * Additional export `DomainEventAction = DomainEvent['action']` is provided for ergonomics
 * (e.g., typed switch cases). This is additive beyond what the ADRs specify explicitly.
 *
 * Per ADR 0003 D3.
 */

// BaseEvent pattern (ADR 0003 D3):
// actor_id, organization_id, request_id, occurred_at are injected by the emitter,
// NOT provided by the caller.
interface BaseEvent<TAction extends string, TEntityType extends string, TDiff> {
  action: TAction;
  entityType: TEntityType;
  entityId: string;
  diff: TDiff;
}

// ---------------------------------------------------------------------------
// Core events (ADR 0002)
// ---------------------------------------------------------------------------

type OrganizationCreatedEvent = BaseEvent<
  'organization.created',
  'core.organization',
  { before: null; after: { slug: string; name: string; status: 'active' } }
>;

type OrganizationUpdatedEvent = BaseEvent<
  'organization.updated',
  'core.organization',
  {
    before: { name: string; mission?: string | null; vision?: string | null; values?: string | null; context?: string | null };
    after: { name: string; mission?: string | null; vision?: string | null; values?: string | null; context?: string | null };
  }
>;

type OrganizationActivatedEvent = BaseEvent<
  'organization.activated',
  'core.organization',
  { before: { status: 'inactive' }; after: { status: 'active' } }
>;

type OrganizationDeactivatedEvent = BaseEvent<
  'organization.deactivated',
  'core.organization',
  {
    before: { status: 'active' };
    after: { status: 'inactive'; deactivatedAt: string; reason?: string };
  }
>;

type PeriodCreatedEvent = BaseEvent<
  'period.created',
  'core.period',
  {
    before: null;
    after: { code: string; status: 'future' | 'open'; startsAt: string; endsAt: string };
  }
>;

type PeriodOpenedEvent = BaseEvent<
  'period.opened',
  'core.period',
  { before: { status: 'future' }; after: { status: 'open' } }
>;

type PeriodClosedEvent = BaseEvent<
  'period.closed',
  'core.period',
  {
    before: { status: 'open' };
    after: { status: 'closed'; closedAt: string; closedByUserId: string; endsAt?: string };
  }
>;

type PeriodAutoClosedEvent = BaseEvent<
  'period.auto_closed',
  'core.period',
  {
    before: { status: 'open' };
    after: { status: 'closed'; closedAt: string; closedByUserId: 'system' };
  }
>;

type PeriodDeletedEvent = BaseEvent<
  'period.deleted',
  'core.period',
  {
    before: { deletedAt: null };
    after: {
      deletedAt: string;
      objectivesDeleted: number;
      keyResultsDeleted: number;
      tasksDeleted: number;
    };
  }
>;

type UserCreatedEvent = BaseEvent<
  'user.created',
  'core.user',
  { before: null; after: { auth0Sub: string; email: string; displayName: string } }
>;

type UserUpdatedEvent = BaseEvent<
  'user.updated',
  'core.user',
  {
    before: Partial<{ email: string; displayName: string }>;
    after: Partial<{ email: string; displayName: string }>;
  }
>;

type UserSuperadminGrantedEvent = BaseEvent<
  'user.superadmin_granted',
  'core.user',
  {
    before: { isSuperadmin: false };
    after: { isSuperadmin: true };
    reason: 'bootstrap' | 'manual';
  }
>;

type UserSuperadminRevokedEvent = BaseEvent<
  'user.superadmin_revoked',
  'core.user',
  { before: { isSuperadmin: true }; after: { isSuperadmin: false } }
>;

type UserOrganizationRoleAssignedEvent = BaseEvent<
  'user_organization_role.assigned',
  'core.user_organization_role',
  { before: null; after: { roleId: string; roleKey: string } }
>;

type UserOrganizationRoleChangedEvent = BaseEvent<
  'user_organization_role.role_changed',
  'core.user_organization_role',
  { before: { roleId: string; roleKey: string }; after: { roleId: string; roleKey: string } }
>;

type UserOrganizationRoleRemovedEvent = BaseEvent<
  'user_organization_role.removed',
  'core.user_organization_role',
  { before: { roleId: string }; after: null }
>;

type OrganizationModuleEnabledEvent = BaseEvent<
  'organization_module.enabled',
  'core.organization_module',
  { before: null; after: { enabledAt: string; enabledByUserId: string } }
>;

type OrganizationModuleDisabledEvent = BaseEvent<
  'organization_module.disabled',
  'core.organization_module',
  { before: { disabledAt: null }; after: { disabledAt: string; disabledByUserId: string } }
>;

// ---------------------------------------------------------------------------
// OKR events (ADR 0001)
// ---------------------------------------------------------------------------

type ObjectiveCreatedEvent = BaseEvent<
  'objective.created',
  'okr.objective',
  { before: null; after: { title: string; description: string | null; periodId: string; ownerUserId: string | null } }
>;

type ObjectiveUpdatedEvent = BaseEvent<
  'objective.updated',
  'okr.objective',
  {
    before: Partial<{ title: string; description: string | null }>;
    after: Partial<{ title: string; description: string | null }>;
  }
>;

type ObjectiveDeletedEvent = BaseEvent<
  'objective.deleted',
  'okr.objective',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

type ObjectiveRebalancedEvent = BaseEvent<
  'objective.rebalanced',
  'okr.objective',
  {
    before: { weights: Array<{ krId: string; weightBp: number }> };
    after: { weights: Array<{ krId: string; weightBp: number }> };
  }
>;

type ObjectiveOwnerAssignedEvent = BaseEvent<
  'objective.owner_assigned',
  'okr.objective',
  { before: { ownerUserId: null }; after: { ownerUserId: string } }
>;

type ObjectiveOwnerChangedEvent = BaseEvent<
  'objective.owner_changed',
  'okr.objective',
  { before: { ownerUserId: string }; after: { ownerUserId: string } }
>;

type ObjectiveOwnerUnassignedEvent = BaseEvent<
  'objective.owner_unassigned',
  'okr.objective',
  { before: { ownerUserId: string }; after: { ownerUserId: null } }
>;

type KeyResultCreatedEvent = BaseEvent<
  'key_result.created',
  'okr.key_result',
  {
    before: null;
    after: {
      objectiveId: string;
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
    };
  }
>;

type KeyResultUpdatedEvent = BaseEvent<
  'key_result.updated',
  'okr.key_result',
  {
    before: Partial<{
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
    }>;
    after: Partial<{
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
    }>;
  }
>;

type KeyResultDeletedEvent = BaseEvent<
  'key_result.deleted',
  'okr.key_result',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

type TaskCreatedEvent = BaseEvent<
  'task.created',
  'okr.task',
  {
    before: null;
    after: {
      keyResultId: string;
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
      progressBp: number;
      /** ISO-8601 UTC. */
      startsAt: string;
      /** ISO-8601 UTC. */
      endsAt: string;
    };
  }
>;

type TaskUpdatedEvent = BaseEvent<
  'task.updated',
  'okr.task',
  {
    before: Partial<{
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
      /** ISO-8601 UTC. */
      startsAt: string;
      /** ISO-8601 UTC. */
      endsAt: string;
    }>;
    after: Partial<{
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number;
      /** ISO-8601 UTC. */
      startsAt: string;
      /** ISO-8601 UTC. */
      endsAt: string;
    }>;
  }
>;

type TaskDeletedEvent = BaseEvent<
  'task.deleted',
  'okr.task',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

type TaskProgressUpdatedEvent = BaseEvent<
  'task.progress.updated',
  'okr.task',
  { before: { progressBp: number }; after: { progressBp: number } }
>;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type DomainEvent =
  // Core — organization (4)
  | OrganizationCreatedEvent
  | OrganizationUpdatedEvent
  | OrganizationActivatedEvent
  | OrganizationDeactivatedEvent
  // Core — period (5)
  | PeriodCreatedEvent
  | PeriodOpenedEvent
  | PeriodClosedEvent
  | PeriodAutoClosedEvent
  | PeriodDeletedEvent
  // Core — user (4)
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserSuperadminGrantedEvent
  | UserSuperadminRevokedEvent
  // Core — user_organization_role (3)
  | UserOrganizationRoleAssignedEvent
  | UserOrganizationRoleChangedEvent
  | UserOrganizationRoleRemovedEvent
  // Core — organization_module (2)
  | OrganizationModuleEnabledEvent
  | OrganizationModuleDisabledEvent
  // OKR — objective (7)
  | ObjectiveCreatedEvent
  | ObjectiveUpdatedEvent
  | ObjectiveDeletedEvent
  | ObjectiveRebalancedEvent
  | ObjectiveOwnerAssignedEvent
  | ObjectiveOwnerChangedEvent
  | ObjectiveOwnerUnassignedEvent
  // OKR — key_result (3)
  | KeyResultCreatedEvent
  | KeyResultUpdatedEvent
  | KeyResultDeletedEvent
  // OKR — task (4)
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskProgressUpdatedEvent;

/**
 * Union of all valid action strings. Useful for typed switch statements.
 * Additive ergonomics helper beyond ADR spec.
 */
export type DomainEventAction = DomainEvent['action'];
