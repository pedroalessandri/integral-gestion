import { getActiveOrgId } from '@/lib/active-org';
import { LABELS } from '@/lib/labels';
import { listPeriodsAction } from '@/components/objectives/actions';
import { PeriodSelector } from '@/components/periods/period-selector';
import { buildAxisBoards, getPlanningTreeAction, resolvePeriodId } from '@/features/planning-tree';
import { getStrategicPlanAction, listAxesAction, StrategicPlanPanel } from '@/features/strategic-plan';

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const orgId = await getActiveOrgId();
  const { periodId: requestedPeriodId } = await searchParams;

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border p-6" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#78350f' }}>
            Seleccioná una organización
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#92400e' }}>
            Para ver el plan de gobierno, primero elegí una organización activa en el selector de arriba.
          </p>
        </div>
      </div>
    );
  }

  const [planResult, axesResult] = await Promise.all([getStrategicPlanAction(orgId), listAxesAction(orgId)]);
  const periods = (await listPeriodsAction({ orgId })).periods ?? [];
  const periodId = resolvePeriodId(requestedPeriodId?.trim() || null, periods);
  const period = periods.find((p) => p.id === periodId) ?? null;
  // Un solo request trae todos los ejes con sus dos lecturas y el desglose por unidad (SPEC §5.2).
  const boardResult =
    periodId && planResult.ok && planResult.data ? await getPlanningTreeAction(orgId, { periodId }) : null;
  const loadError = !planResult.ok ? planResult.error : !axesResult.ok ? axesResult.error : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{LABELS.plan.singular}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {LABELS.plan.vision} y {LABELS.axis.plural.toLowerCase()} que ordenan los{' '}
          {LABELS.objective.plural.toLowerCase()}.
        </p>
        <div className="mt-2">
          <PeriodSelector periods={periods} currentPeriodId={periodId ?? undefined} baseHref="/plan" />
        </div>
      </div>
      <StrategicPlanPanel
        orgId={orgId}
        plan={planResult.ok ? planResult.data : null}
        axes={axesResult.ok ? axesResult.data : []}
        loadError={loadError}
        board={{
          periodCode: period?.code ?? null,
          periodId,
          axes: boardResult?.ok ? buildAxisBoards(boardResult.data) : null,
          error: boardResult && !boardResult.ok ? boardResult.error : null,
        }}
      />
    </div>
  );
}
