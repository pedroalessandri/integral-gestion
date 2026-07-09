import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { getActiveOrgId } from '@/lib/active-org';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { MetricChart } from '@/components/metrics/metric-chart';
import { EntryFormPanel } from '@/components/metrics/entry-form-panel';
import { EntryHistoryTable } from '@/components/metrics/entry-history-table';
import { formatMetricValue, directionGoalLabel, FREQUENCY_LABELS } from '@/components/metrics/format';
import type {
  MetricDetailDto,
  MetricSeriesDto,
  MetricEntryDto,
} from '@gestion-publica/shared-types/metrics';

export default async function MetricDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border p-6" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#78350f' }}>
            Seleccioná una organización
          </h2>
        </div>
      </div>
    );
  }

  const [metricRes, seriesRes, entriesRes] = await Promise.all([
    apiFetch(`/api/v1/metrics/${id}`, { orgId }),
    apiFetch(`/api/v1/metrics/${id}/series`, { orgId }),
    apiFetch(`/api/v1/metrics/${id}/entries`, { orgId }),
  ]);

  if (metricRes.status === 404) notFound();
  if (!metricRes.ok) {
    return (
      <div className="max-w-3xl rounded-xl border p-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
        <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>
          Error {metricRes.status}: {await metricRes.text()}
        </p>
      </div>
    );
  }

  const metric = (await metricRes.json()) as MetricDetailDto;
  const series = seriesRes.ok ? ((await seriesRes.json()) as MetricSeriesDto) : null;
  const entriesData: unknown = entriesRes.ok ? await entriesRes.json() : { items: [] };
  const entries = Array.isArray(entriesData)
    ? (entriesData as MetricEntryDto[])
    : ((entriesData as { items?: MetricEntryDto[] }).items ?? []);

  const readOnly = metric.period.status !== 'open';
  const deviation = series?.summary.deviationPct ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1.5 text-sm"
        style={{ color: 'var(--color-neutral-500)' }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Indicadores
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-neutral-900)' }}>
            {metric.name}
          </h1>
          {readOnly && (
            <Badge variant="outline" className="text-xs flex items-center gap-1" style={{ borderColor: '#e5e7eb', color: '#6b7280', backgroundColor: '#f9fafb' }}>
              <Lock className="h-3 w-3" aria-hidden="true" />
              Solo lectura
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs" style={{ borderColor: '#fde68a', color: '#92400e', backgroundColor: '#fffbeb' }}>
            {directionGoalLabel(metric.targetValue, metric.unit, metric.direction)}
          </Badge>
          <Badge variant="outline" className="text-xs" style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}>
            {FREQUENCY_LABELS[metric.frequency]}
          </Badge>
          <Badge variant="outline" className="text-xs" style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}>
            Período {metric.period.code}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column: chart + summary + history */}
        <div className="lg:col-span-2 space-y-6">
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'white', borderColor: 'var(--color-neutral-200)', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
          >
            {series && series.expected.length > 0 ? (
              <MetricChart
                series={series}
                unit={metric.unit}
                baselineValue={metric.baselineValue}
                targetValue={metric.targetValue}
                periodStartsAt={metric.period.startsAt}
                periodEndsAt={metric.period.endsAt}
              />
            ) : (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--color-neutral-400)' }}>
                No se pudo cargar la serie del indicador.
              </p>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--color-neutral-100)' }}>
              <Stat label="Acumulado" value={formatMetricValue(series?.summary.cumulative ?? metric.lastValue, metric.unit)} />
              <Stat label="Esperado a hoy" value={formatMetricValue(series?.summary.expectedToDate ?? metric.expectedToDate, metric.unit)} />
              <Stat
                label="Desvío"
                value={`${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%`}
                valueColor={deviation < 0 ? '#dc2626' : deviation > 0 ? '#059669' : 'var(--color-neutral-900)'}
              />
            </div>
          </div>

          {/* History */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-neutral-700)' }}>
              Historial de cargas
            </h2>
            <EntryHistoryTable orgId={orgId} metricId={metric.id} entries={entries} unit={metric.unit} readOnly={readOnly} />
          </div>
        </div>

        {/* Sidebar: load panel */}
        <div className="lg:col-span-1">
          <EntryFormPanel orgId={orgId} metricId={metric.id} buckets={metric.buckets} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-neutral-400)' }}>
        {label}
      </p>
      <p className="text-lg font-semibold font-mono mt-0.5" style={{ color: valueColor ?? 'var(--color-neutral-900)' }}>
        {value}
      </p>
    </div>
  );
}
