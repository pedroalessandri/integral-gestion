'use client';

import { useMemo, useState } from 'react';
import type {
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricSummaryDto,
  IndicatorTargetPointDto,
  MetricUnit,
  ObjectiveIndicatorDto,
  ObjectiveIndicatorLinkMode,
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
import {
  EXPECTED_CURVE_MODE_LABELS,
  FROM_PROJECTS_UNAVAILABLE_LABELS,
  INDICATOR_KIND_LABELS,
  LABELS,
  LINK_MODE_FIELD_LABELS,
  LINK_MODE_LABELS,
} from '@/lib/labels';
import {
  fromProjectsAvailability,
  type FromProjectsAvailability,
} from '@/features/contributions/contributions';
import { formatBpPercent } from '@/features/projects/weights';
import {
  curveBuckets,
  formatBucketDate,
  isLockedBucket,
  type CurvePeriod,
  type EditableCurveMode,
} from '../curve-form';
import {
  applyExistingMetric,
  reconcileLinkAndCurve,
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
  /** Puntos guardados de la curva manual; `null` si no se pudieron cargar. */
  targetPoints: IndicatorTargetPointDto[] | null;
  /** Período del objetivo: define los intervalos de la curva manual junto con la frecuencia. */
  period: CurvePeriod;
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
  targetPoints,
  period,
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
    indicator ? indicatorToFormValues(indicator, metric, targetPoints ?? []) : emptyIndicatorForm(),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof IndicatorFormValues>(key: K, value: IndicatorFormValues[K]) =>
    setValues((v) => reconcileLinkAndCurve({ ...v, [key]: value }));

  const pointsUnavailable =
    editing && targetPoints === null && indicator.expectedCurveMode === 'manual';
  const buckets = useMemo(() => curveBuckets(period, values.frequency), [period, values.frequency]);
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
    const problem = validateIndicatorForm(values, editing, period);
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
            La línea base, la meta y la dirección de este {noun} mandan sobre las de la métrica para
            el avance del objetivo. La unidad y la frecuencia no se pueden cambiar una vez creada la
            métrica.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-800">Métrica</legend>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Origen de la métrica"
              >
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

          <LinkModeField
            value={values.linkMode}
            kind={values.kind}
            onChange={(linkMode) => set('linkMode', linkMode)}
          />

          <CurveEditor
            mode={values.curveMode}
            fromProjects={fromProjectsAvailability(values)}
            buckets={buckets}
            pointValues={values.pointValues}
            targetValue={values.targetValue}
            unavailable={pointsUnavailable}
            onModeChange={(curveMode) => set('curveMode', curveMode)}
            onPointChange={(bucket, value) =>
              set('pointValues', { ...values.pointValues, [bucket]: value })
            }
          />

          {editing && indicator && (
            <p className="text-xs text-neutral-500">
              {LABELS.weighting.weight}:{' '}
              {indicator.weightBp === null ? (
                LABELS.weighting.unweighted
              ) : (
                <span className="font-mono">{formatBpPercent(indicator.weightBp, 2)}</span>
              )}
              . Los pesos se cambian de a todos juntos con &quot;{LABELS.weighting.editWeights}
              &quot;.
            </p>
          )}
          {!editing && groupWeighted && (
            <p className="text-xs text-amber-800">
              Los indicadores de este objetivo están ponderados: el nuevo entra con peso 0 %. Usá
              &quot;
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
            <Button type="submit" disabled={pending || pointsUnavailable}>
              {pending ? 'Guardando...' : editing ? 'Guardar cambios' : `Crear ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CurveEditorProps {
  mode: EditableCurveMode;
  buckets: string[];
  pointValues: Record<string, string>;
  targetValue: string;
  /** "Desde proyectos" solo para `output` + `execution_feeds_indicator`. */
  fromProjects: FromProjectsAvailability;
  /** Es manual pero no pudimos traer sus puntos: editarlos pisaría la curva guardada. */
  unavailable: boolean;
  onModeChange: (mode: EditableCurveMode) => void;
  onPointChange: (bucket: string, value: string) => void;
}

/**
 * Modo de la curva esperada (RN-P17) y, en manual, un valor esperado acumulado por intervalo. El último intervalo vale
 * siempre la meta (la API exige que el último punto sea igual a ella); los demás son opcionales y, vacíos, se
 * interpolan. `Desde proyectos` se habilita solo para indicadores Producto con el vínculo de aportes; si no, queda
 * deshabilitado con la explicación.
 */
function CurveEditor({
  mode,
  fromProjects: fromProjectsStatus,
  buckets,
  pointValues,
  targetValue,
  unavailable,
  onModeChange,
  onPointChange,
}: CurveEditorProps) {
  const fromProjects = EXPECTED_CURVE_MODE_LABELS.from_projects;
  const fromProjectsReason = fromProjectsStatus.available
    ? null
    : FROM_PROJECTS_UNAVAILABLE_LABELS[fromProjectsStatus.reason];
  return (
    <fieldset className="space-y-3 rounded-lg border border-neutral-200 p-3">
      <legend className="px-1 text-sm font-medium text-neutral-800">{LABELS.expectedCurve}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={LABELS.expectedCurve}>
        {(['linear', 'manual'] as const).map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            role="radio"
            aria-checked={mode === m}
            variant={mode === m ? 'default' : 'outline'}
            onClick={() => onModeChange(m)}
          >
            {EXPECTED_CURVE_MODE_LABELS[m].label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          role="radio"
          aria-checked={mode === 'from_projects'}
          variant={mode === 'from_projects' ? 'default' : 'outline'}
          disabled={!fromProjectsStatus.available}
          title={fromProjectsReason ?? fromProjects.hint}
          aria-describedby={fromProjectsReason ? 'curve-from-projects-reason' : undefined}
          onClick={() => onModeChange('from_projects')}
        >
          {fromProjects.label}
        </Button>
      </div>
      <p className="text-xs text-neutral-500">{EXPECTED_CURVE_MODE_LABELS[mode].hint}</p>
      {fromProjectsReason && (
        <p id="curve-from-projects-reason" className="text-xs text-neutral-500">
          {fromProjects.label}: {fromProjectsReason}
        </p>
      )}

      {unavailable && (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
        >
          No pudimos cargar los puntos guardados de la curva manual. Cerrá este diálogo y recargá la
          página antes de editar el indicador, así no se pisan.
        </p>
      )}

      {mode === 'manual' && !unavailable && (
        <div className="space-y-2">
          {buckets.length < 2 && (
            <p className="text-xs text-amber-800">
              {buckets.length === 0
                ? 'No pudimos calcular los intervalos del período.'
                : 'Con esta frecuencia el período tiene un solo intervalo: la curva manual queda igual que llegar a la meta de una vez. Probá con la curva lineal.'}
            </p>
          )}
          <p className="text-xs text-neutral-600">
            Indicá cuánto esperás tener acumulado al inicio de cada intervalo. Si dejás uno vacío,
            se interpola entre los vecinos. El último intervalo es siempre la meta.
          </p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {buckets.map((bucket) => {
              const locked = isLockedBucket(buckets, bucket);
              const id = `curve-point-${bucket}`;
              return (
                <li key={bucket} className="grid grid-cols-[7rem_1fr] items-center gap-2">
                  <Label htmlFor={id} className="text-xs font-normal text-neutral-700">
                    {formatBucketDate(bucket)}
                  </Label>
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={locked ? targetValue : (pointValues[bucket] ?? '')}
                    readOnly={locked}
                    disabled={locked}
                    onChange={(e) => onPointChange(bucket, e.target.value)}
                    placeholder="Interpolado"
                    aria-describedby={locked ? `${id}-hint` : undefined}
                  />
                  {locked && (
                    <span id={`${id}-hint`} className="col-span-2 -mt-1 text-xs text-neutral-500">
                      Igual a la meta.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

interface LinkModeFieldProps {
  value: ObjectiveIndicatorLinkMode;
  kind: MetricKind;
  onChange: (value: ObjectiveIndicatorLinkMode) => void;
}

/** Vínculo con la gestión (RN-P14b). "Los proyectos aportan" solo para Producto; el otro sentido se arma desde el proyecto. */
function LinkModeField({ value, kind, onChange }: LinkModeFieldProps) {
  const modes: ObjectiveIndicatorLinkMode[] =
    value === 'indicator_feeds_execution'
      ? ['independent', 'execution_feeds_indicator', 'indicator_feeds_execution']
      : ['independent', 'execution_feeds_indicator'];
  return (
    <div className="space-y-2">
      <Label htmlFor="indicator-link-mode">{LINK_MODE_FIELD_LABELS.legend}</Label>
      <select
        id="indicator-link-mode"
        value={value}
        onChange={(e) => onChange(e.target.value as ObjectiveIndicatorLinkMode)}
        className={SELECT_CLASS}
        aria-describedby="indicator-link-mode-hint"
      >
        {modes.map((m) => (
          <option
            key={m}
            value={m}
            disabled={
              m === 'indicator_feeds_execution' ||
              (m === 'execution_feeds_indicator' && kind !== 'output')
            }
          >
            {LINK_MODE_LABELS[m].label}
          </option>
        ))}
      </select>
      <p id="indicator-link-mode-hint" className="text-xs text-neutral-500">
        {LINK_MODE_LABELS[value].hint}
        {kind !== 'output' && ` ${LINK_MODE_FIELD_LABELS.outputOnly}`}
      </p>
    </div>
  );
}
