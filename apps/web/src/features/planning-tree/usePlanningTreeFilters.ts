'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toHref, type PlanningTreeFilters } from './planning-tree-filters';

/**
 * Cambia un filtro navegando a la URL nueva: un request por cambio (los selects disparan `onChange` una sola vez),
 * nunca por tecla.
 */
export function usePlanningTreeFilters(filters: PlanningTreeFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (patch: Partial<PlanningTreeFilters>) => {
      startTransition(() => router.push(toHref(pathname, { ...filters, ...patch })));
    },
    [filters, pathname, router],
  );

  const clear = useCallback(() => update({ axisId: null, orgUnitId: null }), [update]);

  return { pending, update, clear };
}
