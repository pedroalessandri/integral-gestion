/** Filtros del árbol ↔ searchParams de la URL (compartibles). Lógica pura. */
export type PlanningTreeViewMode = 'axes' | 'units';

export const DEFAULT_VIEW: PlanningTreeViewMode = 'axes';

export interface PlanningTreeFilters {
  periodId: string | null;
  axisId: string | null;
  orgUnitId: string | null;
  view: PlanningTreeViewMode;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

export function parseFilters(raw: RawSearchParams): PlanningTreeFilters {
  return {
    periodId: single(raw.periodId),
    axisId: single(raw.axisId),
    orgUnitId: single(raw.orgUnitId),
    view: single(raw.view) === 'units' ? 'units' : DEFAULT_VIEW,
  };
}

/** Omite lo vacío y la vista por defecto, para que las URLs queden cortas. */
export function toSearchParams(filters: PlanningTreeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.periodId) params.set('periodId', filters.periodId);
  if (filters.axisId) params.set('axisId', filters.axisId);
  if (filters.orgUnitId) params.set('orgUnitId', filters.orgUnitId);
  if (filters.view !== DEFAULT_VIEW) params.set('view', filters.view);
  return params;
}

export function toHref(basePath: string, filters: PlanningTreeFilters): string {
  const qs = toSearchParams(filters).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export interface PeriodRef {
  id: string;
  status: 'open' | 'closed' | 'future';
}

/** Período a consultar: el de la URL si existe en la org; si no, el abierto; si no, el primer cerrado (igual que /objectives). */
export function resolvePeriodId(requested: string | null, periods: PeriodRef[]): string | null {
  if (requested) return requested;
  return periods.find((p) => p.status === 'open')?.id ?? periods.find((p) => p.status === 'closed')?.id ?? null;
}

export function hasActiveFilters(filters: PlanningTreeFilters): boolean {
  return filters.axisId !== null || filters.orgUnitId !== null;
}
