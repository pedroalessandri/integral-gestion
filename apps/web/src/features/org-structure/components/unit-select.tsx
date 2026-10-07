'use client';

import { LABELS, ORG_UNIT_KIND_LABELS } from '@/lib/labels';
import { useAssignableUnits } from '../useAssignableUnits';

interface Props {
  id?: string;
  orgId: string;
  value: string | null;
  onChange: (unitId: string | null) => void;
  /** false cuando el objetivo ya tiene unidad: la API no permite dejarlo sin unidad. */
  allowEmpty?: boolean;
}

/** Selector de unidad para objetivos: solo ministerios y áreas (la central no admite objetivos). */
export function UnitSelect({ id, orgId, value, onChange, allowEmpty = true }: Props) {
  const { units, loading, error } = useAssignableUnits(orgId);

  return (
    <div className="space-y-1">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        {allowEmpty && <option value="">— Sin {LABELS.unit.singular.toLowerCase()} —</option>}
        {units.map((u) => (
          <option key={u.node.id} value={u.node.id}>
            {'— '.repeat(Math.max(0, u.depth - 2))}
            {u.node.name} ({ORG_UNIT_KIND_LABELS[u.node.kind]})
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!loading && !error && units.length === 0 && (
        <p className="text-xs text-neutral-500">
          Todavía no hay ministerios ni áreas. Creá la estructura en Configuración → Estructura.
        </p>
      )}
    </div>
  );
}
