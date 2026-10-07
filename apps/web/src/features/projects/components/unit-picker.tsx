'use client';

import { ORG_UNIT_KIND_LABELS, LABELS } from '@/lib/labels';
import { useProjectUnits } from '../useProjectUnits';

interface Props {
  id?: string;
  orgId: string;
  /** Unidad del objetivo: las opciones son ella y sus descendientes. */
  objectiveUnitId: string | null;
  value: string | null;
  onChange: (unitId: string | null) => void;
}

export function UnitPicker({ id, orgId, objectiveUnitId, value, onChange }: Props) {
  const { units, loading, error } = useProjectUnits(orgId, objectiveUnitId);
  return (
    <div className="space-y-1">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading || units.length === 0}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        {units.map((u, i) => (
          <option key={u.node.id} value={u.node.id}>
            {'— '.repeat(i === 0 ? 0 : Math.max(1, u.depth - (units[0]?.depth ?? u.depth)))}
            {u.node.name} ({ORG_UNIT_KIND_LABELS[u.node.kind]})
          </option>
        ))}
      </select>
      <p className="text-xs text-neutral-500">
        Por defecto, la {LABELS.unit.singular.toLowerCase()} del objetivo; también podés elegir una dependiente.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
