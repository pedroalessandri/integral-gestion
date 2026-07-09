'use server';

import { apiFetch } from '@/lib/api-client';
import type {
  MetricSummaryDto,
  MetricDetailDto,
  MetricEntryDto,
  MetricUnit,
  MetricDirection,
  MetricFrequency,
} from '@gestion-publica/shared-types/metrics';

/** Extracts a human-readable message from a non-ok response. */
async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? `HTTP ${res.status}`;
}

/* ------------------------------------------------------------------ */
/* Metric CRUD                                                          */
/* ------------------------------------------------------------------ */

export async function listMetricsAction(input: {
  orgId: string;
  frequency?: MetricFrequency;
}): Promise<{ error?: string; metrics?: MetricSummaryDto[] }> {
  try {
    const qs = input.frequency ? `?frequency=${input.frequency}` : '';
    const res = await apiFetch(`/api/v1/orgs/${input.orgId}/metrics${qs}`, { orgId: input.orgId });
    if (!res.ok) return { error: await errorMessage(res) };
    const data: unknown = await res.json();
    const metrics = Array.isArray(data)
      ? (data as MetricSummaryDto[])
      : ((data as { items?: MetricSummaryDto[] }).items ?? []);
    return { metrics };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function createMetricAction(input: {
  orgId: string;
  name: string;
  unit: MetricUnit;
  direction: MetricDirection;
  frequency: MetricFrequency;
  baselineValue?: string;
  targetValue: string;
}): Promise<{ error?: string; metric?: MetricDetailDto }> {
  try {
    const { orgId, ...body } = input;
    const res = await apiFetch(`/api/v1/orgs/${orgId}/metrics`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: await errorMessage(res) };
    return { metric: (await res.json()) as MetricDetailDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function updateMetricAction(input: {
  orgId: string;
  metricId: string;
  name?: string;
  baselineValue?: string;
  targetValue?: string;
}): Promise<{ error?: string; metric?: MetricDetailDto }> {
  try {
    const { orgId, metricId, ...body } = input;
    const res = await apiFetch(`/api/v1/metrics/${metricId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: await errorMessage(res) };
    return { metric: (await res.json()) as MetricDetailDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function deleteMetricAction(input: {
  orgId: string;
  metricId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/metrics/${input.metricId}`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) return { error: await errorMessage(res) };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/* ------------------------------------------------------------------ */
/* Entries                                                              */
/* ------------------------------------------------------------------ */

export async function createEntryAction(input: {
  orgId: string;
  metricId: string;
  bucketDate: string;
  incrementValue: string;
  comment?: string;
}): Promise<{ error?: string; entry?: MetricEntryDto }> {
  try {
    const { orgId, metricId, ...body } = input;
    const res = await apiFetch(`/api/v1/metrics/${metricId}/entries`, {
      method: 'POST',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: await errorMessage(res) };
    return { entry: (await res.json()) as MetricEntryDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function updateEntryAction(input: {
  orgId: string;
  metricId: string;
  entryId: string;
  incrementValue?: string;
  comment?: string;
}): Promise<{ error?: string; entry?: MetricEntryDto }> {
  try {
    const { orgId, metricId, entryId, ...body } = input;
    const res = await apiFetch(`/api/v1/metrics/${metricId}/entries/${entryId}`, {
      method: 'PATCH',
      orgId,
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: await errorMessage(res) };
    return { entry: (await res.json()) as MetricEntryDto };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function deleteEntryAction(input: {
  orgId: string;
  metricId: string;
  entryId: string;
}): Promise<{ error?: string }> {
  try {
    const res = await apiFetch(`/api/v1/metrics/${input.metricId}/entries/${input.entryId}`, {
      method: 'DELETE',
      orgId: input.orgId,
    });
    if (!res.ok && res.status !== 204) return { error: await errorMessage(res) };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
