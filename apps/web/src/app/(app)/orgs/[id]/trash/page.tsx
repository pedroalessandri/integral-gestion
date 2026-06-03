// TODO(Gaps 4): The API does not yet expose an endpoint to list soft-deleted entities.
// All list endpoints filter by deletedAt: null internally.
// Wire this page to real data once the API adds ?includeDeleted=true support.

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { EmptyState } from '@/components/empty-state';

interface Org {
  id: string;
  name: string;
}

export default async function OrgTrashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;

  // Attempt to load org name for the breadcrumb
  let orgName = orgId;
  try {
    const res = await apiFetch(`/api/v1/orgs/${orgId}`);
    if (res.ok) {
      const org: Org = await res.json();
      orgName = org.name;
    }
  } catch {
    // ignore — orgId as fallback
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/orgs"
          className="text-sm font-medium"
          style={{ color: 'var(--color-primary-600)', transition: 'color 150ms ease' }}
        >
          ← Volver a organizaciones
        </Link>
        <div className="mt-3 space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Papelera — {orgName}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            Elementos eliminados de esta organización
          </p>
        </div>
      </div>

      {/* Placeholder — API does not expose deleted list yet */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'white',
          border: '1px solid var(--color-neutral-200)',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)',
        }}
      >
        <EmptyState
          icon={Trash2}
          title="Papelera no disponible todavía"
          description="La API aún no expone un listado de elementos eliminados. Estará disponible en una próxima versión."
        />
      </div>
    </div>
  );
}
