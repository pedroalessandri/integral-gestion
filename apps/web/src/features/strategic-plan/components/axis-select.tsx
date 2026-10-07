'use client';

import { LABELS, NO_AXIS_LABEL } from '@/lib/labels';
import { useAxisOptions } from '../useAxisOptions';

interface Props {
  id?: string;
  orgId: string;
  value: string | null;
  onChange: (axisId: string | null) => void;
}

/** Selector de eje del plan activo, con opción "Sin eje". */
export function AxisSelect({ id, orgId, value, onChange }: Props) {
  const { axes, loading, error } = useAxisOptions(orgId);

  return (
    <div className="space-y-1">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        <option value="">{NO_AXIS_LABEL}</option>
        {axes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!loading && !error && axes.length === 0 && (
        <p className="text-xs text-neutral-500">
          Todavía no hay {LABELS.axis.plural.toLowerCase()}. Podés crearlos en Plan de gobierno.
        </p>
      )}
    </div>
  );
}
