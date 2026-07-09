/**
 * Discriminated union of all domain events emitted by the system.
 *
 * Total variants: 41 (18 core + 11 okr + 6 metrics + 6 metrics↔okr) per ADR 0002,
 * ADR 0001 and the indicadores docs (docs/features/indicadores-*.md).
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
// Metrics events (Módulo 1 "Indicadores de gestión")
// ---------------------------------------------------------------------------

type MetricCreatedEvent = BaseEvent<
  'metric.created',
  'metrics.metric',
  {
    before: null;
    after: {
      name: string;
      unit: string;
      direction: string;
      frequency: string;
      baselineValue: string;
      targetValue: string;
      periodId: string;
    };
  }
>;

type MetricUpdatedEvent = BaseEvent<
  'metric.updated',
  'metrics.metric',
  {
    before: Partial<{ name: string; baselineValue: string; targetValue: string }>;
    after: Partial<{ name: string; baselineValue: string; targetValue: string }>;
  }
>;

type MetricDeletedEvent = BaseEvent<
  'metric.deleted',
  'metrics.metric',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

type MetricEntryCreatedEvent = BaseEvent<
  'metric.entry.created',
  'metrics.metric_entry',
  {
    before: null;
    after: { metricId: string; bucketDate: string; incrementValue: string; comment: string | null };
  }
>;

type MetricEntryUpdatedEvent = BaseEvent<
  'metric.entry.updated',
  'metrics.metric_entry',
  {
    before: Partial<{ incrementValue: string; comment: string | null }>;
    after: Partial<{ incrementValue: string; comment: string | null }>;
  }
>;

type MetricEntryDeletedEvent = BaseEvent<
  'metric.entry.deleted',
  'metrics.metric_entry',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

// ---------------------------------------------------------------------------
// Metrics ↔ OKR events (Módulo 2 "Indicadores en OKRs")
// docs/features/indicadores-okr.md §5
// ---------------------------------------------------------------------------

type KrMetricLinkedEvent = BaseEvent<
  'kr.metric_linked',
  'okr.key_result',
  {
    before: null;
    after: {
      metricId: string;
      baselineValue: string;
      targetValue: string;
      direction: string;
    };
  }
>;

type KrMetricLinkUpdatedEvent = BaseEvent<
  'kr.metric_link_updated',
  'okr.key_result',
  {
    before: Partial<{ baselineValue: string; targetValue: string }>;
    after: Partial<{ baselineValue: string; targetValue: string }>;
  }
>;

/** Unlink is a hard delete audited with the full snapshot (D-O3). */
type KrMetricUnlinkedEvent = BaseEvent<
  'kr.metric_unlinked',
  'okr.key_result',
  {
    before: {
      metricId: string;
      baselineValue: string;
      targetValue: string;
      direction: string;
    };
    after: null;
  }
>;

type KrProgressRecomputedFromMetricEvent = BaseEvent<
  'kr.progress_recomputed_from_metric',
  'okr.key_result',
  { before: { progressCachedBp: number }; after: { progressCachedBp: number } }
>;

type MetricObjectiveContextLinkedEvent = BaseEvent<
  'metric_objective_context.linked',
  'metrics.metric_objective_context',
  { before: null; after: { metricId: string; objectiveId: string } }
>;

type MetricObjectiveContextUnlinkedEvent = BaseEvent<
  'metric_objective_context.unlinked',
  'metrics.metric_objective_context',
  { before: { metricId: string; objectiveId: string }; after: null }
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
  | TaskProgressUpdatedEvent
  // Metrics — metric (3)
  | MetricCreatedEvent
  | MetricUpdatedEvent
  | MetricDeletedEvent
  // Metrics — metric_entry (3)
  | MetricEntryCreatedEvent
  | MetricEntryUpdatedEvent
  | MetricEntryDeletedEvent
  // Metrics ↔ OKR — M2 (6)
  | KrMetricLinkedEvent
  | KrMetricLinkUpdatedEvent
  | KrMetricUnlinkedEvent
  | KrProgressRecomputedFromMetricEvent
  | MetricObjectiveContextLinkedEvent
  | MetricObjectiveContextUnlinkedEvent;

/**
 * Union of all valid action strings. Useful for typed switch statements.
 * Additive ergonomics helper beyond ADR spec.
 */
export type DomainEventAction = DomainEvent['action'];
