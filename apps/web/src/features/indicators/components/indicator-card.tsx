'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import type { ObjectiveIndicatorDto } from '@gestion-publica/shared-types/metrics';
import { Badge } from '@/components/ui/badge';
import { PendingLoadBadge } from '@/components/pending-load-badge';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { Button } from '@/components/ui/button';
import { EntryFormPanel } from '@/components/metrics/entry-form-panel';
import { EntryHistoryTable } from '@/components/metrics/entry-history-table';
import { MetricChart } from '@/components/metrics/metric-chart';
import { FREQUENCY_LABELS, formatMetricValue } from '@/components/metrics/format';
import { ContributionShortfallAlert } from '@/features/contributions/components/contribution-shortfall-alert';
import { contributionShortfall, projectTitleMap } from '@/features/contributions/contributions';
import type { ActionResult } from '@/features/planning/error-messages';
import { formatBpPercent } from '@/features/projects/weights';
import { EXPECTED_CURVE_MODE_LABELS, INDICATOR_KIND_LABELS, LABELS, LINK_MODE_LABELS } from '@/lib/labels';
import { seriesForIndicator } from '../chart-data';
import { formatBucketDate } from '../curve-form';
import type { IndicatorChartData, IndicatorExtras } from '../indicator-actions';

interface Props {
  orgId: string;
  indicator: ObjectiveIndicatorDto;
  chart: ActionResult<IndicatorChartData> | null;
  /** Estado (`/status`) y puntos de la curva manual; `null` si no se pidieron. */
  extras: IndicatorExtras | null;
  /** Período cerrado: solo lectura. */
  readOnly: boolean;
  defaultOpen: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function IndicatorCard({ orgId, indicator, chart, extras, readOnly, defaultOpen, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = Math.max(0, Math.min(10000, indicator.progressCachedBp)) / 100;
  const detailsId = `indicator-details-${indicator.id}`;
  const DirectionIcon = indicator.direction === 'increasing' ? TrendingUp : TrendingDown;
  const status = extras?.status ?? null;
  const pendingBuckets = status?.pendingBuckets ?? [];
  const curve = EXPECTED_CURVE_MODE_LABELS[indicator.expectedCurveMode];
  // Manual sin puntos cargados: no se dibuja una curva falsa (ver `seriesForIndicator`).
  const shortfall = contributionShortfall(status);
  const contributions = extras?.contributions ?? null;
  const projectTitles = useMemo(() => projectTitleMap(contributions ?? []), [contributions]);
  const targetPoints = extras ? extras.targetPoints : indicator.expectedCurveMode === 'manual' ? null : [];

  return (
    <li className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={detailsId}
              className="flex items-center gap-1.5 text-left font-medium text-neutral-900 hover:underline"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span className="break-words">{indicator.metricName}</span>
            </button>
            <Badge variant="outline" className="text-xs">
              {INDICATOR_KIND_LABELS[indicator.kind].label}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {FREQUENCY_LABELS[indicator.frequency]}
            </Badge>
            {indicator.linkMode === 'execution_feeds_indicator' && (
              <Badge variant="outline" className="text-xs" title={LINK_MODE_LABELS.execution_feeds_indicator.hint}>
                {LINK_MODE_LABELS.execution_feeds_indicator.label}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs" title={curve.hint}>
              {LABELS.expectedCurve}: {curve.label.toLowerCase()}
            </Badge>
          </div>
          {status && (
            <div className="flex flex-wrap items-center gap-2" data-testid="indicator-status">
              <SemaphoreBadge
                color={status.semaphore}
                deviationBp={status.deviationBp}
                reading={indicator.metricName}
                testId="indicator-semaphore"
              />
              <PendingLoadBadge
                count={pendingBuckets.length}
                detail={pendingBuckets.map(formatBucketDate).join(', ')}
                testId="indicator-pending"
              />
              {status.hasData && status.expectedValue !== null && (
                <span className="text-xs text-neutral-500">
                  Esperado al {status.asOf ? formatBucketDate(status.asOf) : 'último intervalo'}:{' '}
                  <span className="font-mono text-neutral-800">
                    {formatMetricValue(status.expectedValue, indicator.unit)}
                  </span>
                </span>
              )}
            </div>
          )}
          {extras?.statusError && (
            <p className="text-xs text-amber-800">No pudimos calcular el semáforo. {extras.statusError}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <DirectionIcon className="h-3.5 w-3.5" aria-hidden />
              Base {formatMetricValue(indicator.baselineValue, indicator.unit)} → Meta{' '}
              {formatMetricValue(indicator.targetValue, indicator.unit)}
            </span>
            <span>
              Valor actual:{' '}
              <span className="font-mono text-neutral-800">
                {indicator.hasData ? formatMetricValue(indicator.lastValue, indicator.unit) : 'Sin datos'}
              </span>
            </span>
            {indicator.weightBp !== null && (
              <span>
                {LABELS.weighting.weight}: <span className="font-mono">{formatBpPercent(indicator.weightBp, 2)}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-semibold text-neutral-900">{formatBpPercent(indicator.progressCachedBp)}</span>
          {!readOnly && (
            <>
              <Button variant="ghost" size="sm" aria-label={`Editar ${indicator.metricName}`} onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                aria-label={`Quitar ${indicator.metricName}`}
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-neutral-200" aria-hidden>
        <div className="h-1.5 rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
      </div>
      {shortfall && (
        <ContributionShortfallAlert shortfall={shortfall} targetValue={indicator.targetValue} unit={indicator.unit} />
      )}
      {extras?.contributionsError && (
        <p className="text-xs text-amber-800">No pudimos cargar los aportes de proyectos. {extras.contributionsError}</p>
      )}

      {open && (
        <div id={detailsId} className="grid grid-cols-1 gap-4 border-t border-neutral-100 pt-3 lg:grid-cols-3">
          {chart === null || !chart.ok ? (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 lg:col-span-3">
              {chart === null
                ? 'El gráfico y la carga de valores necesitan el módulo "Indicadores de gestión" habilitado para esta organización.'
                : `No pudimos cargar el gráfico ni las cargas. ${chart.error}`}
            </p>
          ) : (
            <>
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-lg border border-neutral-200 p-3">
                  {extras?.pointsError && (
                    <p role="alert" className="mb-2 text-xs text-amber-800">
                      No pudimos cargar los puntos de la curva manual, así que el gráfico muestra la recta lineal.{' '}
                      {extras.pointsError}
                    </p>
                  )}
                  <MetricChart
                    series={seriesForIndicator(chart.data.series, indicator, targetPoints, chart.data.metric.period, contributions)}
                    expectedLabel={`${LABELS.expectedCurve} (${curve.label.toLowerCase()})`}
                    unit={indicator.unit}
                    baselineValue={indicator.baselineValue}
                    targetValue={indicator.targetValue}
                    periodStartsAt={chart.data.metric.period.startsAt}
                    periodEndsAt={chart.data.metric.period.endsAt}
                  />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-neutral-700">Historial de cargas</h4>
                  <EntryHistoryTable
                    orgId={orgId}
                    metricId={indicator.metricId}
                    entries={chart.data.entries}
                    projectTitles={projectTitles}
                    unit={indicator.unit}
                    readOnly={readOnly}
                  />
                </div>
              </div>
              <div className="lg:col-span-1">
                <EntryFormPanel
                  orgId={orgId}
                  metricId={indicator.metricId}
                  buckets={chart.data.metric.buckets}
                  readOnly={readOnly}
                />
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
