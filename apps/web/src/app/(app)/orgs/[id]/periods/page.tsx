import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { listPeriodsAction, type PeriodItem } from '@/components/objectives/actions';
import { ActivatePeriodButton } from '@/components/periods/activate-period-button';
import { DeletePeriodButton } from '@/components/periods/delete-period-button';
import { apiFetch } from '@/lib/api-client';
import Link from 'next/link';

interface PeriodsPageProps {
  params: Promise<{ id: string }>;
}

interface MeResponse {
  isSuperadmin: boolean;
}

export default async function PeriodsPage({ params }: PeriodsPageProps) {
  const { id: orgId } = await params;

  const [result, meRes] = await Promise.all([
    listPeriodsAction({ orgId }),
    apiFetch('/api/v1/me').catch(() => null),
  ]);

  const periods: PeriodItem[] = result.periods ?? [];
  const error = result.error ?? null;

  let isSuperadmin = false;
  if (meRes?.ok) {
    const meData = await meRes.json() as MeResponse;
    isSuperadmin = meData.isSuperadmin;
  }

  const hasOpenPeriod = periods.some((p) => p.status === 'open');

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Períodos
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            Períodos de la organización
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperadmin && !hasOpenPeriod && (
            <Button size="sm" asChild>
              <Link href={`/orgs/${orgId}/periods/new`}>+ Crear período</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/orgs">← Volver a organizaciones</Link>
          </Button>
        </div>
      </div>

      {error ? (
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
                  Código
                </TableHead>
                <TableHead
                  className="text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Estado
                </TableHead>
                <TableHead
                  className="text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Inicio – Fin
                </TableHead>
                <TableHead
                  className="w-48 text-right text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={CalendarDays}
                      title="Sin períodos registrados"
                      description="Esta organización no tiene períodos creados todavía."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((period) => (
                  <TableRow
                    key={period.id}
                    style={{ borderColor: 'var(--color-neutral-100)', transition: 'background-color 150ms ease' }}
                    className="hover:bg-neutral-50"
                  >
                    <TableCell className="font-mono font-medium text-sm" style={{ color: 'var(--color-neutral-900)' }}>
                      {period.code}
                    </TableCell>
                    <TableCell>
                      <PeriodStatusBadge status={period.status} />
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                      {new Date(period.startsAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(period.endsAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSuperadmin && period.status === 'future' && (
                          <ActivatePeriodButton
                            orgId={orgId}
                            periodId={period.id}
                            periodCode={period.code}
                          />
                        )}
                        {isSuperadmin && (
                          <DeletePeriodButton
                            orgId={orgId}
                            periodId={period.id}
                            periodCode={period.code}
                          />
                        )}
                      </div>
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

function PeriodStatusBadge({ status }: { status: PeriodItem['status'] }) {
  if (status === 'open') {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 w-fit text-xs font-medium"
        style={{ borderColor: '#a7f3d0', color: '#065f46', backgroundColor: '#ecfdf5' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: '#10b981' }}
          aria-hidden="true"
        />
        Abierto
      </Badge>
    );
  }

  if (status === 'future') {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 w-fit text-xs font-medium"
        style={{ borderColor: '#bfdbfe', color: '#1e40af', backgroundColor: '#eff6ff' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: '#3b82f6' }}
          aria-hidden="true"
        />
        Futuro
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1.5 w-fit text-xs font-medium"
      style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-500)', backgroundColor: 'var(--color-neutral-50)' }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: 'var(--color-neutral-400)' }}
        aria-hidden="true"
      />
      Cerrado
    </Badge>
  );
}
