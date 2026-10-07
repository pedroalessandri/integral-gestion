'use client';

import { useCallback, useState } from 'react';
import type { AxisDto, CreateAxisDto, UpdateAxisDto, UpsertStrategicPlanDto } from '@gestion-publica/shared-types/planning';
import { useActionRunner } from '@/features/planning/useActionRunner';
import {
  createAxisAction,
  deleteAxisAction,
  updateAxisAction,
  upsertStrategicPlanAction,
} from './strategic-plan-actions';

export function useStrategicPlan(orgId: string) {
  const { pending, error, run, clearError } = useActionRunner();
  /** Resultado del último borrado de eje, para avisar cuántos objetivos quedaron sin eje. */
  const [notice, setNotice] = useState<string | null>(null);

  const savePlan = useCallback(
    async (input: UpsertStrategicPlanDto) => (await run(() => upsertStrategicPlanAction(orgId, input))).ok,
    [orgId, run],
  );

  const createAxis = useCallback(
    async (input: CreateAxisDto) => (await run(() => createAxisAction(orgId, input))).ok,
    [orgId, run],
  );

  const updateAxis = useCallback(
    async (id: string, input: UpdateAxisDto) => (await run(() => updateAxisAction(orgId, id, input))).ok,
    [orgId, run],
  );

  const deleteAxis = useCallback(
    async (axis: AxisDto) => {
      setNotice(null);
      const result = await run(() => deleteAxisAction(orgId, axis.id));
      if (result.ok) {
        const n = result.data.unassignedObjectiveCount;
        setNotice(
          n > 0
            ? `Eliminaste el eje "${axis.name}". ${n} ${n === 1 ? 'objetivo quedó' : 'objetivos quedaron'} sin eje.`
            : `Eliminaste el eje "${axis.name}".`,
        );
      }
      return result.ok;
    },
    [orgId, run],
  );

  return {
    pending,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    clearError,
    savePlan,
    createAxis,
    updateAxis,
    deleteAxis,
  };
}
