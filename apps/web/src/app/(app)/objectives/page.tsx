import { Target, Calendar, CalendarDays, History, BarChart2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { getActiveOrgId } from '@/lib/active-org';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateObjectiveButton } from '@/components/objectives/create-objective-button';
import { ObjectiveRowActions } from '@/components/objectives/objective-row-actions';
import { OwnerPill } from '@/components/objectives/owner-pill';
import { EmptyState } from '@/components/empty-state';
import { ClosePeriodButton } from '@/components/periods/close-period-button';
import { PeriodSelector } from '@/components/periods/period-selector';
import { listPeriodsAction, getAiStatusAction, type PeriodItem } from '@/components/objectives/actions';
import Link from 'next/link';
import type { OwnerSummaryDto } from '@gestion-publica/shared-types/okr';

interface ObjectiveItem {
  id: string;
  title: string;
  description?: string | null;
  progressCachedBp: number;
  createdAt: string;
  owner: OwnerSummaryDto | null;
  period: {
    id: string;
    code: string;
    status: 'open' | 'closed' | 'future';
  };
}

interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  orgs: Array<{ id: string; slug: string; name: string }>;
}

export default async function ObjectivesPage({
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
            Para ver y crear objetivos, primero elegí una organización activa en el selector de arriba.
          </p>
        </div>
      </div>
    );
  }

  // Resolve periods first so we can determine target period before fetching objectives
  const periodsResult = await listPeriodsAction({ orgId });
  const periods = periodsResult.periods ?? [];
  const openPeriod: PeriodItem | undefined = periods.find((p) => p.status === 'open');
  const closedPeriods = periods.filter((p) => p.status === 'closed');

  // Determine which period to view
  const targetPeriodId: string | undefined =
    overridePeriodId ?? openPeriod?.id ?? closedPeriods[0]?.id;

  const isHistoricalView =
    overridePeriodId !== undefined &&
    overridePeriodId !== openPeriod?.id;

  const targetPeriod: PeriodItem | undefined = targetPeriodId
    ? periods.find((p) => p.id === targetPeriodId)
    : undefined;

  const noActivePeriod = periods.length === 0 || (!openPeriod && !overridePeriodId);

  // Build objectives URL with optional periodId filter
  const objectivesUrl = targetPeriodId
    ? `/api/v1/okr/objectives?periodId=${targetPeriodId}`
    : '/api/v1/okr/objectives';

  // Fetch objectives, me, and AI status in parallel
  const [objectivesRes, meRes, aiStatus] = await Promise.all([
    apiFetch(objectivesUrl, { orgId }),
    apiFetch('/api/v1/me'),
    getAiStatusAction(orgId),
  ]);

  let objectives: ObjectiveItem[] = [];
  let error: string | null = null;
  let isSuperadmin = false;
  let currentUserId: string | null = null;

  if (!objectivesRes.ok) {
    error = `Error ${objectivesRes.status}: ${await objectivesRes.text()}`;
  } else {
    const data: unknown = await objectivesRes.json();
    objectives = Array.isArray(data)
      ? (data as ObjectiveItem[])
      : ((data as { items?: ObjectiveItem[] }).items ?? []);
  }

  if (meRes.ok) {
    const meData = await meRes.json() as MeResponse;
    isSuperadmin = meData.isSuperadmin;
    currentUserId = meData.userId;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              Objetivos
            </h1>
            <PeriodBadge period={targetPeriod ?? openPeriod} isHistorical={isHistoricalView} />
            <PeriodSelector periods={periods} currentPeriodId={targetPeriodId} baseHref="/objectives" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
              {targetPeriod
                ? `Período ${targetPeriod.code} · ${formatDateRange(targetPeriod.startsAt, targetPeriod.endsAt)}`
                : openPeriod
                ? `Período ${openPeriod.code} · ${formatDateRange(openPeriod.startsAt, openPeriod.endsAt)}`
                : 'Sin período abierto'}
            </p>
            {orgId && (
              <Link
                href={`/orgs/${orgId}/periods`}
                className="text-xs underline underline-offset-2"
                style={{ color: 'var(--color-primary-600)' }}
              >
                Ver períodos →
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/objectives/executive${targetPeriodId ? `?periodId=${targetPeriodId}` : ''}`}>
              <BarChart2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Vista Gantt
            </Link>
          </Button>
          {isSuperadmin && openPeriod && (
            <ClosePeriodButton orgId={orgId} periodId={openPeriod.id} openPeriodCode={openPeriod.code} />
          )}
          <CreateObjectiveButton
            orgId={orgId}
            disabled={isHistoricalView || !openPeriod}
            disabledTooltip="Solo se pueden crear objetivos en el período abierto."
            aiEnabled={aiStatus.enabled}
            defaultOwnerUserId={currentUserId}
          />
        </div>
      </div>

      {/* Historical period notice */}
      {isHistoricalView && openPeriod && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
          style={{ backgroundColor: '#fefce8', borderColor: '#fde68a' }}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 shrink-0" style={{ color: '#92400e' }} aria-hidden="true" />
            <p className="text-sm" style={{ color: '#78350f' }}>
              Viendo período histórico — sólo lectura
            </p>
          </div>
          <Link
            href="/objectives"
            className="text-sm font-medium underline underline-offset-2 whitespace-nowrap"
            style={{ color: '#92400e' }}
          >
            Ir al período abierto →
          </Link>
        </div>
      )}

      {noActivePeriod && !error ? (
        <NoPeriodEmptyState orgId={orgId} isSuperadmin={isSuperadmin} closedPeriods={closedPeriods} />
      ) : error ? (
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>{error}</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'white',
            border: '1px solid var(--color-neutral-200)',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
          }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'var(--color-neutral-200)' }}>
                <TableHead
                  className="text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Título
                </TableHead>
                <TableHead
                  className="w-36 text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Responsable
                </TableHead>
                <TableHead
                  className="w-40 text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Progreso
                </TableHead>
                <TableHead
                  className="w-32 text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Creado
                </TableHead>
                <TableHead
                  className="w-32 text-right text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objectives.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Target}
                      title="Sin objetivos este período"
                      description="Los objetivos te ayudan a medir avances concretos del equipo."
                      action={
                        !isHistoricalView && openPeriod ? (
                          <CreateObjectiveButton
                            orgId={orgId}
                            aiEnabled={aiStatus.enabled}
                            defaultOwnerUserId={currentUserId}
                          />
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                objectives.map((obj) => {
                  const rowIsReadOnly = obj.period.status !== 'open';
                  return (
                    <TableRow
                      key={obj.id}
                      style={{ borderColor: 'var(--color-neutral-100)', transition: 'background-color 150ms ease' }}
                      className="hover:bg-neutral-50"
                    >
                      <TableCell className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                        {obj.title}
                      </TableCell>
                      <TableCell>
                        <OwnerPill owner={obj.owner} size="sm" />
                      </TableCell>
                      <TableCell>
                        <ProgressBar valueBp={obj.progressCachedBp} />
                      </TableCell>
                      <TableCell className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                        {new Date(obj.createdAt).toLocaleDateString('es-AR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="link" size="sm" asChild>
                            <Link href={`/objectives/${obj.id}`}>Ver detalle →</Link>
                          </Button>
                          {!rowIsReadOnly && (
                            <ObjectiveRowActions
                              orgId={orgId}
                              objective={{
                                id: obj.id,
                                title: obj.title,
                                description: obj.description,
                                ownerUserId: obj.owner?.id ?? null,
                              }}
                              aiEnabled={aiStatus.enabled}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PeriodBadge({
  period,
  isHistorical,
}: {
  period: PeriodItem | undefined;
  isHistorical: boolean;
}) {
  if (!period) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ borderColor: '#fde68a', color: '#92400e', backgroundColor: '#fffbeb' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: '#f59e0b' }}
          aria-hidden="true"
        />
        Sin período abierto
      </Badge>
    );
  }

  if (isHistorical) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ borderColor: '#e5e7eb', color: '#6b7280', backgroundColor: '#f9fafb' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: '#9ca3af' }}
          aria-hidden="true"
        />
        <Calendar className="h-3 w-3" aria-hidden="true" />
        {period.code}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ borderColor: '#a7f3d0', color: '#065f46', backgroundColor: '#ecfdf5' }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: '#10b981' }}
        aria-hidden="true"
      />
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {period.code}
    </Badge>
  );
}


function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
  const end = new Date(endsAt).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
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
          Para cargar y hacer seguimiento de objetivos, necesitás un período abierto.
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

function ProgressBar({ valueBp }: { valueBp: number }) {
  const pct = valueBp / 100;
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full h-2"
        style={{ backgroundColor: 'var(--color-neutral-200)' }}
      >
        <div
          className="h-2 rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: 'linear-gradient(to right, var(--color-primary-500), var(--color-primary-600))',
            transition: 'width 500ms ease',
          }}
        />
      </div>
      <span
        className="text-xs font-mono w-12 text-right"
        style={{ color: 'var(--color-neutral-500)' }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
