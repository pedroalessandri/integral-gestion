'use server';

import type { PlanningTreeDto } from '@gestion-publica/shared-types/okr';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { failure, unexpectedFailure, type ActionResult } from '@/features/planning/error-messages';

export interface PlanningTreeQuery {
  periodId: string;
  axisId?: string | null;
  orgUnitId?: string | null;
}

/** Un solo request trae el árbol completo con las dos lecturas por nodo (la API tiene rate limit). */
export async function getPlanningTreeAction(
  orgId: string,
  query: PlanningTreeQuery,
): Promise<ActionResult<PlanningTreeDto>> {
  try {
    const params = new URLSearchParams({ periodId: query.periodId });
    if (query.axisId) params.set('axisId', query.axisId);
    if (query.orgUnitId) params.set('orgUnitId', query.orgUnitId);
    const res = await apiFetch(`/api/v1/okr/planning-tree?${params.toString()}`, { orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as PlanningTreeDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}
