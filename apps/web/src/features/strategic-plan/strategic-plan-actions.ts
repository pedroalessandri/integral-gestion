'use server';

import type {
  AxisDto,
  CreateAxisDto,
  DeleteAxisResultDto,
  StrategicPlanDto,
  UpdateAxisDto,
  UpsertStrategicPlanDto,
} from '@gestion-publica/shared-types/planning';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { failure, unexpectedFailure, type ActionResult } from '@/features/planning/error-messages';

const base = (orgId: string) => `/api/v1/orgs/${orgId}/strategic-plan`;

/** `data: null` = la org no tiene plan activo (404 `StrategicPlanNotFound`): es un estado vacío, no un error. */
export async function getStrategicPlanAction(orgId: string): Promise<ActionResult<StrategicPlanDto | null>> {
  try {
    const res = await apiFetch(base(orgId), { orgId });
    if (res.ok) return { ok: true, data: (await res.json()) as StrategicPlanDto };
    const info = await readApiError(res);
    if (res.status === 404 && info.code === 'StrategicPlanNotFound') return { ok: true, data: null };
    return failure(info);
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function upsertStrategicPlanAction(
  orgId: string,
  input: UpsertStrategicPlanDto,
): Promise<ActionResult<StrategicPlanDto>> {
  try {
    const res = await apiFetch(base(orgId), { method: 'PUT', orgId, body: JSON.stringify(input) });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as StrategicPlanDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function listAxesAction(orgId: string): Promise<ActionResult<AxisDto[]>> {
  try {
    const res = await apiFetch(`${base(orgId)}/axes`, { orgId });
    if (!res.ok) return failure(await readApiError(res));
    const body = (await res.json()) as { items?: AxisDto[] };
    return { ok: true, data: body.items ?? [] };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function createAxisAction(orgId: string, input: CreateAxisDto): Promise<ActionResult<AxisDto>> {
  try {
    const res = await apiFetch(`${base(orgId)}/axes`, { method: 'POST', orgId, body: JSON.stringify(input) });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as AxisDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function updateAxisAction(
  orgId: string,
  id: string,
  input: UpdateAxisDto,
): Promise<ActionResult<AxisDto>> {
  try {
    const res = await apiFetch(`${base(orgId)}/axes/${id}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(input),
    });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as AxisDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function deleteAxisAction(orgId: string, id: string): Promise<ActionResult<DeleteAxisResultDto>> {
  try {
    const res = await apiFetch(`${base(orgId)}/axes/${id}`, { method: 'DELETE', orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as DeleteAxisResultDto };
  } catch (err) {
    return unexpectedFailure(err);
  }
}
