import { Target } from 'lucide-react';
import Link from 'next/link';
import { getActiveOrgId } from '@/lib/active-org';
import { EXECUTIVE_GANTT_LABELS as L } from '@/lib/labels';
import { listPeriodsAction } from '@/components/objectives/actions';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { listAxesAction } from '@/features/strategic-plan';
import { listOrgUnitTreeAction } from '@/features/org-structure';
import { parseFilters, PlanningTreeFilterBar, resolvePeriodId } from '@/features/planning-tree';
import { ExecutiveGanttChart, getPlanningGanttAction } from '@/features/executive-gantt';

function formatDateRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const orgId = await getActiveOrgId();
  const requested = parseFilters(await searchParams);

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border p-6" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#78350f' }}>
            Seleccioná una organización
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#92400e' }}>
            Para ver la Vista ejecutiva, primero elegí una organización activa en el selector de arriba.
          </p>
        </div>
      </div>
    );
  }

  const [periodsResult, axesResult, unitsResult] = await Promise.all([
    listPeriodsAction({ orgId }),
    listAxesAction(orgId),
    listOrgUnitTreeAction(orgId),
  ]);
  // Períodos elegibles: abiertos o cerrados (no futuros).
  const eligible = (periodsResult.periods ?? []).filter((p) => p.status !== 'future');
  const valid = requested.periodId && eligible.some((p) => p.id === requested.periodId) ? requested.periodId : null;
  const periodId = resolvePeriodId(valid, eligible);
  const period = eligible.find((p) => p.id === periodId);

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{L.title}</h1>
      <Link href="/objectives" className="text-xs text-primary-600 underline underline-offset-2">
        {L.backToList}
      </Link>
    </div>
  );

  if (!periodId || !period) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon={Target} title={L.noPeriodTitle} description={L.noPeriodDescription} />
      </div>
    );
  }

  const filters = { ...requested, periodId };
  const result = await getPlanningGanttAction(orgId, filters);

  return (
    <div className="space-y-6">
      {header}
      <p className="text-sm text-neutral-500">{L.subtitle(period.code, formatDateRange(period.startsAt, period.endsAt))}</p>
      <PlanningTreeFilterBar
        filters={filters}
        periods={eligible}
        axes={axesResult.ok ? axesResult.data : []}
        unitTree={unitsResult.ok ? unitsResult.data : []}
      />
      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {L.loadError} {result.error}
          </p>
        </div>
      ) : result.data.objectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title={L.emptyTitle}
          description={L.emptyDescription}
          action={
            <Button asChild>
              <Link href="/objectives">{L.emptyCta}</Link>
            </Button>
          }
        />
      ) : (
        <ExecutiveGanttChart
          key={`${periodId}|${filters.axisId ?? ''}|${filters.orgUnitId ?? ''}`}
          data={result.data}
          periodStartsAt={period.startsAt}
          periodEndsAt={period.endsAt}
        />
      )}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center md:hidden">
        <p className="text-sm text-neutral-500">
          {L.mobileHint}{' '}
          <Link href="/objectives" className="text-primary-600 underline underline-offset-2">
            {L.mobileLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
