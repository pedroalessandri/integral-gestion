import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { auth0 } from '@/lib/auth0';
import { apiFetch } from '@/lib/api-client';
import type { MeDto } from '@gestion-publica/shared-types/core';
import { ModuleChip } from './module-chip';

interface ModuleCatalogEntry {
  key: string;
  name: string;
  description: string | null;
}

async function fetchJson<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await apiFetch(path);
    if (!res.ok) return { data: null, error: `API ${path} → ${res.status}` };
    return { data: (await res.json()) as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error desconocido',
    };
  }
}

export default async function DashboardPage() {
  const session = await auth0.getSession();
  if (!session) redirect('/auth/login');

  const [meResult, catalogResult] = await Promise.all([
    fetchJson<MeDto>('/api/v1/me'),
    fetchJson<ModuleCatalogEntry[]>('/api/v1/modules'),
  ]);

  const errors = [meResult.error, catalogResult.error].filter(
    (e): e is string => e !== null,
  );

  const me = meResult.data;
  const catalog = catalogResult.data ?? [];
  const catalogByKey = new Map(catalog.map((m) => [m.key, m]));

  const greetingName =
    me?.displayName?.trim() ||
    session.user.name ||
    session.user.email ||
    'sin nombre';

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--color-neutral-900)' }}
        >
          Inicio
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
          Bienvenido, {greetingName}.
        </p>
      </header>

      {errors.length > 0 && (
        <div
          className="rounded-lg border p-4"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>
            No se pudo cargar el hub:
          </p>
          <ul
            className="mt-1 text-xs font-mono space-y-0.5"
            style={{ color: '#b91c1c' }}
          >
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {me && me.orgs.length === 0 && (
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: 'white',
            border: '1px solid var(--color-neutral-200)',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Todavía no perteneces a ninguna organización
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--color-neutral-600)' }}
          >
            Pedile al administrador que te invite. Una vez agregado, vas a
            ver acá las organizaciones y los módulos habilitados en cada una.
          </p>
        </div>
      )}

      {me && me.orgs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Tus organizaciones
            </h2>
            {me.isSuperadmin && (
              <Badge
                variant="secondary"
                className="text-xs"
                style={{
                  backgroundColor: 'var(--color-primary-50)',
                  color: 'var(--color-primary-700)',
                  border: '1px solid var(--color-primary-100)',
                }}
              >
                Superadmin · viendo todas las orgs
              </Badge>
            )}
          </div>
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
                <TableRow>
                  <TableHead>Organización</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Módulos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {me.orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div
                        className="font-medium"
                        style={{ color: 'var(--color-neutral-900)' }}
                      >
                        {org.name}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: 'var(--color-neutral-500)' }}
                      >
                        {org.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: 'var(--color-neutral-200)',
                          color: 'var(--color-neutral-700)',
                        }}
                      >
                        {org.role.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {org.enabledModules.length === 0 ? (
                        <span
                          className="text-xs italic"
                          style={{ color: 'var(--color-neutral-500)' }}
                        >
                          Sin módulos habilitados
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {org.enabledModules.map((key) => (
                            <ModuleChip
                              key={key}
                              orgId={org.id}
                              moduleKey={key}
                              moduleName={catalogByKey.get(key)?.name ?? key}
                            />
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
