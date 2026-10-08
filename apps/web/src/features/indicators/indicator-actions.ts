'use server';

import type {
  CreateObjectiveIndicatorDto,
  IndicatorStatusDto,
  IndicatorTargetPointDto,
  MetricDetailDto,
  MetricEntryDto,
  MetricSeriesDto,
  MetricSummaryDto,
  ObjectiveIndicatorDto,
  ProjectContributionDto,
  ObjectiveStatusDto,
  SetObjectiveIndicatorWeightsDto,
  UpdateObjectiveIndicatorDto,
} from '@gestion-publica/shared-types/metrics';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { listIndicatorContributionsAction } from '@/features/contributions/contribution-actions';
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

/** La API devuelve `{ items }`; se tolera también un array plano. */
function unwrapItems<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  return (body as { items?: T[] } | null)?.items ?? [];
}

async function requestItems<T>(
  orgId: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ActionResult<T[]>> {
  const result = await request<unknown>(orgId, path, init);
  return result.ok ? { ok: true, data: unwrapItems<T>(result.data) } : result;
}

export async function listIndicatorsAction(orgId: string, objectiveId: string) {
  return requestItems<ObjectiveIndicatorDto>(orgId, `${OKR}/objectives/${objectiveId}/indicators`);
}

export async function createIndicatorAction(orgId: string, objectiveId: string, input: CreateObjectiveIndicatorDto) {
  return request<ObjectiveIndicatorDto>(orgId, `${OKR}/objectives/${objectiveId}/indicators`, {
    method: 'POST',
    body: input,
  });
}

export async function updateIndicatorAction(orgId: string, indicatorId: string, input: UpdateObjectiveIndicatorDto) {
  return request<ObjectiveIndicatorDto>(orgId, `${OKR}/indicators/${indicatorId}`, { method: 'PATCH', body: input });
}

export async function deleteIndicatorAction(orgId: string, indicatorId: string) {
  return request<null>(orgId, `${OKR}/indicators/${indicatorId}`, { method: 'DELETE' });
}

export async function setIndicatorWeightsAction(
  orgId: string,
  objectiveId: string,
  input: SetObjectiveIndicatorWeightsDto,
) {
  return requestItems<ObjectiveIndicatorDto>(orgId, `${OKR}/objectives/${objectiveId}/indicators/weights`, {
    method: 'PUT',
    body: input,
  });
}

/** Métricas del org (para elegir una existente). Requiere el módulo "Indicadores de gestión" y `metrics:read`. */
export async function listOrgMetricsAction(orgId: string) {
  return requestItems<MetricSummaryDto>(orgId, `/api/v1/orgs/${orgId}/metrics`);
}

export interface IndicatorChartData {
  metric: MetricDetailDto;
  series: MetricSeriesDto;
  entries: MetricEntryDto[];
}

/** Serie, cargas y buckets de la métrica de un indicador, para el gráfico y la carga de valores. */
export async function getIndicatorChartDataAction(
  orgId: string,
  metricId: string,
): Promise<ActionResult<IndicatorChartData>> {
  const [metric, series, entries] = await Promise.all([
    request<MetricDetailDto>(orgId, `/api/v1/metrics/${metricId}`),
    request<MetricSeriesDto>(orgId, `/api/v1/metrics/${metricId}/series`),
    requestItems<MetricEntryDto>(orgId, `/api/v1/metrics/${metricId}/entries`),
  ]);
  if (!metric.ok) return metric;
  if (!series.ok) return series;
  if (!entries.ok) return entries;
  return { ok: true, data: { metric: metric.data, series: series.data, entries: entries.data } };
}

/** Estado de un objetivo: resultado y gestión, cada una con su desvío y semáforo (nunca combinadas). */
export async function getObjectiveStatusAction(orgId: string, objectiveId: string) {
  return request<ObjectiveStatusDto>(orgId, `${OKR}/objectives/${objectiveId}/status`);
}

/** Estado y puntos de curva manual de un indicador. Solo necesitan `okr:read` (no el módulo de métricas). */
export interface IndicatorExtras {
  /** `null` si no se pudo calcular: la tarjeta se muestra igual, sin semáforo. */
  status: IndicatorStatusDto | null;
  statusError: string | null;
  /** Puntos de la curva manual (vacío si la curva no es manual). `null` si no se pudieron cargar. */
  targetPoints: IndicatorTargetPointDto[] | null;
  pointsError: string | null;
  /**
   * Aportes de proyectos al indicador (pasos de la curva `from_projects` y origen de las cargas automáticas).
   * Solo se piden si es `execution_feeds_indicator`; `null` si no corresponde o no se pudieron cargar.
   */
  contributions: ProjectContributionDto[] | null;
  contributionsError: string | null;
}

export async function getIndicatorExtrasAction(
  orgId: string,
  indicator: Pick<ObjectiveIndicatorDto, 'id' | 'expectedCurveMode' | 'linkMode'>,
): Promise<IndicatorExtras> {
  const [status, points, contributions] = await Promise.all([
    request<IndicatorStatusDto>(orgId, `${OKR}/indicators/${indicator.id}/status`),
    indicator.expectedCurveMode === 'manual'
      ? requestItems<IndicatorTargetPointDto>(orgId, `${OKR}/indicators/${indicator.id}/target-points`)
      : Promise.resolve<ActionResult<IndicatorTargetPointDto[]>>({ ok: true, data: [] }),
    indicator.linkMode === 'execution_feeds_indicator'
      ? listIndicatorContributionsAction(orgId, indicator.id)
      : Promise.resolve<ActionResult<ProjectContributionDto[] | null>>({ ok: true, data: null }),
  ]);
  return {
    status: status.ok ? status.data : null,
    statusError: status.ok ? null : status.error,
    targetPoints: points.ok ? points.data : null,
    pointsError: points.ok ? null : points.error,
    contributions: contributions.ok ? contributions.data : null,
    contributionsError: contributions.ok ? null : contributions.error,
  };
}
