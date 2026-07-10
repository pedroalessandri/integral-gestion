'use server';

import { apiFetch } from '@/lib/api-client';
import type {
  MetricKrLinkDto,
  MetricContextDto,
  MetricDirection,
} from '@gestion-publica/shared-types/metrics';

/* ------------------------------------------------------------------ */
/* Owner member list                                                    */
/* ------------------------------------------------------------------ */

interface MemberOption {
  id: string;
  displayName: string;
  email: string;
}

export async function loadOrgMembersAction(input: {
  orgId: string;
}): Promise<{ members: MemberOption[]; error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/members`, {
      orgId: input.orgId,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { members: [], error: err.message ?? `HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    type RawMember = { userId: string; displayName: string; email: string };
    const items = Array.isArray(data)
      ? (data as RawMember[])
      : ((data as { items?: RawMember[] }).items ?? []);
    const members: MemberOption[] = items.map((m) => ({
      id: m.userId,
      displayName: m.displayName,
      email: m.email,
    }));
    return { members };
  } catch (err) {
    return { members: [], error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function createObjectiveAction(input: {
  orgId: string;
  title: string;
  description?: string;
  ownerUserId?: string | null;
}): Promise<{ error?: string; objective?: unknown }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch('/api/v1/okr/objectives', {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { objective: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function createKrAction(input: {
  orgId: string;
  objectiveId: string;
  title: string;
  ownerUserId?: string | null;
  weightBp: number;
}): Promise<{ error?: string; kr?: unknown }> {
  try {
    const { orgId, objectiveId, ...body } = input;
    const res = await apiFetch(`/api/v1/okr/objectives/${objectiveId}/key-results`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { kr: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function createTaskAction(input: {
  orgId: string;
  keyResultId: string;
  title: string;
  ownerUserId?: string | null;
  weightBp: number;
  /** ISO-8601. */
  startsAt: string;
  /** ISO-8601. */
  endsAt: string;
}): Promise<{ error?: string; task?: unknown }> {
  try {
    const { orgId, keyResultId, ...body } = input;
    const res = await apiFetch(`/api/v1/okr/key-results/${keyResultId}/tasks`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { task: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function setTaskProgressAction(input: {
  orgId: string;
  taskId: string;
  progressBp: number;
}): Promise<{ error?: string; task?: unknown }> {
  try {
    const { orgId, taskId, progressBp } = input;
    const res = await apiFetch(`/api/v1/okr/tasks/${taskId}/progress`, {
      method: 'PUT',
      orgId,
      body: JSON.stringify({ progressBp }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { task: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Update actions                                                       */
/* ------------------------------------------------------------------ */

export async function updateObjectiveAction(input: {
  orgId: string;
  objectiveId: string;
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
}): Promise<{ error?: string; objective?: unknown }> {
  try {
    const { orgId, objectiveId, ...body } = input;
    const res = await apiFetch(`/api/v1/okr/objectives/${objectiveId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { objective: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function updateKrAction(input: {
  orgId: string;
  krId: string;
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp?: number;
}): Promise<{ error?: string; kr?: unknown }> {
  try {
    const { orgId, krId, ...body } = input;
    const res = await apiFetch(`/api/v1/okr/key-results/${krId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { kr: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function updateTaskAction(input: {
  orgId: string;
  taskId: string;
  title?: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp?: number;
  /** ISO-8601. */
  startsAt?: string;
  /** ISO-8601. */
  endsAt?: string;
}): Promise<{ error?: string; task?: unknown }> {
  try {
    const { orgId, taskId, ...body } = input;
    const res = await apiFetch(`/api/v1/okr/tasks/${taskId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { task: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Soft-delete actions                                                  */
/* ------------------------------------------------------------------ */

export async function deleteObjectiveAction(input: {
  orgId: string;
  objectiveId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/okr/objectives/${input.objectiveId}`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function deleteKrAction(input: {
  orgId: string;
  krId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/okr/key-results/${input.krId}`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function deleteTaskAction(input: {
  orgId: string;
  taskId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/okr/tasks/${input.taskId}`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Restore actions                                                      */
/* No /restore endpoint exists in the backend; fall back to PATCH      */
/* with { deletedAt: null } per spec fallback instructions.            */
/* ------------------------------------------------------------------ */

export async function restoreObjectiveAction(input: {
  orgId: string;
  objectiveId: string;
}): Promise<{ error?: string }> {
  try {
    let res = await apiFetch(`/api/v1/okr/objectives/${input.objectiveId}/restore`, {
      method: 'POST',
      orgId: input.orgId,
    });
    if (res.status === 404) {
      res = await apiFetch(`/api/v1/okr/objectives/${input.objectiveId}`, {
        method: 'PATCH',
        orgId: input.orgId,
        body: JSON.stringify({ deletedAt: null }),
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function restoreKrAction(input: {
  orgId: string;
  krId: string;
}): Promise<{ error?: string }> {
  try {
    let res = await apiFetch(`/api/v1/okr/key-results/${input.krId}/restore`, {
      method: 'POST',
      orgId: input.orgId,
    });
    if (res.status === 404) {
      res = await apiFetch(`/api/v1/okr/key-results/${input.krId}`, {
        method: 'PATCH',
        orgId: input.orgId,
        body: JSON.stringify({ deletedAt: null }),
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function restoreTaskAction(input: {
  orgId: string;
  taskId: string;
}): Promise<{ error?: string }> {
  try {
    let res = await apiFetch(`/api/v1/okr/tasks/${input.taskId}/restore`, {
      method: 'POST',
      orgId: input.orgId,
    });
    if (res.status === 404) {
      res = await apiFetch(`/api/v1/okr/tasks/${input.taskId}`, {
        method: 'PATCH',
        orgId: input.orgId,
        body: JSON.stringify({ deletedAt: null }),
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function rebalanceKrWeightsAction(input: {
  orgId: string;
  objectiveId: string;
  weights: Array<{ krId: string; weightBp: number }>;
}): Promise<{ error?: string; cascade?: unknown }> {
  try {
    const { orgId, objectiveId, weights } = input;
    const res = await apiFetch(`/api/v1/okr/objectives/${objectiveId}/rebalance-weights`, {
      method: 'POST',
      orgId,
      body: JSON.stringify({ items: weights }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { cascade: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Period actions                                                        */
/* ------------------------------------------------------------------ */

export interface PeriodItem {
  id: string;
  code: string;
  status: 'open' | 'closed' | 'future';
  startsAt: string;
  endsAt: string;
}

export async function listPeriodsAction(input: {
  orgId: string;
}): Promise<{ error?: string; periods?: PeriodItem[] }> {
  try {
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/periods`, { orgId: input.orgId });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    const items = Array.isArray(data) ? (data as PeriodItem[]) : ((data as { items?: PeriodItem[] }).items ?? []);
    return { periods: items };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function closePeriodAction(input: {
  periodId: string;
}): Promise<{ error?: string; result?: unknown }> {
  try {
    const res = await apiFetch(`/api/v1/periods/${input.periodId}/close`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { result: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function activatePeriodAction(input: {
  periodId: string;
}): Promise<{ error?: string; result?: unknown }> {
  try {
    const res = await apiFetch(`/api/v1/periods/${input.periodId}/open`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { result: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function createPeriodAction(input: {
  orgId: string;
  code: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ error?: string; period?: unknown }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}/periods`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { period: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function deletePeriodAction(input: {
  periodId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/periods/${input.periodId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Metric ↔ KR link actions (Módulo 2 "Indicadores en OKRs")            */
/* ------------------------------------------------------------------ */

/** PUT /key-results/:id/metric-link — create or replace the link (RN-O2). */
export async function upsertKrMetricLinkAction(input: {
  orgId: string;
  krId: string;
  metricId: string;
  baselineValue?: string;
  targetValue: string;
  direction?: MetricDirection;
}): Promise<{ error?: string; link?: MetricKrLinkDto }> {
  try {
    const { orgId, krId, ...body } = input;
    const res = await apiFetch(`/api/v1/key-results/${krId}/metric-link`, {
      method: 'PUT',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { link: (await res.json()) as MetricKrLinkDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/** PATCH /key-results/:id/metric-link — edit baseline/target/direction (RN-O9). */
export async function updateKrMetricLinkAction(input: {
  orgId: string;
  krId: string;
  baselineValue?: string;
  targetValue?: string;
  direction?: MetricDirection;
}): Promise<{ error?: string; link?: MetricKrLinkDto }> {
  try {
    const { orgId, krId, ...body } = input;
    const res = await apiFetch(`/api/v1/key-results/${krId}/metric-link`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return { link: (await res.json()) as MetricKrLinkDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/** DELETE /key-results/:id/metric-link — unlink; KR keeps last % and reverts to manual (RN-O5). */
export async function unlinkKrMetricAction(input: {
  orgId: string;
  krId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/key-results/${input.krId}/metric-link`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Objective context metrics (visual-only, RN-O10)                      */
/* ------------------------------------------------------------------ */

export async function listObjectiveContextMetricsAction(input: {
  orgId: string;
  objectiveId: string;
}): Promise<{ error?: string; items?: MetricContextDto[] }> {
  try {
    const res = await apiFetch(
      `/api/v1/objectives/${input.objectiveId}/context-metrics`,
      { orgId: input.orgId },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    const items = Array.isArray(data)
      ? (data as MetricContextDto[])
      : ((data as { items?: MetricContextDto[] }).items ?? []);
    return { items };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function addObjectiveContextMetricAction(input: {
  orgId: string;
  objectiveId: string;
  metricId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(
      `/api/v1/objectives/${input.objectiveId}/context-metrics/${input.metricId}`,
      { method: 'PUT', orgId: input.orgId },
    );
    if (!res.ok && res.status !== 204) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function removeObjectiveContextMetricAction(input: {
  orgId: string;
  objectiveId: string;
  metricId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(
      `/api/v1/objectives/${input.objectiveId}/context-metrics/${input.metricId}`,
      { method: 'DELETE', orgId: input.orgId },
    );
    if (!res.ok && res.status !== 204) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { error: err.message ?? `HTTP ${res.status}` };
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* AI actions                                                           */
/* ------------------------------------------------------------------ */

export interface SmartFeedback {
  overallScore: number;
  verdict: 'excelente' | 'bueno' | 'mejorable' | 'insuficiente';
  criteria: {
    specific: { score: number; feedback: string };
    measurable: { score: number; feedback: string };
    achievable: { score: number; feedback: string };
    relevant: { score: number; feedback: string };
    timeBound: { score: number; feedback: string };
  };
  suggestions: string[];
}

export interface AiError {
  code: string;
  message: string;
}

export async function draftAiAction(input: {
  orgId: string;
  entityType: 'objective' | 'key_result';
  hint: string;
  objectiveContext?: string;
}): Promise<{ error?: AiError; text?: string }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch('/api/v1/ai/draft', {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { code?: string; error?: string; message?: string };
      const code = err?.code ?? err?.error ?? 'UNKNOWN';
      const message = err?.message ?? `HTTP ${res.status}`;
      return { error: { code, message } };
    }
    const data = await res.json() as { text?: string };
    return { text: data.text };
  } catch (err) {
    return { error: { code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Error desconocido' } };
  }
}

export async function validateAiAction(input: {
  orgId: string;
  entityType: 'objective' | 'key_result';
  text: string;
}): Promise<{ error?: AiError; feedback?: SmartFeedback }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch('/api/v1/ai/validate', {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { code?: string; error?: string; message?: string };
      const code = err?.code ?? err?.error ?? 'UNKNOWN';
      const message = err?.message ?? `HTTP ${res.status}`;
      return { error: { code, message } };
    }
    return { feedback: await res.json() as SmartFeedback };
  } catch (err) {
    return { error: { code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Error desconocido' } };
  }
}

export async function getAiStatusAction(orgId: string): Promise<{ enabled: boolean; provider: string }> {
  try {
    const res = await apiFetch('/api/v1/ai/status', { orgId });
    if (!res.ok) return { enabled: false, provider: 'anthropic' };
    return await res.json() as { enabled: boolean; provider: string };
  } catch {
    return { enabled: false, provider: 'anthropic' };
  }
}
