import type { MetricUnit, MetricDirection, MetricFrequency } from '@gestion-publica/shared-types/metrics';

/** Formats a decimal string according to the metric unit. Presentation only. */
export function formatMetricValue(value: string, unit: MetricUnit): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (unit === 'percent') {
    return `${trimNumber(n)}%`;
  }
  if (unit === 'currency') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(n);
  }
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(n);
}

function trimNumber(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(n);
}

/** "Llegar a X" (increasing) / "Bajar a X" (decreasing). */
export function directionGoalLabel(target: string, unit: MetricUnit, direction: MetricDirection): string {
  const verb = direction === 'increasing' ? 'Llegar a' : 'Bajar a';
  return `${verb} ${formatMetricValue(target, unit)}`;
}

export const UNIT_LABELS: Record<MetricUnit, string> = {
  number: 'Número',
  percent: 'Porcentaje',
  currency: 'Moneda',
};

export const FREQUENCY_LABELS: Record<MetricFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

/** es-AR date label for a bucket / ISO date (day + short month). */
export function formatBucketLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
