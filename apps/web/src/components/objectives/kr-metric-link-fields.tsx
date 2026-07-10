'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listMetricsAction } from '@/components/metrics/actions';
import { formatMetricValue } from '@/components/metrics/format';
import type { MetricDirection, MetricSummaryDto } from '@gestion-publica/shared-types/metrics';

export interface MetricLinkFieldsValue {
  metricId: string;
  baselineValue: string;
  targetValue: string;
  direction: MetricDirection;
}

interface Props {
  orgId: string;
  /** Only metrics of this period can be linked (RN-O3). */
  periodId: string;
  value: MetricLinkFieldsValue;
  onChange: (next: MetricLinkFieldsValue) => void;
  /** In 'edit' mode the linked metric is fixed (PATCH only edits baseline/target). */
  mode: 'link' | 'edit';
  disabled?: boolean;
  /** Reports whether the period has at least one linkable metric. */
  onMetricsLoaded?: (hasMetrics: boolean) => void;
}

/**
 * Shared metric-link fields: metric selector (period-scoped), baseline
 * (prefilled with the metric's current value, editable, RN-O2), target, and
 * direction (inherited from the metric, editable, D-O6). Used by the KR create
 * form and the standalone link dialog.
 */
export function KrMetricLinkFields({
  orgId,
  periodId,
  value,
  onChange,
  mode,
  disabled = false,
  onMetricsLoaded,
}: Props) {
  const [metrics, setMetrics] = useState<MetricSummaryDto[]>([]);
  // Starts true; flipped to false only after the fetch resolves (owner-select
  // pattern) — avoids a synchronous setState inside the effect body.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listMetricsAction({ orgId }).then((r) => {
      if (!alive) return;
      const periodMetrics = (r.metrics ?? []).filter((m) => m.period.id === periodId);
      setMetrics(periodMetrics);
      setLoading(false);
      onMetricsLoaded?.(periodMetrics.length > 0);
    });
    return () => {
      alive = false;
    };
    // onMetricsLoaded intentionally excluded — it is a stable callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, periodId]);

  const selected = metrics.find((m) => m.id === value.metricId);

  function handleMetricChange(metricId: string) {
    const metric = metrics.find((m) => m.id === metricId);
    // RN-O2: prefill baseline with the metric's current value and inherit direction.
    onChange({
      metricId,
      baselineValue: metric ? metric.lastValue : value.baselineValue,
      targetValue: value.targetValue || (metric ? metric.targetValue : ''),
      direction: metric ? metric.direction : value.direction,
    });
  }

  const metricLocked = mode === 'edit';

  return (
    <div className="space-y-4 rounded-lg border p-3" style={{ borderColor: 'var(--color-neutral-200)' }}>
      <div className="space-y-2">
        <Label htmlFor="kr-metric">Indicador</Label>
        {loading ? (
          <div
            className="h-9 w-full rounded-md border animate-pulse"
            style={{ borderColor: 'var(--color-neutral-200)', backgroundColor: 'var(--color-neutral-100)' }}
            aria-label="Cargando indicadores"
          />
        ) : metricLocked ? (
          <Input id="kr-metric" value={selected?.name ?? value.metricId} disabled readOnly />
        ) : metrics.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
            No hay indicadores en este período. Creá uno en “Indicadores de gestión” para poder vincularlo.
          </p>
        ) : (
          <select
            id="kr-metric"
            value={value.metricId}
            onChange={(e) => handleMetricChange(e.target.value)}
            disabled={disabled}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">— Elegí un indicador —</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {selected && (
          <p className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
            Último valor: <span className="font-mono">{formatMetricValue(selected.lastValue, selected.unit)}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="kr-baseline">Baseline</Label>
          <Input
            id="kr-baseline"
            value={value.baselineValue}
            onChange={(e) => onChange({ ...value, baselineValue: e.target.value })}
            disabled={disabled}
            inputMode="decimal"
            placeholder="0"
          />
          <p className="text-xs" style={{ color: 'var(--color-neutral-400)' }}>
            Punto de partida (editable).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kr-target">Meta (target)</Label>
          <Input
            id="kr-target"
            value={value.targetValue}
            onChange={(e) => onChange({ ...value, targetValue: e.target.value })}
            disabled={disabled}
            inputMode="decimal"
            placeholder="100"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="kr-direction">Dirección</Label>
        <select
          id="kr-direction"
          value={value.direction}
          onChange={(e) => onChange({ ...value, direction: e.target.value as MetricDirection })}
          disabled={disabled}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="increasing">Ascendente (subir hasta la meta)</option>
          <option value="decreasing">Descendente (bajar hasta la meta)</option>
        </select>
        <p className="text-xs" style={{ color: 'var(--color-neutral-400)' }}>
          Heredada del indicador; editable.
        </p>
      </div>
    </div>
  );
}

/** Client-side validation shared by the form and the link dialog. Returns an
 *  error message or null. Mirrors the backend rules (§3 / RN-O2). */
export function validateMetricLinkFields(
  v: MetricLinkFieldsValue,
  opts: { requireMetric: boolean },
): string | null {
  if (opts.requireMetric && !v.metricId) return 'Elegí un indicador.';
  const baseline = Number(v.baselineValue);
  const target = Number(v.targetValue);
  if (!v.baselineValue.trim() || !Number.isFinite(baseline)) return 'Baseline inválido.';
  if (!v.targetValue.trim() || !Number.isFinite(target)) return 'Meta (target) inválida.';
  if (baseline === target) return 'Baseline y meta no pueden ser iguales.';
  return null;
}
