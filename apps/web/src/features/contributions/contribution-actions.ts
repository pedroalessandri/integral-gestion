'use server';

import type {
  CreateProjectContributionDto,
  ProjectContributionDto,
  UpdateProjectContributionDto,
} from '@gestion-publica/shared-types/metrics';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { failure, unexpectedFailure, type ActionResult } from '@/features/planning/error-messages';

const OKR = '/api/v1/okr';

async function request<T>(
  orgId: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ActionResult<T>> {
  try {
    const res = await apiFetch(path, {
      orgId,
      method: init?.method,
      ...(init?.body !== undefined && { body: JSON.stringify(init.body) }),
    });
    if (!res.ok) return failure(await readApiError(res));
    if (res.status === 204) return { ok: true, data: null as T };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

async function requestItems(orgId: string, path: string): Promise<ActionResult<ProjectContributionDto[]>> {
  const result = await request<unknown>(orgId, path);
  if (!result.ok) return result;
  const body = result.data;
  const items = Array.isArray(body) ? body : ((body as { items?: unknown[] } | null)?.items ?? []);
  return { ok: true, data: items as ProjectContributionDto[] };
}

/** Aportes de un proyecto (sección "Aporta a indicador" de su ficha). */
export async function listProjectContributionsAction(orgId: string, projectId: string) {
  return requestItems(orgId, `${OKR}/projects/${projectId}/contributions`);
}

/** Aportes a un indicador: dan los pasos de la curva `from_projects` y el proyecto de origen de las cargas automáticas. */
export async function listIndicatorContributionsAction(orgId: string, indicatorId: string) {
  return requestItems(orgId, `${OKR}/indicators/${indicatorId}/contributions`);
}

export async function createContributionAction(orgId: string, indicatorId: string, input: CreateProjectContributionDto) {
  return request<ProjectContributionDto>(orgId, `${OKR}/indicators/${indicatorId}/contributions`, {
    method: 'POST',
    body: input,
  });
}

export async function updateContributionAction(orgId: string, id: string, input: UpdateProjectContributionDto) {
  return request<ProjectContributionDto>(orgId, `${OKR}/contributions/${id}`, { method: 'PATCH', body: input });
}

export async function deleteContributionAction(orgId: string, id: string) {
  return request<null>(orgId, `${OKR}/contributions/${id}`, { method: 'DELETE' });
}
