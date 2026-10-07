'use client';

import { useEffect, useState } from 'react';
import { listOrgUnitTreeAction } from './org-structure-actions';
import { assignableUnits, type FlatUnit } from './tree';

/** Unidades donde puede colgar un objetivo (solo ministry | area, RN-P3). */
export function useAssignableUnits(orgId: string) {
  const [units, setUnits] = useState<FlatUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOrgUnitTreeAction(orgId).then((r) => {
      if (cancelled) return;
      if (r.ok) setUnits(assignableUnits(r.data));
      else setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { units, loading, error };
}
