'use client';

import { useState } from 'react';
import type {
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricSummaryDto,
  MetricUnit,
  ObjectiveIndicatorDto,
} from '@gestion-publica/shared-types/metrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FREQUENCY_LABELS, UNIT_LABELS } from '@/components/metrics/format';
import { INDICATOR_KIND_LABELS, LABELS } from '@/lib/labels';
import { formatBpPercent } from '@/features/projects/weights';
import {
  applyExistingMetric,
  emptyIndicatorForm,
  inferDirection,
  indicatorToFormValues,
  validateIndicatorForm,
  type IndicatorFormValues,
} from '../indicator-form';

const SELECT_CLASS =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:bg-neutral-50 disabled:opacity-60';

interface Props {
  /** null = crear. */
  indicator: ObjectiveIndicatorDto | null;
  /** Métrica del indicador que se edita (fuente y descripción). */
  metric: MetricSummaryDto | null;
  /** Métricas del período del objetivo que todavía no son indicadores de él. */
  availableMetrics: MetricSummaryDto[];
  /** Si no se pudo cargar el catálogo de métricas, solo se puede crear con una métrica nueva. */
  catalogError: string | null;
  /** El grupo de indicadores ya está ponderado: el nuevo entra con peso 0 %. */
  groupWeighted: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (values: IndicatorFormValues) => Promise<boolean>;
  onClose: () => void;
}

