import { Network } from 'lucide-react';
import { getActiveOrgId } from '@/lib/active-org';
import { PLANNING_TREE_LABELS as L } from '@/lib/labels';
import { EmptyState } from '@/components/empty-state';
import { listPeriodsAction } from '@/components/objectives/actions';
import { listAxesAction } from '@/features/strategic-plan';
import { listOrgUnitTreeAction } from '@/features/org-structure';
import {
  getPlanningTreeAction,
  hasObjectives,
  parseFilters,
  PlanningTreeFilterBar,
  PlanningTreeView,
  resolvePeriodId,
} from '@/features/planning-tree';

export default async function PlanningTreePage({
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
            Para ver el árbol de planificación, primero elegí una organización activa en el selector de arriba.
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
  const periods = periodsResult.periods ?? [];
  const periodId = resolvePeriodId(requested.periodId, periods);
  const filters = { ...requested, periodId };

  const treeResult = periodId ? await getPlanningTreeAction(orgId, { ...filters, periodId }) : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{L.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{L.subtitle}</p>
      </div>

      {periodId === null ? (
        <EmptyState icon={Network} title={L.noPeriodTitle} description={L.noPeriodDescription} />
      ) : (
        <>
          <PlanningTreeFilterBar
            filters={filters}
            periods={periods}
            axes={axesResult.ok ? axesResult.data : []}
            unitTree={unitsResult.ok ? unitsResult.data : []}
          />
          {treeResult === null ? null : !treeResult.ok ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                {L.loadError} {treeResult.error}
              </p>
            </div>
          ) : !hasObjectives(treeResult.data) ? (
            <EmptyState icon={Network} title={L.emptyTitle} description={L.emptyDescription} />
          ) : (
            <PlanningTreeView
              key={`${periodId}|${filters.axisId ?? ''}|${filters.orgUnitId ?? ''}`}
              data={treeResult.data}
              initialView={filters.view}
            />
          )}
        </>
      )}
    </div>
  );
}
