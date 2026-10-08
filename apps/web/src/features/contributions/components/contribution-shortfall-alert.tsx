import { AlertTriangle } from 'lucide-react';
import type { MetricUnit } from '@gestion-publica/shared-types/metrics';
import { formatMetricValue } from '@/components/metrics/format';
import { CONTRIBUTION_SHORTFALL_LABELS as L } from '@/lib/labels';

interface Props {
  shortfall: { count: number; total: string; projectedValue: string };
  targetValue: string;
  unit: MetricUnit;
}

/** "Los aportes no alcanzan la meta": total de aportes y valor proyectado contra la meta. */
export function ContributionShortfallAlert({ shortfall, targetValue, unit }: Props) {
  const projected = formatMetricValue(shortfall.projectedValue, unit);
  const target = formatMetricValue(targetValue, unit);
  return (
    <div
      role="status"
      data-testid="contribution-shortfall"
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{L.title}</p>
        <p className="text-xs">
          {shortfall.count === 0 ? L.noContributions(target) : L.body(projected, target, shortfall.count)}
        </p>
        <p className="flex flex-wrap gap-x-4 text-xs">
          <span>
            {L.total}: <span className="font-mono">{formatMetricValue(shortfall.total, unit)}</span>
          </span>
          <span>
            {L.projected}: <span className="font-mono">{projected}</span>
          </span>
          <span>
            {L.target}: <span className="font-mono">{target}</span>
          </span>
        </p>
      </div>
    </div>
  );
}
