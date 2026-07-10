import { notFound } from 'next/navigation';
import { ListChecks, Lock as LockIcon, Check } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { getActiveOrgId } from '@/lib/active-org';
import { getAiStatusAction } from '@/components/objectives/actions';
import { HashScroller } from '@/components/objectives/hash-scroller';
import { CreateKrButton } from '@/components/objectives/create-kr-button';
import { TaskProgressSlider } from '@/components/objectives/task-progress-slider';
import { KrSectionMenu } from './kr-section-menu';
import { KrCardActions } from '@/components/objectives/kr-card-actions';
import { TaskRowActions } from '@/components/objectives/task-row-actions';
import { ObjectiveHeaderActions } from '@/components/objectives/objective-header-actions';
import { StatusIcon } from '@/components/objectives/status-icon';
import { KrAutomaticProgress } from '@/components/objectives/kr-automatic-progress';
import { ObjectiveContextMetrics } from '@/components/objectives/objective-context-metrics';
import { ProgressRing } from '@/components/progress-ring';
import { EmptyState } from '@/components/empty-state';
import type { TaskStatus, ProgressStatus, OwnerSummaryDto } from '@gestion-publica/shared-types/okr';
import type {
  MetricKrLinkDto,
  MetricContextDto,
  MetricSummaryDto,
  MetricUnit,
} from '@gestion-publica/shared-types/metrics';

interface CascadeResponse {
  objective: {
    id: string;
    title: string;
    description?: string | null;
    progressCachedBp: number;
    status: ProgressStatus;
    createdAt: string;
    /** Assigned owner — null when unassigned. */
    owner: OwnerSummaryDto | null;
    /** The local core.user.id of the owner, if any. */
    ownerUserId?: string | null;
    /** Derived from KR dates — null when no tasks exist. */
    startsAt?: string | null;
    /** Derived from KR dates — null when no tasks exist. */
    endsAt?: string | null;
    period: {
      id: string;
      code: string;
      status: 'open' | 'closed' | 'future';
      startsAt?: string;
      endsAt?: string;
    };
  };
  keyResults: Array<{
    id: string;
    title: string;
    description?: string | null;
    /** Per OwnerInCascadeDto — only id + displayName are returned. */
    owner: { id: string; displayName: string } | null;
    weightBp: number;
    progressCachedBp: number;
    status: ProgressStatus;
    /** Derived from task dates — null when KR has no tasks. */
    startsAt?: string | null;
    /** Derived from task dates — null when KR has no tasks. */
    endsAt?: string | null;
    /** True when task weights do not sum to 10000bp. */
    tasksImbalanced?: boolean;
    /** M2: 'automatic' when the KR is driven by a linked indicator (RN-O1). */
    progressMode?: 'manual' | 'automatic';
    /** M2: embedded link when progressMode === 'automatic'. */
    metricLink?: MetricKrLinkDto | null;
    tasks: Array<{
      id: string;
      title: string;
      description?: string | null;
      /** Per OwnerInCascadeDto. */
      owner: { id: string; displayName: string } | null;
      weightBp: number;
      progressBp: number;
      startsAt: string;
      endsAt: string;
      status: TaskStatus;
    }>;
  }>;
  /** Count of KRs whose task weights are imbalanced. */
  imbalancedKrCount?: number;
}

