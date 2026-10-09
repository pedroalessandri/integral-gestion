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
      projectsDeleted: number;
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
  { before: null; after: { roleId: string; roleKey: string; orgUnitId?: string | null } }
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

type UserOrganizationRoleScopeChangedEvent = BaseEvent<
  'user_organization_role.scope_changed',
  'core.user_organization_role',
  { before: { orgUnitId: string | null }; after: { orgUnitId: string | null } }
>;

type OrgUnitSnapshot = {
  kind: 'central' | 'ministry' | 'area';
  name: string;
  parentId: string | null;
  vision?: string | null;
  mission?: string | null;
  order: number;
  source?: string;
};

type OrgUnitCreatedEvent = BaseEvent<'org_unit.created', 'core.org_unit', { before: null; after: OrgUnitSnapshot }>;

type OrgUnitUpdatedEvent = BaseEvent<
  'org_unit.updated',
  'core.org_unit',
  { before: OrgUnitSnapshot; after: OrgUnitSnapshot }
>;

type OrgUnitDeletedEvent = BaseEvent<
  'org_unit.deleted',
  'core.org_unit',
  { before: OrgUnitSnapshot; after: { deletedAt: string } }
>;

// Planning — strategic_plan y axis (ADR-0009)
type StrategicPlanSnapshot = {
  title: string;
  vision: string;
  mandateStartsAt: string;
  mandateEndsAt: string;
  status: 'active' | 'archived';
};

type StrategicPlanCreatedEvent = BaseEvent<
  'strategic_plan.created',
  'planning.strategic_plan',
  { before: null; after: StrategicPlanSnapshot }
>;

type StrategicPlanUpdatedEvent = BaseEvent<
  'strategic_plan.updated',
  'planning.strategic_plan',
  { before: Partial<StrategicPlanSnapshot>; after: Partial<StrategicPlanSnapshot> }
>;

type AxisSnapshot = { strategicPlanId: string; name: string; description: string | null; order: number };

type AxisCreatedEvent = BaseEvent<'axis.created', 'planning.axis', { before: null; after: AxisSnapshot }>;

type AxisUpdatedEvent = BaseEvent<
  'axis.updated',
  'planning.axis',
  { before: Partial<AxisSnapshot>; after: Partial<AxisSnapshot> }
>;

type AxisDeletedEvent = BaseEvent<
  'axis.deleted',
  'planning.axis',
  { before: AxisSnapshot; after: { deletedAt: string; unassignedObjectiveIds: string[] } }
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
  {
    before: null;
    after: {
      title: string;
      description: string | null;
      periodId: string;
      ownerUserId: string | null;
      orgUnitId?: string | null;
      axisId?: string | null;
    };
  }
>;

