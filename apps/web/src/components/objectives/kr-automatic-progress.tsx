import Link from 'next/link';
import { Zap, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMetricValue } from '@/components/metrics/format';
import type { MetricKrLinkDto, MetricUnit } from '@gestion-publica/shared-types/metrics';

/**
 * Read-only progress display for an automatic KR (progressMode === 'automatic').
 * Shows the "⚡ Automático" badge, the linked-indicator legend, a progress bar
 * WITHOUT a slider, a link to the indicator detail, and the calc note (RN-O4).
 * When the indicator has no data yet the KR sits at 0% with a "sin datos" badge
 * (RN-O6). Presentation only — the % is computed server-side.
 */
export function KrAutomaticProgress({
  link,
  unit = 'number',
}: {
  link: MetricKrLinkDto;
  unit?: MetricUnit;
}) {
  const noData = link.estado === 'sin-datos';
  const progressPct = link.computedProgressBp / 100;

  return (
    <div
      className="rounded-lg p-3 space-y-3"
      style={{
        border: '1px solid var(--color-primary-200, #c7d2fe)',
        backgroundColor: 'var(--color-primary-50, #eef2ff)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="gap-1" style={{ backgroundColor: 'var(--color-primary-600)' }}>
            <Zap className="h-3 w-3" aria-hidden="true" />
            Automático
          </Badge>
          {noData && (
            <Badge variant="secondary" title="El indicador todavía no tiene cargas">
              sin datos
            </Badge>
          )}
        </div>
        <Link
          href={`/metrics/${link.metricId}`}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--color-primary-600)' }}
        >
          Ver indicador
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }}>
        Vinculado al indicador <span className="font-semibold">{link.metricName}</span> ·{' '}
        <span className="font-mono">{formatMetricValue(link.baselineValue, unit)}</span> →{' '}
        <span className="font-mono">{formatMetricValue(link.targetValue, unit)}</span> · último valor{' '}
        <span className="font-mono">{formatMetricValue(link.lastValue, unit)}</span>
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-full h-2" style={{ backgroundColor: 'var(--color-neutral-200)' }}>
          <div
            className="h-2 rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, progressPct))}%`,
              background: 'linear-gradient(to right, var(--color-primary-500), var(--color-primary-600))',
              transition: 'width 500ms ease',
            }}
          />
        </div>
        <span className="text-sm font-semibold font-mono shrink-0" style={{ color: 'var(--color-primary-600)' }}>
          {noData ? '0%' : `${progressPct.toFixed(1)}%`}
        </span>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-neutral-400)' }}>
        El avance se calcula automáticamente por interpolación lineal entre baseline y meta
        (acotado a 0–100%). No se edita a mano.
      </p>
    </div>
  );
}
