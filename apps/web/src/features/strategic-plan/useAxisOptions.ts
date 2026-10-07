'use client';

import { useEffect, useState } from 'react';
import type { AxisDto } from '@gestion-publica/shared-types/planning';
import { listAxesAction } from './strategic-plan-actions';

/** Ejes del plan activo (sin plan, la API devuelve []). */
export function useAxisOptions(orgId: string) {
  const [axes, setAxes] = useState<AxisDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAxesAction(orgId).then((r) => {
      if (cancelled) return;
      if (r.ok) setAxes(r.data);
      else setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { axes, loading, error };
}
