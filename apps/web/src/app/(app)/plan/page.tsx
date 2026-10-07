import { getActiveOrgId } from '@/lib/active-org';
import { LABELS } from '@/lib/labels';
import { getStrategicPlanAction, listAxesAction, StrategicPlanPanel } from '@/features/strategic-plan';

export default async function PlanPage() {
  const orgId = await getActiveOrgId();

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
  const loadError = !planResult.ok ? planResult.error : !axesResult.ok ? axesResult.error : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{LABELS.plan.singular}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {LABELS.plan.vision} y {LABELS.axis.plural.toLowerCase()} que ordenan los{' '}
          {LABELS.objective.plural.toLowerCase()}.
        </p>
      </div>
      <StrategicPlanPanel
        orgId={orgId}
        plan={planResult.ok ? planResult.data : null}
        axes={axesResult.ok ? axesResult.data : []}
        loadError={loadError}
      />
    </div>
  );
}
