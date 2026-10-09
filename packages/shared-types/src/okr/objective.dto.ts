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
  /** Descripción del objetivo; `null` si no tiene. */
  description: string | null;
  /** Código (label libre) del período. */
  periodCode: string;
  /** Avance de resultado (desde indicadores, RN-P8). Integer 0..10000. Nunca se combina con el de gestión. */
  resultProgressCachedBp: number;
  /** Avance de gestión (desde proyectos, RN-P8). Integer 0..10000. Nunca se combina con el de resultado. */
  executionProgressCachedBp: number;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  /** Period status, used by UI to determine read-only mode. */
  period: PeriodStatusDto;
  /** Derivado al leer: mínimo de `startsAt` de los proyectos vivos. Null si el objetivo no tiene proyectos. */
  startsAt: string | null;
  /** Derivado al leer: máximo de `endsAt` de los proyectos vivos. Null si el objetivo no tiene proyectos. */
  endsAt: string | null;
  /** Assigned owner of this Objective. Null when unassigned. */
  owner: OwnerSummaryDto | null;
  /** Unidad (ministry | area, RN-P3). */
  orgUnitId: string;
  /** Eje (N2) del plan activo. Null si el objetivo no tiene eje (RN-P2). */
  axisId: string | null;
}

/**
 * Response body for `GET /api/v1/okr/objectives/:id`, `POST /api/v1/okr/objectives`,
 * and `PATCH /api/v1/okr/objectives/:id`.
 * Extends the summary with description and scoping fields.
 * Shape per ADR 0001 "Shape de los DTOs principales".
 */
export interface ObjectiveDetailDto extends ObjectiveSummaryDto {
  organizationId: string;
  periodId: string;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
}

/** Full owner shape for Objective summary/detail responses. */
export interface OwnerSummaryDto {
  id: string;
  displayName: string;
  email: string;
}