type ObjectiveUpdatedEvent = BaseEvent<
  'objective.updated',
  'okr.objective',
  {
    before: Partial<{ title: string; description: string | null; orgUnitId: string | null; axisId: string | null }>;
    after: Partial<{ title: string; description: string | null; orgUnitId: string | null; axisId: string | null }>;
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

type TaskCreatedEvent = BaseEvent<
  'task.created',
  'okr.task',
  {
    before: null;
    after: {
      /** Proyecto (N5). */
      projectId?: string | null;
      title: string;
      description: string | null;
      ownerUserId: string | null;
      /** `null` si el grupo no pondera (RN-P6). */
      weightBp: number | null;
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
      weightBp: number | null;
      /** ISO-8601 UTC. */
      startsAt: string;
      /** ISO-8601 UTC. */
      endsAt: string;
    }>;
    after: Partial<{
      title: string;
      description: string | null;
      ownerUserId: string | null;
      weightBp: number | null;
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

type ProjectSnapshot = {
  objectiveId: string;
  orgUnitId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  /** `null` si el grupo de proyectos no pondera (RN-P6). */
  weightBp: number | null;
  /** ISO-8601 UTC. */
  startsAt: string;
  /** ISO-8601 UTC. */
  endsAt: string;
  progressMode: 'from_tasks' | 'from_indicator';
};

type ProjectCreatedEvent = BaseEvent<'project.created', 'okr.project', { before: null; after: ProjectSnapshot }>;

type ProjectUpdatedEvent = BaseEvent<
  'project.updated',
  'okr.project',
  { before: Partial<ProjectSnapshot>; after: Partial<ProjectSnapshot> }
>;

type ProjectDeletedEvent = BaseEvent<
  'project.deleted',
  'okr.project',
  { before: { deletedAt: null }; after: { deletedAt: string; deletedTaskIds: string[] } }
>;

type ObjectiveResultProgressChangedEvent = BaseEvent<
  'objective.result_progress_changed',
  'okr.objective',
  { before: { resultProgressCachedBp: number }; after: { resultProgressCachedBp: number } }
>;

type ObjectiveIndicatorSnapshot = {
  objectiveId: string;
  metricId: string;
  /** Decimal string. */
  baselineValue: string;
  /** Decimal string. */
  targetValue: string;
  direction: 'increasing' | 'decreasing';
  /** `null` si el grupo de indicadores no pondera (RN-P6). */
  weightBp: number | null;
  linkMode: 'independent' | 'execution_feeds_indicator' | 'indicator_feeds_execution';
  expectedCurveMode: 'linear' | 'manual' | 'from_projects';
};

/** Punto de la curva esperada manual (RN-P17). */
type IndicatorTargetPointSnapshot = {
  /** YYYY-MM-DD (UTC). */
  bucketDate: string;
  /** Decimal string. */
  expectedValue: string;
};

type ObjectiveIndicatorCreatedEvent = BaseEvent<
  'objective_indicator.created',
  'metrics.objective_indicator',
  { before: null; after: ObjectiveIndicatorSnapshot }
>;

type ObjectiveIndicatorUpdatedEvent = BaseEvent<
  'objective_indicator.updated',
  'metrics.objective_indicator',
  { before: Partial<ObjectiveIndicatorSnapshot>; after: Partial<ObjectiveIndicatorSnapshot> }
>;

/** Reemplazo en bloque de los puntos de la curva manual: before/after con la lista completa. */
type IndicatorTargetPointsReplacedEvent = BaseEvent<
  'indicator_target_points.replaced',
  'metrics.objective_indicator',
  { before: { points: IndicatorTargetPointSnapshot[] }; after: { points: IndicatorTargetPointSnapshot[] } }
>;

type ObjectiveIndicatorDeletedEvent = BaseEvent<
  'objective_indicator.deleted',
  'metrics.objective_indicator',
  { before: { deletedAt: null }; after: { deletedAt: string } }
>;

/** Aporte de un proyecto a un indicador (RN-P12/P13). */
type ProjectContributionSnapshot = {
  projectId: string;
  objectiveIndicatorId: string;
  /** Decimal string. */
  contributionValue: string;
};

type ProjectContributionCreatedEvent = BaseEvent<
  'project_contribution.created',
  'metrics.project_contribution',
  { before: null; after: ProjectContributionSnapshot }
>;

type ProjectContributionUpdatedEvent = BaseEvent<
  'project_contribution.updated',
  'metrics.project_contribution',
  { before: { contributionValue: string }; after: { contributionValue: string } }
>;

type ProjectContributionDeletedEvent = BaseEvent<
  'project_contribution.deleted',
  'metrics.project_contribution',
  { before: ProjectContributionSnapshot; after: null; reason?: 'project_deleted' }
>;

/** El proyecto llegó al 100 %: se creó la carga automática positiva (RN-P13). */
type ProjectContributionAppliedEvent = BaseEvent<
  'project_contribution.applied',
  'metrics.project_contribution',
  {
    before: { appliedEntryId: null };
    after: { appliedEntryId: string; projectId: string; incrementValue: string; bucketDate: string };
  }
>;

/** El proyecto bajó del 100 % (o se borró): se creó una carga compensatoria negativa; la original no se toca. */
type ProjectContributionRevertedEvent = BaseEvent<
  'project_contribution.reverted',
  'metrics.project_contribution',
  {
    before: { appliedEntryId: string | null };
    after: {
      appliedEntryId: null;
      compensationEntryId: string | null;
      incrementValue: string | null;
      bucketDate: string | null;
      reason: string;
    };
  }
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
      kind: string;
      source: string | null;
      description: string | null;
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
    before: Partial<{
      name: string;
      kind: string;
      source: string | null;
      description: string | null;
      baselineValue: string;
      targetValue: string;
    }>;
    after: Partial<{
      name: string;
      kind: string;
      source: string | null;
      description: string | null;
      baselineValue: string;
      targetValue: string;
    }>;
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
    after: {
      metricId: string;
      bucketDate: string;
      incrementValue: string;
      comment: string | null;
      /** Solo en las cargas automáticas de un aporte de proyecto (RN-P14); ausente = manual. */
      origin?: 'manual' | 'project_contribution';
      sourceProjectId?: string;
    };
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
// Metrics ↔ OKR events (Módulo 2 "Indicadores de contexto en objetivos")
// docs/features/indicadores-okr.md §5
// ---------------------------------------------------------------------------

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
  | UserOrganizationRoleScopeChangedEvent
  // Core — org_unit (3)
  | OrgUnitCreatedEvent
  | OrgUnitUpdatedEvent
  | OrgUnitDeletedEvent
  // Planning — strategic_plan (2) y axis (3)
  | StrategicPlanCreatedEvent
  | StrategicPlanUpdatedEvent
  | AxisCreatedEvent
  | AxisUpdatedEvent
  | AxisDeletedEvent
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
  // OKR — task (4)
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskProgressUpdatedEvent
  // OKR — project (3)
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | ObjectiveResultProgressChangedEvent
  | ObjectiveIndicatorCreatedEvent
  | ObjectiveIndicatorUpdatedEvent
  | ObjectiveIndicatorDeletedEvent
  | ProjectContributionCreatedEvent
  | ProjectContributionUpdatedEvent
  | ProjectContributionDeletedEvent
  | ProjectContributionAppliedEvent
  | ProjectContributionRevertedEvent
  | IndicatorTargetPointsReplacedEvent
  // Metrics — metric (3)
  | MetricCreatedEvent
  | MetricUpdatedEvent
  | MetricDeletedEvent
  // Metrics — metric_entry (3)
  | MetricEntryCreatedEvent
  | MetricEntryUpdatedEvent
  | MetricEntryDeletedEvent
  // Metrics ↔ OKR — M2 (6)
  | MetricObjectiveContextLinkedEvent
  | MetricObjectiveContextUnlinkedEvent;

/**
 * Union of all valid action strings. Useful for typed switch statements.
 * Additive ergonomics helper beyond ADR spec.
 */
export type DomainEventAction = DomainEvent['action'];
