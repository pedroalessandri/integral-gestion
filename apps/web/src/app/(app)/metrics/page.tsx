import Link from 'next/link';
import { BarChart3, TrendingUp, TrendingDown, Gauge } from 'lucide-react';
import { getActiveOrgId } from '@/lib/active-org';
import { apiFetch } from '@/lib/api-client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { MetricFilters } from '@/components/metrics/metric-filters';
import { MetricFormDialog } from '@/components/metrics/metric-form-dialog';
import { MetricRowActions } from '@/components/metrics/metric-row-actions';
import { listMetricsAction } from '@/components/metrics/actions';
import { formatMetricValue, directionGoalLabel, FREQUENCY_LABELS } from '@/components/metrics/format';
import type { MetricFrequency } from '@gestion-publica/shared-types/metrics';

interface PeriodItem {
  id: string;
  status: 'open' | 'closed' | 'future';
}

function parseFrequency(v: string | undefined): MetricFrequency | undefined {
  return v === 'weekly' || v === 'biweekly' || v === 'monthly' ? v : undefined;
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ frequency?: string; linked?: string }>;
}) {
  const orgId = await getActiveOrgId();
  const { frequency: freqParam, linked } = await searchParams;

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border p-6" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#78350f' }}>
            Seleccioná una organización
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#92400e' }}>
            Para ver los indicadores de gestión, primero elegí una organización activa en el selector de arriba.
          </p>
        </div>
      </div>
    );
  }

  const frequency = parseFrequency(freqParam);
  const [metricsResult, periodsRes] = await Promise.all([
    listMetricsAction({ orgId, frequency }),
    apiFetch(`/api/v1/orgs/${orgId}/periods`, { orgId }),
  ]);

  let openPeriodExists = false;
  if (periodsRes.ok) {
    const data: unknown = await periodsRes.json();
    const periods = Array.isArray(data) ? (data as PeriodItem[]) : ((data as { items?: PeriodItem[] }).items ?? []);
    openPeriodExists = periods.some((p) => p.status === 'open');
  }

  const error = metricsResult.error ?? null;
  let metrics = metricsResult.metrics ?? [];
  if (linked === 'okr') metrics = metrics.filter((m) => m.linkedKrCount > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-neutral-900)' }}>
            Indicadores de gestión
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            Seguimiento de métricas del período: avance real contra la curva esperada.
          </p>
        </div>
        <MetricFormDialog orgId={orgId} />
      </div>

      <MetricFilters />

      {error ? (
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'white', border: '1px solid var(--color-neutral-200)', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'var(--color-neutral-200)' }}>
                <Th>Indicador</Th>
                <Th className="w-28">Frecuencia</Th>
                <Th className="w-48">Meta del período</Th>
                <Th className="w-32">Último valor</Th>
                <Th className="w-44">Avance</Th>
                <Th className="w-20">Vínculos</Th>
                <Th className="w-12 text-right">{''}</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={BarChart3}
                      title={
                        linked === 'okr'
                          ? 'Sin indicadores vinculados a OKRs'
                          : frequency
                          ? 'Sin indicadores con esa frecuencia'
                          : 'Todavía no hay indicadores'
                      }
                      description={
                        linked === 'okr'
                          ? 'Los vínculos con Key Results se habilitan con el módulo "Indicadores en OKRs".'
                          : openPeriodExists
                          ? 'Creá tu primer indicador para empezar a cargar avances y ver el esperado vs. real.'
                          : 'Necesitás un período abierto para crear indicadores. Pedí a un admin que abra uno.'
                      }
                      action={
                        openPeriodExists && linked !== 'okr' ? <MetricFormDialog orgId={orgId} /> : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                metrics.map((m) => (
                  <TableRow
                    key={m.id}
                    className="hover:bg-neutral-50"
                    style={{ borderColor: 'var(--color-neutral-100)', transition: 'background-color 150ms ease' }}
                  >
                    <TableCell>
                      <Link
                        href={`/metrics/${m.id}`}
                        className="font-medium hover:underline"
                        style={{ color: 'var(--color-neutral-900)' }}
                      >
                        {m.name}
                      </Link>
                      <div className="text-xs" style={{ color: 'var(--color-neutral-400)' }}>
                        {m.unit === 'percent' ? 'Porcentaje' : m.unit === 'currency' ? 'Moneda' : 'Número'}
                        {m.period.status !== 'open' && ' · período cerrado'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>
                      {FREQUENCY_LABELS[m.frequency]}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
                        {m.direction === 'increasing' ? (
                          <TrendingUp className="h-3.5 w-3.5" style={{ color: '#059669' }} aria-hidden="true" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" style={{ color: '#0284c7' }} aria-hidden="true" />
                        )}
                        {directionGoalLabel(m.targetValue, m.unit, m.direction)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono" style={{ color: 'var(--color-neutral-900)' }}>
                      {formatMetricValue(m.lastValue, m.unit)}
                    </TableCell>
                    <TableCell>
                      <MiniProgress pct={m.progressPct} />
                    </TableCell>
                    <TableCell>
                      {m.linkedKrCount > 0 ? (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: '#c7d2fe', color: '#4338ca', backgroundColor: '#eef2ff' }}>
                          OKR
                        </Badge>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--color-neutral-300)' }}>
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.period.status === 'open' ? (
                        <MetricRowActions
                          orgId={orgId}
                          metric={{
                            id: m.id,
                            name: m.name,
                            unit: m.unit,
                            direction: m.direction,
                            frequency: m.frequency,
                            baselineValue: m.baselineValue,
                            targetValue: m.targetValue,
                          }}
                        />
                      ) : (
                        <Gauge className="h-4 w-4 inline-block" style={{ color: 'var(--color-neutral-300)' }} aria-label="Solo lectura" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead
      className={`text-xs uppercase tracking-wider font-medium ${className ?? ''}`}
      style={{ color: 'var(--color-neutral-500)' }}
    >
      {children}
    </TableHead>
  );
}

function MiniProgress({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: 'var(--color-neutral-200)' }}>
        <div
          className="h-1.5 rounded-full"
          style={{
            width: `${clamped}%`,
            background: 'linear-gradient(to right, var(--color-primary-500), var(--color-primary-600))',
            transition: 'width 500ms ease',
          }}
        />
      </div>
      <span className="text-xs font-mono w-9 text-right" style={{ color: 'var(--color-neutral-500)' }}>
        {clamped}%
      </span>
    </div>
  );
}
