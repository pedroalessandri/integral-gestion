import { Building2, Trash2, CalendarDays, Users, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateOrgButton } from '@/components/orgs/create-org-button';
import { EmptyState } from '@/components/empty-state';

interface OrgItem {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default async function OrgsPage() {
  const res = await apiFetch('/api/v1/orgs');
  let orgs: OrgItem[] = [];
  let error: string | null = null;

  if (!res.ok) {
    error = `Error ${res.status}: ${await res.text()}`;
  } else {
    const data = await res.json();
    orgs = data.items ?? [];
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Organizaciones
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            Gestioná las organizaciones del sistema
          </p>
        </div>
        <CreateOrgButton />
      </div>

      {error ? (
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: '#fef2f2',
            borderColor: '#fecaca',
          }}
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
                  Nombre
                </TableHead>
                <TableHead
                  className="text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Slug
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
                  Creada
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
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Building2}
                      title="No hay organizaciones todavía"
                      description="Creá la primera organización para empezar a gestionar objetivos."
                      action={<CreateOrgButton />}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow
                    key={org.id}
                    style={{ borderColor: 'var(--color-neutral-100)', transition: 'background-color 150ms ease' }}
                    className="hover:bg-neutral-50"
                  >
                    <TableCell className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                      {org.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs" style={{ color: 'var(--color-neutral-500)' }}>
                      {org.slug}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={org.status === 'active' ? 'default' : 'secondary'}
                        style={
                          org.status === 'active'
                            ? {
                                backgroundColor: 'var(--color-primary-50)',
                                color: 'var(--color-primary-700)',
                                border: '1px solid var(--color-primary-100)',
                              }
                            : undefined
                        }
                      >
                        {org.status === 'active' ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
                      {new Date(org.createdAt).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orgs/${org.id}/members`} aria-label={`Miembros de ${org.name}`}>
                            <Users className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orgs/${org.id}/periods`} aria-label={`Ver períodos de ${org.name}`}>
                            <CalendarDays className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orgs/${org.id}/trash`} aria-label={`Papelera de ${org.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orgs/${org.id}/settings`} aria-label={`Configuración de ${org.name}`}>
                            <Settings2 className="h-4 w-4" />
                          </Link>
                        </Button>
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
