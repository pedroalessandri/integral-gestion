'use client';

import { useEffect, useState } from 'react';
import { loadOrgMembersAction } from './actions';

interface Option {
  id: string;
  displayName: string;
  email: string;
}

export function OwnerSelect({
  orgId,
  value,
  onChange,
}: {
  orgId: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrgMembersAction({ orgId }).then((r) => {
      setOptions(r.members);
      setLoading(false);
    });
  }, [orgId]);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={loading}
      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
    >
      <option value="">— Sin asignar —</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>
          {u.displayName} ({u.email})
        </option>
      ))}
    </select>
  );
}
