'use server';

import type { PlanningGanttDto } from '@gestion-publica/shared-types/okr';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { failure, unexpectedFailure, type ActionResult } from '@/features/planning/error-messages';

export interface PlanningGanttQuery {
  periodId: string;
  axisId?: string | null;
  orgUnitId?: string | null;
}

/** Un solo request trae objetivos, proyectos y tareas con las dos lecturas por objetivo. */
export async function getPlanningGanttAction(
  orgId: string,
  query: PlanningGanttQuery,
): Promise<ActionResult<PlanningGanttDto>> {
  try {
    const params = new URLSearchParams({ periodId: query.periodId });
    if (query.axisId) params.set('axisId', query.axisId);
    if (query.orgUnitId) params.set('orgUnitId', query.orgUnitId);
    const res = await apiFetch(`/api/v1/okr/planning-gantt?${params.toString()}`, { orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as PlanningGanttDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}
