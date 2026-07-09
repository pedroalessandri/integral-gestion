import type { ProgressStatus } from './key-result.dto.js';
import type { TaskStatus } from './task.dto.js';
import type { MetricKrLinkDto } from '../metrics/metric-link.dto.js';

/** Minimal period info embedded in Objective responses for read-only mode determination. */
export interface PeriodStatusDto {
  id: string;
  code: string;
  status: 'open' | 'closed' | 'future';
  /** ISO-8601 UTC. Included in cascade and detail responses. */
  startsAt?: string;
  /** ISO-8601 UTC. Included in cascade and detail responses. */
  endsAt?: string;
}

/**
 * Response body for `GET /api/v1/okr/objectives` (list) and
 * `GET /api/v1/okr/objectives/:id` (detail — via ObjectiveDetailDto).
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface ObjectiveSummaryDto {
  id: string;
  title: string;
  /** Period code in format "YYYY-Qn". */
  periodCode: string;
  /** Cached cascade progress in basis points. Integer 0..10000. */
  progressCachedBp: number;
  /** Derived at read time — never persisted. */
  status: ProgressStatus;
  /** RN-31: true if the Objective has at least one active KR. */
  hasActiveKeyResults: boolean;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  /** Period status, used by UI to determine read-only mode. */
  period: PeriodStatusDto;
  /**
   * Derived at read time from min(kr.startsAt) across non-deleted KRs.
   * startsAt of a KR is itself derived from min(task.startsAt).
   * Null when the Objective has no KRs with tasks.
   */
  startsAt: string | null;
  /**
   * Derived at read time from max(kr.endsAt) across non-deleted KRs.
   * endsAt of a KR is itself derived from max(task.endsAt).
   * Null when the Objective has no KRs with tasks.
   */
  endsAt: string | null;
  /** Assigned owner of this Objective. Null when unassigned. */
  owner: OwnerSummaryDto | null;
}

/**
 * Response body for `GET /api/v1/okr/objectives/:id`, `POST /api/v1/okr/objectives`,
 * and `PATCH /api/v1/okr/objectives/:id`.
 * Extends the summary with description and scoping fields.
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface ObjectiveDetailDto extends ObjectiveSummaryDto {
  description: string | null;
  organizationId: string;
  periodId: string;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
}

/** Minimal owner shape for cascade nodes. */
export interface OwnerInCascadeDto {
  id: string;
  displayName: string;
}

/** Full owner shape for Objective summary/detail responses. */
export interface OwnerSummaryDto {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Leaf node inside the cascade tree returned by `GET /api/v1/okr/objectives/:id/cascade`.
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface TaskInCascadeDto {
  id: string;
  title: string;
  description: string | null;
  /** Weight in basis points within parent KR. Integer 0..10000. RN-04/RN-05. */
  weightBp: number;
  /** Current progress in basis points. Integer 0..10000. RN-06. */
  progressBp: number;
  /** ISO-8601 UTC. Scheduled start date. */
  startsAt: string;
  /** ISO-8601 UTC. Scheduled end date. */
  endsAt: string;
  /** Derived at read time — never persisted. */
  status: TaskStatus;
  owner: OwnerInCascadeDto | null;
}

/**
 * Intermediate node inside the cascade tree returned by
 * `GET /api/v1/okr/objectives/:id/cascade`. Carries cached progress and active-task flag.
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface KeyResultInCascadeDto {
  id: string;
  title: string;
  description: string | null;
  /** Weight in basis points within parent Objective. Integer 0..10000. RN-04/RN-05. */
  weightBp: number;
  /** Cached cascade progress in basis points. Integer 0..10000. */
  progressCachedBp: number;
  /** Derived at read time — never persisted. */
  status: ProgressStatus;
  /** Flag for "no tasks" vs "0% with tasks" (US-12, edge case 2). */
  hasActiveTasks: boolean;
  owner: OwnerInCascadeDto | null;
  tasks: TaskInCascadeDto[];
  /**
   * Derived at read time from min(task.startsAt) of active tasks.
   * Null when the KR has no active tasks.
   */
  startsAt: string | null;
  /**
   * Derived at read time from max(task.endsAt) of active tasks.
   * Null when the KR has no active tasks.
   */
  endsAt: string | null;
  /**
   * True when active task weights do not sum to exactly 10000 bp.
   * Used to render the per-KR imbalance indicator.
   */
  tasksImbalanced: boolean;
  /**
   * Progress mode (M2). 'manual' → % derives from tasks; 'automatic' → % comes
   * solely from the linked indicator (RN-O1/RN-O4).
   */
  progressMode: 'manual' | 'automatic';
  /**
   * Embedded metric link when progressMode === 'automatic' (Pantalla 3 without
   * an extra fetch). Null for manual KRs. docs/features/indicadores-okr.md §5.
   */
  metricLink: MetricKrLinkDto | null;
}

/**
 * Response body for `GET /api/v1/okr/objectives/:id/cascade` — the main visualization
 * endpoint (US-11, CU-05). Returns the full Objective → KRs → Tasks tree with denormalized
 * `progressCachedBp` at the KR level plus the `planIncomplete` flag (RN-31).
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface ObjectiveCascadeDto {
  objective: ObjectiveDetailDto;
  keyResults: KeyResultInCascadeDto[];
  /** RN-31: true if no active KRs OR any KR has no active tasks. */
  planIncomplete: boolean;
  /**
   * Count of KRs whose active task weights do not sum to exactly 10000 bp.
   * 0 when all KRs are balanced (no warning shown).
   */
  imbalancedKrCount: number;
}
