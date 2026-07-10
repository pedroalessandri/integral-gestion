'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  formatMetricValue,
  directionGoalLabel,
  FREQUENCY_LABELS,
} from '@/components/metrics/format';
import {
  addObjectiveContextMetricAction,
  removeObjectiveContextMetricAction,
} from './actions';
import type { MetricContextDto, MetricSummaryDto } from '@gestion-publica/shared-types/metrics';

interface Props {
  orgId: string;
  objectiveId: string;
  contextItems: MetricContextDto[];
  /** Period metrics — used to enrich the list (frequency/target/unit) and to
   *  populate the "add" dialog. Passed from the server to avoid a client fetch. */
  periodMetrics: MetricSummaryDto[];
  /** Management (add/remove) is offered only for an open period with the module on. */
  canManage: boolean;
}

/**
 * "Indicadores de contexto del objetivo" — a read-only list of indicators
 * associated to the objective for context (RN-O10). Explicitly marked as having
 * NO impact on any calculation. Add/remove via dialogs.
 */
export function ObjectiveContextMetrics({
  orgId,
  objectiveId,
  contextItems,
  periodMetrics,
  canManage,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMetricId, setSelectedMetricId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MetricContextDto | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const metricById = new Map(periodMetrics.map((m) => [m.id, m]));
  const contextIds = new Set(contextItems.map((c) => c.metricId));
  const addableMetrics = periodMetrics.filter((m) => !contextIds.has(m.id));

  async function handleAdd() {
    if (!selectedMetricId) {
      setAddError('Elegí un indicador.');
      return;
    }
    setAdding(true);
    setAddError(null);
    const result = await addObjectiveContextMetricAction({ orgId, objectiveId, metricId: selectedMetricId });
    setAdding(false);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    setAddOpen(false);
    setSelectedMetricId('');
    router.refresh();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    const result = await removeObjectiveContextMetricAction({
      orgId,
      objectiveId,
      metricId: removeTarget.metricId,
    });
    setRemoving(false);
    if (result.error) {
      setRemoveError(result.error);
      return;
    }
    setRemoveTarget(null);
    router.refresh();
  }

  return (
    <div
      className="rounded-xl p-6 space-y-4"
      style={{
        backgroundColor: 'white',
        border: '1px solid var(--color-neutral-200)',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4" style={{ color: 'var(--color-neutral-500)' }} aria-hidden="true" />
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-neutral-900)' }}>
            Indicadores de contexto
          </h2>
        </div>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddError(null);
              setSelectedMetricId('');
              setAddOpen(true);
            }}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
        Indicadores mostrados como referencia del objetivo.{' '}
        <span className="font-medium" style={{ color: 'var(--color-neutral-600)' }}>
          No impactan en el cálculo del avance.
        </span>
      </p>

      {contextItems.length === 0 ? (
        <p className="text-sm py-2" style={{ color: 'var(--color-neutral-500)' }}>
          Sin indicadores de contexto.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--color-neutral-100)' }}>
          {contextItems.map((item) => {
            const metric = metricById.get(item.metricId);
            const unit = metric?.unit ?? 'number';
            const DirIcon = item.direction === 'increasing' ? ArrowUp : ArrowDown;
            return (
              <li key={item.metricId} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium break-words" style={{ color: 'var(--color-neutral-800)' }}>
                      {item.metricName}
                    </span>
                    <DirIcon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--color-neutral-400)' }}
                      aria-label={item.direction === 'increasing' ? 'Ascendente' : 'Descendente'}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--color-neutral-500)' }}>
                    {metric && <span>{FREQUENCY_LABELS[metric.frequency]}</span>}
                    {metric && <span>•</span>}
                    <span>
                      Último: <span className="font-mono">{formatMetricValue(item.lastValue, unit)}</span>
                    </span>
                    {metric && (
                      <>
                        <span>•</span>
                        <span>{directionGoalLabel(metric.targetValue, unit, item.direction)}</span>
                      </>
                    )}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRemoveError(null);
                      setRemoveTarget(item);
                    }}
                    aria-label={`Quitar ${item.metricName}`}
                    className="h-7 w-7 p-0 shrink-0"
                  >
                    <X className="h-4 w-4" style={{ color: 'var(--color-neutral-400)' }} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar indicador de contexto</DialogTitle>
            <DialogDescription>
              Se muestra como referencia del objetivo. No afecta ningún cálculo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="context-metric">Indicador</Label>
            {addableMetrics.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                No hay más indicadores del período para agregar.
              </p>
            ) : (
              <select
                id="context-metric"
                value={selectedMetricId}
                onChange={(e) => setSelectedMetricId(e.target.value)}
                disabled={adding}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">— Elegí un indicador —</option>
                {addableMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={adding || addableMetrics.length === 0}
            >
              {adding ? 'Agregando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar indicador de contexto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.metricName}</strong> dejará de mostrarse como contexto del objetivo.
              El indicador y sus datos no se modifican.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && <p className="text-sm text-red-600">{removeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removing}>
              {removing ? 'Quitando...' : 'Quitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
