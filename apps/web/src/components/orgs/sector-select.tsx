'use client';

import { ORGANIZATION_SECTORS, type OrganizationSector } from '@gestion-publica/shared-types/core';
import { Label } from '@/components/ui/label';
import { SECTOR_FIELD_LABELS, SECTOR_LABELS } from '@/lib/labels';

interface Props {
  id: string;
  value: OrganizationSector;
  onChange: (sector: OrganizationSector) => void;
  disabled?: boolean;
}

/** Selector de terminología (sector) de la organización. Solo lo muestran los flujos de superadmin. */
export function SectorSelect({ id, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{SECTOR_FIELD_LABELS.field}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as OrganizationSector)}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        {ORGANIZATION_SECTORS.map((s) => (
          <option key={s} value={s}>
            {SECTOR_LABELS[s]}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{SECTOR_FIELD_LABELS.hint}</p>
    </div>
  );
}