export function IndicatorFormDialog({
  indicator,
  metric,
  availableMetrics,
  catalogError,
  groupWeighted,
  pending,
  error,
  onSubmit,
  onClose,
}: Props) {
  const editing = indicator !== null;
  const canPickExisting = availableMetrics.length > 0;
  const [values, setValues] = useState<IndicatorFormValues>(() =>
    indicator ? indicatorToFormValues(indicator, metric) : emptyIndicatorForm(),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof IndicatorFormValues>(key: K, value: IndicatorFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const metricIsExisting = values.sourceMode === 'existing';
  const metricFieldsLocked = editing || metricIsExisting;

  function setNumber(key: 'baselineValue' | 'targetValue', value: string) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      const inferred = inferDirection(next.baselineValue, next.targetValue);
      return inferred ? { ...next, direction: inferred } : next;
    });
  }

  function pickMetric(id: string) {
    const picked = availableMetrics.find((m) => m.id === id);
    if (picked) setValues((v) => applyExistingMetric(v, picked));
    else set('metricId', '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateIndicatorForm(values, editing);
    setLocalError(problem);
    if (problem) return;
    if (await onSubmit(values)) onClose();
  }

  const shownError = localError ?? error;
  const noun = LABELS.indicator.singular.toLowerCase();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${noun}` : `Nuevo ${noun}`}</DialogTitle>
          <DialogDescription>
            La línea base, la meta y la dirección de este {noun} mandan sobre las de la métrica para el avance del
            objetivo. La unidad y la frecuencia no se pueden cambiar una vez creada la métrica.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-800">Métrica</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Origen de la métrica">
                <Button
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={!metricIsExisting}
                  variant={metricIsExisting ? 'outline' : 'default'}
                  onClick={() => set('sourceMode', 'new')}
                >
                  Crear métrica nueva
                </Button>
                <Button
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={metricIsExisting}
                  variant={metricIsExisting ? 'default' : 'outline'}
                  disabled={!canPickExisting}
                  onClick={() => set('sourceMode', 'existing')}
                >
                  Usar una existente
                </Button>
              </div>
              {catalogError ? (
                <p className="text-xs text-amber-800">
                  No pudimos cargar las métricas existentes ({catalogError}). Podés crear una nueva.
                </p>
              ) : (
                !canPickExisting && (
                  <p className="text-xs text-neutral-500">
                    No hay métricas del período sin usar en este objetivo. Creá una nueva.
                  </p>
                )
              )}
            </fieldset>
          )}

          {metricIsExisting && !editing ? (
            <div className="space-y-2">
              <Label htmlFor="indicator-metric">Métrica existente</Label>
              <select
                id="indicator-metric"
                value={values.metricId}
                onChange={(e) => pickMetric(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Elegí una métrica…</option>
                {availableMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {FREQUENCY_LABELS[m.frequency]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="indicator-name">Nombre</Label>
              <Input
                id="indicator-name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                disabled={editing}
                maxLength={200}
                placeholder="Ej: Kilómetros de ciclovía"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="indicator-kind">Tipo</Label>
              <select
                id="indicator-kind"
                value={values.kind}
                onChange={(e) => set('kind', e.target.value as MetricKind)}
                disabled={metricIsExisting && !editing}
                className={SELECT_CLASS}
              >
                {(Object.keys(INDICATOR_KIND_LABELS) as MetricKind[]).map((k) => (
                  <option key={k} value={k}>
                    {INDICATOR_KIND_LABELS[k].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="indicator-frequency">Frecuencia</Label>
              <select
                id="indicator-frequency"
                value={values.frequency}
                onChange={(e) => set('frequency', e.target.value as MetricFrequency)}
                disabled={metricFieldsLocked}
                className={SELECT_CLASS}
              >
                {(Object.keys(FREQUENCY_LABELS) as MetricFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="indicator-unit">Unidad</Label>
              <select
                id="indicator-unit"
                value={values.unit}
                onChange={(e) => set('unit', e.target.value as MetricUnit)}
                disabled={metricFieldsLocked}
                className={SELECT_CLASS}
              >
                {(Object.keys(UNIT_LABELS) as MetricUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-neutral-500">
            {INDICATOR_KIND_LABELS[values.kind].label}: {INDICATOR_KIND_LABELS[values.kind].hint}.
            {values.kind === 'output' && ' Admite aportes de proyectos.'}
          </p>

          {!(metricIsExisting && !editing) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="indicator-source">Fuente del dato (opcional)</Label>
                <Input
                  id="indicator-source"
                  value={values.source}
                  onChange={(e) => set('source', e.target.value)}
                  maxLength={500}
                  placeholder="Ej: Registro de obras de la Secretaría"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="indicator-description">Descripción o fórmula (opcional)</Label>
                <Textarea
                  id="indicator-description"
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Cómo se mide este indicador"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="indicator-baseline">Línea base</Label>
              <Input
                id="indicator-baseline"
                inputMode="decimal"
                value={values.baselineValue}
                onChange={(e) => setNumber('baselineValue', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="indicator-target">Meta</Label>
              <Input
                id="indicator-target"
                inputMode="decimal"
                value={values.targetValue}
                onChange={(e) => setNumber('targetValue', e.target.value)}
                placeholder="Ej: 500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="indicator-direction">Dirección</Label>
              <select
                id="indicator-direction"
                value={values.direction}
                onChange={(e) => set('direction', e.target.value as MetricDirection)}
                className={SELECT_CLASS}
              >
                <option value="increasing">Creciente</option>
                <option value="decreasing">Decreciente</option>
              </select>
            </div>
          </div>

          {editing && indicator && (
            <p className="text-xs text-neutral-500">
              {LABELS.weighting.weight}:{' '}
              {indicator.weightBp === null ? (
                LABELS.weighting.unweighted
              ) : (
                <span className="font-mono">{formatBpPercent(indicator.weightBp, 2)}</span>
              )}
              . Los pesos se cambian de a todos juntos con &quot;{LABELS.weighting.editWeights}&quot;.
            </p>
          )}
          {!editing && groupWeighted && (
            <p className="text-xs text-amber-800">
              Los indicadores de este objetivo están ponderados: el nuevo entra con peso 0 %. Usá &quot;
              {LABELS.weighting.editWeights}&quot; para repartir los pesos.
            </p>
          )}

          {shownError && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{shownError}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando...' : editing ? 'Guardar cambios' : `Crear ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
