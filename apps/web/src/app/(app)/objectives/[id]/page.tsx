import { notFound } from 'next/navigation';
import { Lock as LockIcon, Info } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { getActiveOrgId } from '@/lib/active-org';
import { getAiStatusAction } from '@/components/objectives/actions';
import { HashScroller } from '@/components/objectives/hash-scroller';
import { ObjectiveHeaderActions } from '@/components/objectives/objective-header-actions';
import { ObjectiveContextMetrics } from '@/components/objectives/objective-context-metrics';
import { EmptyState } from '@/components/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ExecutionProgressBar,
  ObjectiveProjectsPanel,
  listProjectsAction,
  listProjectTasksAction,
} from '@/features/projects';
import {
  ObjectiveIndicatorsPanel,
  ResultProgressBar,
  getIndicatorChartDataAction,
  getIndicatorExtrasAction,
  getObjectiveStatusAction,
  listIndicatorsAction,
  listOrgMetricsAction,
} from '@/features/indicators';
import type { IndicatorChartData, IndicatorExtras } from '@/features/indicators';
import type { ActionResult } from '@/features/planning/error-messages';
import { LABELS } from '@/lib/labels';
import type { ObjectiveDetailDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import type {
  MetricContextDto,
  MetricSummaryDto,
} from '@gestion-publica/shared-types/metrics';

export default async function ObjectiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const [res, aiStatus, meRes] = await Promise.all([
    apiFetch(`/api/v1/okr/objectives/${id}`, { orgId }),
    getAiStatusAction(orgId),
    apiFetch('/api/v1/me'),
  ]);
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div className="max-w-4xl">
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>
            Error {res.status}: {await res.text()}
          </p>
        </div>
      </div>
    );
  }

  const objective: ObjectiveDetailDto = await res.json();
  const isReadOnly = objective.period.status !== 'open';
  const periodStartsAt = objective.period.startsAt;
  const periodEndsAt = objective.period.endsAt;
  const periodId = objective.period.id;

  // ¿La org tiene habilitados los indicadores de contexto en objetivos?
  let indicadoresOkrEnabled = false;
  let indicadoresGestionEnabled = false;
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      orgs?: Array<{ id: string; enabledModules?: string[] }>;
    };
    const enabledModules = me.orgs?.find((o) => o.id === orgId)?.enabledModules ?? [];
    indicadoresOkrEnabled = enabledModules.includes('indicadores-okr');
    indicadoresGestionEnabled = enabledModules.includes('indicadores-gestion');
  }

  // Period metrics (for unit formatting + context enrichment/add) and the
  // objective's context indicators — only when the module is on (else 403).
  let periodMetrics: MetricSummaryDto[] = [];
  let contextMetrics: MetricContextDto[] = [];
  if (indicadoresOkrEnabled) {
    const [metricsRes, contextRes] = await Promise.all([
      apiFetch(`/api/v1/orgs/${orgId}/metrics`, { orgId }),
      apiFetch(`/api/v1/objectives/${id}/context-metrics`, { orgId }),
    ]);
    if (metricsRes.ok) {
      const body: unknown = await metricsRes.json();
      const items = Array.isArray(body)
        ? (body as MetricSummaryDto[])
        : ((body as { items?: MetricSummaryDto[] }).items ?? []);
      periodMetrics = items.filter((m) => m.period.id === periodId);
    }
    if (contextRes.ok) {
      const body: unknown = await contextRes.json();
      contextMetrics = Array.isArray(body)
        ? (body as MetricContextDto[])
        : ((body as { items?: MetricContextDto[] }).items ?? []);
    }
  }

  // Proyectos (N5) y sus tareas: alimentan la pestaña Proyectos, el Gantt y la barra de gestión.
  const projectsResult = await listProjectsAction(orgId, id);
  const projects = projectsResult.ok ? projectsResult.data : [];
  const tasksByProject: Record<string, TaskSummaryDto[]> = {};
  let projectsLoadError = projectsResult.ok ? null : projectsResult.error;
  if (projectsResult.ok) {
    const taskResults = await Promise.all(projects.map((p) => listProjectTasksAction(orgId, p.id)));
    taskResults.forEach((r, i) => {
      const project = projects[i];
      if (!project) return;
      if (r.ok) tasksByProject[project.id] = r.data;
      else projectsLoadError = r.error;
    });
  }
  if (!projectsLoadError && (!periodStartsAt || !periodEndsAt)) {
    projectsLoadError = 'No pudimos obtener las fechas del período del objetivo. Recargá la página.';
  }

  // Indicadores (N4): lista del objetivo, y gráfico + cargas de cada métrica (endpoints del módulo
  // "Indicadores de gestión": si no está habilitado se omiten y la pestaña lo avisa).
  const indicatorsResult = await listIndicatorsAction(orgId, id);
  const indicators = indicatorsResult.ok ? indicatorsResult.data : [];
  // Estado de cada indicador (semáforo, cargas pendientes, puntos de la curva manual) y de las dos lecturas del
  // objetivo. Solo requieren `okr:read`; si fallan, se muestran las barras y tarjetas sin semáforo.
  const [indicatorExtras, objectiveStatusResult] = await Promise.all([
    Promise.all(indicators.map((i) => getIndicatorExtrasAction(orgId, i))),
    getObjectiveStatusAction(orgId, id),
  ]);
  const extrasByIndicatorId: Record<string, IndicatorExtras> = Object.fromEntries(
    indicators.map((i, idx) => [i.id, indicatorExtras[idx]!]),
  );
  const objectiveStatus = objectiveStatusResult.ok ? objectiveStatusResult.data : null;
  let chartsByMetricId: Record<string, ActionResult<IndicatorChartData>> | null = null;
  let availableMetrics: MetricSummaryDto[] = [];
  let catalogError: string | null = null;
  if (indicatorsResult.ok && indicadoresGestionEnabled) {
    const [chartResults, catalogResult] = await Promise.all([
      Promise.all(indicators.map((i) => getIndicatorChartDataAction(orgId, i.metricId))),
      listOrgMetricsAction(orgId),
    ]);
    chartsByMetricId = Object.fromEntries(indicators.map((i, idx) => [i.metricId, chartResults[idx]!]));
    if (catalogResult.ok) {
      const used = new Set(indicators.map((i) => i.metricId));
      availableMetrics = catalogResult.data.filter((m) => m.period.id === periodId && !used.has(m.id));
    } else {
      catalogError = catalogResult.error;
    }
  } else if (!indicadoresGestionEnabled) {
    catalogError = 'el módulo "Indicadores de gestión" no está habilitado para esta organización';
  }
  const defaultTab = indicators.length > 0 ? 'indicators' : projects.length > 0 ? 'projects' : 'indicators';

  return (
    <div className="space-y-6 max-w-5xl">
      <HashScroller />
      {/* Read-only banner */}
      {isReadOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <LockIcon className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Período cerrado</h3>
            <p className="text-sm text-amber-800 mt-1">
              Este objetivo pertenece a un período cerrado. Los valores son sólo de lectura.
            </p>
          </div>
        </div>
      )}

      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/objectives"
          className="text-sm font-medium"
          style={{ color: 'var(--color-primary-600)', transition: 'color 150ms ease' }}
        >
          ← Volver a objetivos
        </Link>
        <div className="flex items-start justify-between mt-3 gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: 'var(--color-neutral-900)' }}
              >
                {objective.title}
              </h1>
            </div>
            {objective.description && (
              <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                {objective.description}
              </p>
            )}
            <ObjectiveDateRange startsAt={objective.startsAt} endsAt={objective.endsAt} />
            {/* Dos lecturas independientes (RN-P8): nunca se suman ni se promedian entre sí. */}
            <div className="grid max-w-xl grid-cols-1 gap-x-6 gap-y-3 pt-2 sm:grid-cols-2">
              <ResultProgressBar
                valueBp={objective.resultProgressCachedBp}
                indicatorCount={indicators.length}
                status={objectiveStatus?.result ?? null}
              />
              <ExecutionProgressBar
                valueBp={objective.executionProgressCachedBp}
                projectCount={projects.length}
                status={objectiveStatus?.execution ?? null}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ObjectiveHeaderActions
              orgId={orgId}
              objective={{
                id: objective.id,
                title: objective.title,
                description: objective.description,
                ownerUserId: objective.owner?.id ?? null,
                orgUnitId: objective.orgUnitId,
                axisId: objective.axisId,
                owner: objective.owner,
              }}
              isReadOnly={isReadOnly}
              aiEnabled={aiStatus.enabled}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="indicators">
            {LABELS.indicator.plural}
            {indicators.length > 0 && ` (${indicators.length})`}
          </TabsTrigger>
          <TabsTrigger value="projects">
            {LABELS.project.plural}
            {projects.length > 0 && ` (${projects.length})`}
          </TabsTrigger>
          <TabsTrigger value="context">{LABELS.context}</TabsTrigger>
        </TabsList>

        <TabsContent value="indicators" className="mt-0">
          <ObjectiveIndicatorsPanel
            orgId={orgId}
            objective={{ id: objective.id }}
            indicators={indicators}
            chartsByMetricId={chartsByMetricId}
            extrasByIndicatorId={extrasByIndicatorId}
            period={{ startsAt: periodStartsAt ?? '', endsAt: periodEndsAt ?? '' }}
            availableMetrics={availableMetrics}
            catalogError={catalogError}
            readOnly={isReadOnly}
            loadError={indicatorsResult.ok ? null : indicatorsResult.error}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-0">
          <ObjectiveProjectsPanel
            orgId={orgId}
            objective={{
              id: objective.id,
              orgUnitId: objective.orgUnitId,
              periodStartsAt: periodStartsAt ?? '',
              periodEndsAt: periodEndsAt ?? '',
            }}
            projects={projects}
            tasksByProject={tasksByProject}
            readOnly={isReadOnly}
            loadError={projectsLoadError}
          />
        </TabsContent>

        <TabsContent value="context" className="mt-0">
          {indicadoresOkrEnabled ? (
            <ObjectiveContextMetrics
              orgId={orgId}
              objectiveId={objective.id}
              contextItems={contextMetrics}
              periodMetrics={periodMetrics}
              canManage={!isReadOnly}
            />
          ) : (
            <EmptyState
              icon={Info}
              title="Los indicadores de contexto no están habilitados"
              description="Pedile a un admin de la organización que active el módulo de indicadores en objetivos."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Format an ISO-8601 date string as dd/mm/yyyy for display. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Rango derivado de los proyectos del objetivo; no se muestra si no tiene proyectos. */
function ObjectiveDateRange({
  startsAt,
  endsAt,
}: {
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  if (!startsAt || !endsAt) return null;
  return (
    <p className="text-xs mt-1" style={{ color: 'var(--color-neutral-400)' }}>
      {formatDate(startsAt)} — {formatDate(endsAt)}
    </p>
  );
}
