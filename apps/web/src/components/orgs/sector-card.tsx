'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationSector } from '@gestion-publica/shared-types/core';
import { Button } from '@/components/ui/button';
import { SECTOR_FIELD_LABELS, SECTOR_LABELS } from '@/lib/labels';
import { updateOrganizationSectorAction } from './actions';
import { SectorSelect } from './sector-select';

interface Props {
  orgId: string;
  sector: OrganizationSector;
  /** Solo el superadmin puede cambiar la terminología (ADR-0011 D2). */
  canEdit: boolean;
}

/** Tarjeta "Terminología" de Configuración → General. */
export function SectorCard({ orgId, sector, canEdit }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<OrganizationSector>(sector);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateOrganizationSectorAction(orgId, value);
    setSaving(false);
    if (result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setMessage({ type: 'success', text: SECTOR_FIELD_LABELS.saved });
    // Re-renderiza los Server Components con el diccionario nuevo; el provider lo toma de /me.
    router.refresh();
  }

  return (
    <section
      className="bg-white rounded-xl border border-neutral-200/60 shadow-sm p-6 space-y-4"
      aria-labelledby="sector-card-title"
    >
      <h2 id="sector-card-title" className="text-lg font-semibold text-neutral-900">
        {SECTOR_FIELD_LABELS.title}
      </h2>
      {canEdit ? (
        <>
          <SectorSelect id="org-sector" value={value} onChange={setValue} disabled={saving} />
          <p className="text-sm text-neutral-600">{SECTOR_FIELD_LABELS.warning}</p>
          {message && (
            <p
              role={message.type === 'error' ? 'alert' : 'status'}
              className={`text-sm ${message.type === 'error' ? 'text-red-700' : 'text-green-700'}`}
            >
              {message.text}
            </p>
          )}
          <Button type="button" onClick={handleSave} disabled={saving || value === sector}>
            {saving ? SECTOR_FIELD_LABELS.saving : SECTOR_FIELD_LABELS.save}
          </Button>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-neutral-800">{SECTOR_FIELD_LABELS.readOnly(SECTOR_LABELS[sector])}</p>
          <p className="text-xs text-neutral-500">{SECTOR_FIELD_LABELS.readOnlyHint}</p>
        </div>
      )}
    </section>
  );
}