export default async function ObjectiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const [res, aiStatus, meRes] = await Promise.all([
    apiFetch(`/api/v1/okr/objectives/${id}/cascade`, { orgId }),
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

  const data: CascadeResponse = await res.json();
  const { objective, keyResults, imbalancedKrCount } = data;
  const isReadOnly = objective.period.status !== 'open';
  const periodStartsAt = objective.period.startsAt;
  const periodEndsAt = objective.period.endsAt;
  const periodId = objective.period.id;

  // M2: does this org have "Indicadores en OKRs" enabled?
  let indicadoresOkrEnabled = false;
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      orgs?: Array<{ id: string; enabledModules?: string[] }>;
    };
    indicadoresOkrEnabled =
      me.orgs?.find((o) => o.id === orgId)?.enabledModules?.includes('indicadores-okr') ?? false;
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

  const unitByMetricId = new Map<string, MetricUnit>(periodMetrics.map((m) => [m.id, m.unit]));

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
              <StatusIcon status={objective.status} />
            </div>
            {objective.description && (
              <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                {objective.description}
              </p>
            )}
            <ObjectiveDateRange startsAt={objective.startsAt} endsAt={objective.endsAt} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ObjectiveHeaderActions
              orgId={orgId}
              objective={{
                id: objective.id,
                title: objective.title,
                description: objective.description,
                ownerUserId: objective.ownerUserId ?? null,
                owner: objective.owner,
              }}
              isReadOnly={isReadOnly}
              aiEnabled={aiStatus.enabled}
            />
            <ProgressRing valueBp={objective.progressCachedBp} size={72} />
          </div>
        </div>
      </div>

      {/* Key Results card */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Resultados Clave
          </h2>
          {!isReadOnly && (
            <KrSectionMenu
              orgId={orgId}
              objectiveId={objective.id}
              objectiveTitle={objective.title}
              keyResults={keyResults.map((kr) => ({
                id: kr.id,
                title: kr.title,
                weightBp: kr.weightBp,
              }))}
              aiEnabled={aiStatus.enabled}
              indicadoresOkrEnabled={indicadoresOkrEnabled}
              periodId={periodId}
            />
          )}
        </div>

        {keyResults.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Este objetivo todavía no tiene Resultados Clave"
            description="Los Resultados Clave definen cómo vas a medir el logro del objetivo."
            action={
              !isReadOnly ? (
                <CreateKrButton
                  orgId={orgId}
                  objectiveId={objective.id}
                  objectiveContext={objective.title}
                  aiEnabled={aiStatus.enabled}
                  indicadoresOkrEnabled={indicadoresOkrEnabled}
                  periodId={periodId}
                />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {keyResults.map((kr) => (
              <KrCard
                key={kr.id}
                kr={kr}
                orgId={orgId}
                objectiveId={objective.id}
                isReadOnly={isReadOnly}
                aiEnabled={aiStatus.enabled}
                periodStartsAt={periodStartsAt}
                periodEndsAt={periodEndsAt}
                indicadoresOkrEnabled={indicadoresOkrEnabled}
                periodId={periodId}
                unit={kr.metricLink ? unitByMetricId.get(kr.metricLink.metricId) : undefined}
              />
            ))}
            <WeightSumBanner keyResults={keyResults} />
            {(imbalancedKrCount ?? 0) > 0 && (
              <TasksImbalanceBanner count={imbalancedKrCount ?? 0} />
            )}
          </div>
        )}
      </div>

      {indicadoresOkrEnabled && (
        <ObjectiveContextMetrics
          orgId={orgId}
          objectiveId={objective.id}
          contextItems={contextMetrics}
          periodMetrics={periodMetrics}
          canManage={!isReadOnly}
        />
      )}
    </div>
  );
}

function KrCard({
  kr,
  orgId,
  objectiveId,
  isReadOnly,
  aiEnabled,
  periodStartsAt,
  periodEndsAt,
  indicadoresOkrEnabled,
  periodId,
  unit,
}: {
  kr: CascadeResponse['keyResults'][0];
  orgId: string;
  objectiveId: string;
  isReadOnly: boolean;
  aiEnabled: boolean;
  periodStartsAt?: string;
  periodEndsAt?: string;
  indicadoresOkrEnabled: boolean;
  periodId: string;
  unit?: MetricUnit;
}) {
  const weightPct = kr.weightBp / 100;
  const progressPct = kr.progressCachedBp / 100;
  const isAutomatic = kr.progressMode === 'automatic' && !!kr.metricLink;

  return (
    <div
      id={`kr-${kr.id}`}
      className="rounded-xl p-4 space-y-3"
      style={{
        border: '1px solid var(--color-neutral-200)',
        transition: 'box-shadow 150ms ease',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--color-neutral-900)' }}>
              {kr.title}
            </h3>
            <StatusIcon status={kr.status} />
          </div>
          <div
            className="flex items-center gap-3 mt-1 text-xs"
            style={{ color: 'var(--color-neutral-500)' }}
          >
            <span>
              Peso:{' '}
              <span className="font-mono" style={{ color: 'var(--color-neutral-700)' }}>
                {weightPct.toFixed(1)}%
              </span>
            </span>
            <span>•</span>
            <span>{kr.tasks.length} {kr.tasks.length === 1 ? 'tarea' : 'tareas'}</span>
            <span>•</span>
            <KrDateRange startsAt={kr.startsAt} endsAt={kr.endsAt} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div
              className="text-lg font-semibold"
              style={{ color: 'var(--color-primary-600)' }}
            >
              {progressPct.toFixed(1)}%
            </div>
            {!isAutomatic && (
              <div
                className="w-24 rounded-full h-1.5 mt-1"
                style={{ backgroundColor: 'var(--color-neutral-200)' }}
              >
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.min(100, progressPct)}%`,
                    background: 'linear-gradient(to right, var(--color-primary-500), var(--color-primary-600))',
                    transition: 'width 500ms ease',
                  }}
                />
              </div>
            )}
          </div>
          {!isReadOnly && (
            <KrCardActions
              orgId={orgId}
              objectiveId={objectiveId}
              kr={{
                id: kr.id,
                title: kr.title,
                description: kr.description,
                ownerUserId: kr.owner?.id ?? null,
                weightBp: kr.weightBp,
              }}
              aiEnabled={aiEnabled}
              periodStartsAt={periodStartsAt}
              periodEndsAt={periodEndsAt}
              indicadoresOkrEnabled={indicadoresOkrEnabled}
              periodId={periodId}
              progressMode={kr.progressMode ?? 'manual'}
              metricLink={kr.metricLink ?? null}
            />
          )}
        </div>
      </div>

      {isAutomatic && kr.metricLink && (
        <KrAutomaticProgress link={kr.metricLink} unit={unit} />
      )}

      <div className="pl-4 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-neutral-500)' }}>
          Tareas
        </h4>
        {isAutomatic && kr.tasks.length > 0 && (
          <p
            className="text-xs rounded-md px-2.5 py-1.5"
            style={{
              backgroundColor: 'var(--color-neutral-100)',
              color: 'var(--color-neutral-600)',
            }}
          >
            Estas tareas son informativas — <strong>no impactan el avance</strong> de este Resultado
            Clave, que se calcula desde el indicador (RN-O4).
          </p>
        )}
        {kr.tasks.length === 0 ? (
          <p className="text-xs py-2" style={{ color: 'var(--color-neutral-500)' }}>
            {isReadOnly
              ? 'Sin tareas.'
              : 'Sin tareas. Agregá la primera para medir este Resultado Clave.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {kr.tasks.map((task) => {
              const taskWeight = task.weightBp / 100;
              return (
                <li
                  key={task.id}
                  id={`task-${task.id}`}
                  className="flex items-center gap-3 text-sm py-2"
                  style={{
                    borderBottom: '1px solid var(--color-neutral-100)',
                  }}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span
                      className="min-w-0 break-words"
                      style={{ color: 'var(--color-neutral-700)', lineHeight: '1.35' }}
                    >
                      {task.title}
                    </span>
                    <span className="shrink-0 mt-0.5">
                      <StatusIcon status={task.status} />
                    </span>
                  </div>
                  <span
                    className="text-xs font-mono shrink-0"
                    title="Peso"
                    style={{ color: 'var(--color-neutral-500)' }}
                  >
                    {taskWeight.toFixed(0)}%
                  </span>
                  <span
                    className="text-xs shrink-0"
                    style={{ color: 'var(--color-neutral-400)' }}
                  >
                    {task.endsAt.slice(0, 10)}
                  </span>
                  <div className="flex-1 max-w-xs">
                    {isReadOnly ? (
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'var(--color-primary-600)' }}
                      >
                        {(task.progressBp / 100).toFixed(0)}%
                      </span>
                    ) : (
                      <TaskProgressSlider
                        orgId={orgId}
                        taskId={task.id}
                        initialProgressBp={task.progressBp}
                      />
                    )}
                  </div>
                  {!isReadOnly && (
                    <TaskRowActions
                      orgId={orgId}
                      keyResultId={kr.id}
                      task={{
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        ownerUserId: task.owner?.id ?? null,
                        weightBp: task.weightBp,
                        startsAt: task.startsAt,
                        endsAt: task.endsAt,
                      }}
                      periodStartsAt={periodStartsAt}
                      periodEndsAt={periodEndsAt}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
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

/** Show derived start — end dates for a KR, with em dash when null. */
function KrDateRange({
  startsAt,
  endsAt,
}: {
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  if (!startsAt || !endsAt) {
    return (
      <span style={{ color: 'var(--color-neutral-400)' }}>
        — sin fechas
      </span>
    );
  }
  return (
    <span>
      {formatDate(startsAt)} — {formatDate(endsAt)}
    </span>
  );
}

/** Show derived start — end dates for an Objective, with em dash when null. */
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

/** Banner shown when any KR has imbalanced task weights. */
function TasksImbalanceBanner({ count }: { count: number }) {
  return (
    <div
      className="rounded-lg p-3 text-sm"
      style={{
        backgroundColor: '#fffbeb',
        color: '#92400e',
        border: '1px solid #fde68a',
      }}
    >
      <strong>
        {count === 1
          ? '1 Resultado Clave tiene'
          : `${count} Resultados Clave tienen`}
      </strong>{' '}
      el peso de sus tareas mal distribuido — la suma debe ser exactamente 100% para que
      el progreso se calcule correctamente.
    </div>
  );
}

function WeightSumBanner({ keyResults }: { keyResults: CascadeResponse['keyResults'] }) {
  const sum = keyResults.reduce((acc, kr) => acc + kr.weightBp, 0);
  const sumPct = sum / 100;
  const balanced = sum === 10000;

  if (balanced) {
    return (
      <div className="flex justify-end">
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--color-neutral-500)' }}
        >
          <Check
            className="w-3.5 h-3.5"
            style={{ color: '#16a34a' }}
            aria-hidden="true"
          />
          Pesos balanceados
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-3 text-sm"
      style={{
        backgroundColor: '#fffbeb',
        color: '#92400e',
        border: '1px solid #fde68a',
      }}
    >
      <strong>Suma de pesos:</strong> {sumPct.toFixed(1)}% — debe sumar 100% para
      calcular el progreso correctamente
    </div>
  );
}
