import { Target, Calendar, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { getActiveOrgId } from '@/lib/active-org';
import { listPeriodsAction, type PeriodItem } from '@/components/objectives/actions';
import { PeriodSelector } from '@/components/periods/period-selector';
import { GanttChart } from '@/components/gantt/gantt-chart';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ObjectiveGanttDto } from '@gestion-publica/shared-types/okr';

interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  orgs: Array<{ id: string; slug: string; name: string }>;
}

function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
  const end = new Date(endsAt).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const orgId = await getActiveOrgId();
  const { periodId: overridePeriodId } = await searchParams;

  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: '#78350f' }}>
            Seleccioná una organización
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#92400e' }}>
            Para ver la Vista Ejecutiva, primero elegí una organización activa en el selector de arriba.
          </p>
        </div>
      </div>
    );
  }

  // Fetch periods
  const periodsResult = await listPeriodsAction({ orgId });
  const periods = periodsResult.periods ?? [];

  // Eligible periods: open or closed only (no future)
  const eligible = periods.filter((p) => p.status !== 'future');
  const openPeriod = eligible.find((p) => p.status === 'open');
  const closedPeriods = eligible
    .filter((p) => p.status === 'closed')
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());

  // Determine target period
  let targetPeriodId: string | undefined;

  if (overridePeriodId && eligible.some((p) => p.id === overridePeriodId)) {
    targetPeriodId = overridePeriodId;
  } else if (openPeriod) {
    targetPeriodId = openPeriod.id;
  } else if (closedPeriods[0]) {
    targetPeriodId = closedPeriods[0].id;
  }

  const targetPeriod: PeriodItem | undefined = targetPeriodId
    ? eligible.find((p) => p.id === targetPeriodId)
    : undefined;

  // No eligible period at all
  if (!targetPeriodId || !targetPeriod) {
    return (
      <div className="space-y-6">
        <PageHeader periods={eligible} targetPeriod={undefined} targetPeriodId={undefined} />
        <NoPeriodEmptyState orgId={orgId} isSuperadmin={false} closedPeriods={closedPeriods} />
      </div>
    );
  }

  // Fetch gantt data and /me in parallel
  const [ganttRes, meRes] = await Promise.all([
    apiFetch(`/api/v1/okr/objectives/gantt?periodId=${targetPeriodId}`, { orgId }),
    apiFetch('/api/v1/me'),
  ]);

  let isSuperadmin = false;
  if (meRes.ok) {
    const meData = (await meRes.json()) as MeResponse;
    isSuperadmin = meData.isSuperadmin;
  }

  if (!ganttRes.ok) {
    const errorText = await ganttRes.text();
    return (
      <div className="space-y-6">
        <PageHeader periods={eligible} targetPeriod={targetPeriod} targetPeriodId={targetPeriodId} />
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>
            Error {ganttRes.status}: {errorText}
          </p>
        </div>
      </div>
    );
  }

  const rawData: unknown = await ganttRes.json();
  const objectives = Array.isArray(rawData) ? (rawData as ObjectiveGanttDto[]) : [];

  // Empty state: no objectives
  if (objectives.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader periods={eligible} targetPeriod={targetPeriod} targetPeriodId={targetPeriodId} />
        <div
          className="rounded-xl border"
          style={{
            backgroundColor: 'white',
            borderColor: 'var(--color-neutral-200)',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
          }}
        >
          <EmptyState
            icon={Target}
            title="Sin objetivos en este período"
            description="Creá objetivos en la lista para verlos aquí."
            action={
              <Button asChild>
                <Link href="/objectives">Ir a lista de objetivos</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader periods={eligible} targetPeriod={targetPeriod} targetPeriodId={targetPeriodId} />

      {/* Subtitle */}
      <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
        Período {targetPeriod.code} · {formatDateRange(targetPeriod.startsAt, targetPeriod.endsAt)}
      </p>

      {/* Gantt chart */}
      <GanttChart
        periodStartsAt={targetPeriod.startsAt}
        periodEndsAt={targetPeriod.endsAt}
        objectives={objectives}
      />

      {/* Mobile fallback */}
      <div
        className="md:hidden rounded-xl border p-6 text-center"
        style={{ backgroundColor: 'var(--color-neutral-50)', borderColor: 'var(--color-neutral-200)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
          Esta vista está optimizada para pantallas grandes.{' '}
          <Link
            href="/objectives"
            style={{ color: 'var(--color-primary-600)' }}
            className="underline underline-offset-2"
          >
            Ir a la lista estándar →
          </Link>
        </p>
      </div>
    </div>
  );
}

function PageHeader({
  periods,
  targetPeriod,
  targetPeriodId,
}: {
  periods: PeriodItem[];
  targetPeriod: PeriodItem | undefined;
  targetPeriodId: string | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Objetivos — Vista Ejecutiva
          </h1>
          {targetPeriod && (
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 text-xs font-medium"
              style={
                targetPeriod.status === 'open'
                  ? { borderColor: '#a7f3d0', color: '#065f46', backgroundColor: '#ecfdf5' }
                  : { borderColor: '#e5e7eb', color: '#6b7280', backgroundColor: '#f9fafb' }
              }
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: targetPeriod.status === 'open' ? '#10b981' : '#9ca3af',
                }}
                aria-hidden="true"
              />
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {targetPeriod.code}
            </Badge>
          )}
          <PeriodSelector
            periods={periods}
            currentPeriodId={targetPeriodId}
            baseHref="/objectives/executive"
            excludeStatuses={['future']}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/objectives"
            className="text-xs underline underline-offset-2"
            style={{ color: 'var(--color-primary-600)' }}
          >
            ← Volver a la lista
          </Link>
        </div>
      </div>
    </div>
  );
}

function NoPeriodEmptyState({
  orgId,
  isSuperadmin,
  closedPeriods,
}: {
  orgId: string;
  isSuperadmin: boolean;
  closedPeriods: PeriodItem[];
}) {
  return (
    <div
      className="rounded-xl border"
      style={{
        backgroundColor: 'white',
        borderColor: 'var(--color-neutral-200)',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: 'var(--color-primary-50)' }}
        >
          <CalendarDays className="w-6 h-6" style={{ color: 'var(--color-primary-600)' }} aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-neutral-900)' }}>
          No hay un período activo
        </h3>
        <p className="text-sm max-w-sm mb-5" style={{ color: 'var(--color-neutral-500)' }}>
          Para ver la Vista Ejecutiva, necesitás un período abierto o cerrado.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {isSuperadmin ? (
            <Button asChild>
              <Link href={`/orgs/${orgId}/periods/new`}>Crear período</Link>
            </Button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
              Pedile a un admin de la organización que cree un nuevo período.
            </p>
          )}
          {closedPeriods.length > 0 && (
            <Link
              href={`/orgs/${orgId}/periods`}
              className="text-sm font-medium underline underline-offset-2"
              style={{ color: 'var(--color-primary-600)' }}
            >
              Ver períodos anteriores →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
