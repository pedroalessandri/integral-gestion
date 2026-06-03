import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { listMembersAction } from '@/components/members/actions';
import { InviteMemberButton } from '@/components/members/invite-member-button';
import { MemberRowActions } from '@/components/members/member-row-actions';

interface MembersPageProps {
  params: Promise<{ id: string }>;
}

const ROLE_COLORS: Record<string, string> = {
  'org-admin': 'bg-purple-100 text-purple-800',
  'org-user': 'bg-blue-100 text-blue-800',
  'org-reader': 'bg-neutral-100 text-neutral-700',
};

export default async function MembersPage({ params }: MembersPageProps) {
  const { id: orgId } = await params;

  const orgRes = await apiFetch(`/api/v1/orgs/${orgId}`);
  if (orgRes.status === 404) notFound();
  const org = orgRes.ok ? (await orgRes.json() as { name?: string }) : null;

  const { members = [], error } = await listMembersAction({ orgId });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Miembros
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            {org?.name ? (
              <>
                Gestioná quién puede acceder a <strong>{org.name}</strong>
              </>
            ) : (
              'Gestión de miembros de la organización'
            )}
          </p>
        </div>
        <InviteMemberButton orgId={orgId} />
      </div>

      {error ? (
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
        >
          <p className="text-sm font-mono" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay miembros todavía"
          description="Invitá al primer miembro por email para empezar a colaborar."
          action={<InviteMemberButton orgId={orgId} />}
        />
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
                  Miembro
                </TableHead>
                <TableHead
                  className="w-40 text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Rol
                </TableHead>
                <TableHead
                  className="w-36 text-xs uppercase tracking-wider font-medium"
                  style={{ color: 'var(--color-neutral-500)' }}
                >
                  Asignado
                </TableHead>
                <TableHead className="w-16 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow
                  key={m.userId}
                  style={{
                    borderColor: 'var(--color-neutral-100)',
                    transition: 'background-color 150ms ease',
                  }}
                  className="hover:bg-neutral-50"
                >
                  <TableCell>
                    <div>
                      <div
                        className="font-medium"
                        style={{ color: 'var(--color-neutral-900)' }}
                      >
                        {m.displayName}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>
                        {m.email}
                      </div>
                      {m.isPending && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          Invitación pendiente
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_COLORS[m.roleKey] ?? 'bg-gray-100 text-gray-800'}`}
                    >
                      {m.roleName}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>
                    {new Date(m.assignedAt).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <MemberRowActions
                      orgId={orgId}
                      userId={m.userId}
                      displayName={m.displayName}
                      currentRoleKey={m.roleKey}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
