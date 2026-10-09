'use client';

import { useState } from 'react';
import { Compass, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AxisDto, StrategicPlanDto } from '@gestion-publica/shared-types/planning';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { LABELS, PLANNING_TREE_LABELS } from '@/lib/labels';
import { AxisBoardLink, AxisBoardSection } from '@/features/planning-tree/components/axis-board';
import type { AxisBoard } from '@/features/planning-tree/planning-tree-view';
import { useStrategicPlan } from '../useStrategicPlan';
import { PlanFormDialog } from './plan-form-dialog';
import { AxisFormDialog } from './axis-form-dialog';
import { DeleteAxisDialog } from './delete-axis-dialog';

interface Props {
  orgId: string;
  /** null = la organización todavía no tiene plan activo. */
  plan: StrategicPlanDto | null;
  axes: AxisDto[];
  loadError?: string | null;
  /** Tablero por eje (SPEC §5.2). `axes = null` = no hay datos (sin período o error). */
  board?: {
    periodId: string | null;
    periodCode: string | null;
    axes: Record<string, AxisBoard> | null;
    error: string | null;
  };
}

type DialogState =
  | { type: 'plan' }
  | { type: 'axis'; axis: AxisDto | null }
  | { type: 'delete'; axis: AxisDto }
  | null;

const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function StrategicPlanPanel({ orgId, plan, axes, loadError, board }: Props) {
  const s = useStrategicPlan(orgId);
  const [dialog, setDialog] = useState<DialogState>(null);
  const editingAxisId = dialog?.type === 'axis' && dialog.axis ? dialog.axis.id : '';

  function open(next: DialogState) {
    s.clearError();
    setDialog(next);
  }
  function close() {
    s.clearError();
    setDialog(null);
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border p-4 bg-red-50 border-red-200">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <>
        <EmptyState
          icon={Landmark}
          title="Aún no hay plan de gobierno"
          description="Creá el plan con la visión general y el período del mandato. Después vas a poder agregar los ejes."
          action={<Button onClick={() => open({ type: 'plan' })}>Crear plan de gobierno</Button>}
        />
        {dialog?.type === 'plan' && (
          <PlanFormDialog plan={null} pending={s.pending} error={s.error} onSubmit={s.savePlan} onClose={close} />
        )}
      </>
    );
  }

  return (
    <div className="space-y-8">
      {s.notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3">
          <p className="text-sm text-neutral-700">{s.notice}</p>
          <Button variant="ghost" size="sm" onClick={s.dismissNotice}>
            Cerrar
          </Button>
        </div>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3" aria-labelledby="plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="plan-heading" className="text-lg font-semibold text-neutral-900">
              {plan.title}
            </h2>
            <p className="text-xs text-neutral-500">
              Mandato: {formatDate(plan.mandateStartsAt)} al {formatDate(plan.mandateEndsAt)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => open({ type: 'plan' })}>
            <Pencil className="h-4 w-4 mr-1.5" aria-hidden />
            Editar plan
          </Button>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">{LABELS.plan.vision}</h3>
          <p className="mt-1 whitespace-pre-line text-sm text-neutral-800">{plan.vision}</p>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="axes-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="axes-heading" className="text-lg font-semibold text-neutral-900">
              {LABELS.axis.plural}
            </h2>
            <p className="text-sm text-neutral-500">
              Agrupan {LABELS.objective.plural.toLowerCase()} de una o más unidades.
            </p>
          </div>
          <Button onClick={() => open({ type: 'axis', axis: null })}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Nuevo eje
          </Button>
        </div>

        {board && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-600">
              {board.periodCode
                ? `${PLANNING_TREE_LABELS.boardTitle}: ${PLANNING_TREE_LABELS.boardSubtitle(board.periodCode)}`
                : PLANNING_TREE_LABELS.boardNoPeriod}
            </p>
            {board.periodId && <AxisBoardLink periodId={board.periodId} />}
          </div>
        )}
        {board?.error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {PLANNING_TREE_LABELS.loadError} {board.error}
          </div>
        )}

        {axes.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Aún no hay ejes"
            description="Los ejes son opcionales. Creá el primero para agrupar los objetivos del plan."
            action={<Button onClick={() => open({ type: 'axis', axis: null })}>Crear el primer eje</Button>}
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {axes.map((axis) => (
              <li key={axis.id} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-neutral-900">{axis.name}</h3>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => open({ type: 'axis', axis })}
                      aria-label={`Editar ${axis.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => open({ type: 'delete', axis })}
                      aria-label={`Eliminar ${axis.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {axis.description && <p className="text-sm text-neutral-600">{axis.description}</p>}
                <Badge variant="outline" className="text-xs">
                  {axis.objectiveCount === 1
                    ? '1 objetivo estratégico'
                    : `${axis.objectiveCount} objetivos estratégicos`}
                </Badge>
                {board?.axes && <AxisBoardSection axisId={axis.id} board={board.axes[axis.id]} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.type === 'plan' && (
        <PlanFormDialog plan={plan} pending={s.pending} error={s.error} onSubmit={s.savePlan} onClose={close} />
      )}
      {dialog?.type === 'axis' && dialog.axis === null && (
        <AxisFormDialog axis={null} pending={s.pending} error={s.error} onSubmit={s.createAxis} onClose={close} />
      )}
      {dialog?.type === 'axis' && dialog.axis !== null && (
        <AxisFormDialog
          axis={dialog.axis}
          pending={s.pending}
          error={s.error}
          onSubmit={(dto) => s.updateAxis(editingAxisId, dto)}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteAxisDialog
          axis={dialog.axis}
          pending={s.pending}
          error={s.error}
          onConfirm={async () => {
            if (await s.deleteAxis(dialog.axis)) close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
