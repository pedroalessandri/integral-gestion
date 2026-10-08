'use client';

import { useCallback } from 'react';
import type { SetSiblingWeightsDto } from '@gestion-publica/shared-types/okr';
import type { ActionResult } from '@/features/planning/error-messages';
import { useActionRunner } from '@/features/planning/useActionRunner';
import { weightGroupMode, type WeightGroupMode } from './weights';

/**
 * Estado y acciones del "Ponderar" de un grupo de hermanos (proyectos de un objetivo o tareas de un proyecto).
 * Siempre usa el PUT en bloque: nunca se arman grupos mixtos desde la UI.
 */
export function useWeightedGroup(
  items: ReadonlyArray<{ id: string; weightBp: number | null }>,
  save: (input: SetSiblingWeightsDto) => Promise<ActionResult<unknown>>,
) {
  const { pending, error, run, clearError } = useActionRunner();
  const mode: WeightGroupMode = weightGroupMode(items);

  const saveWeights = useCallback(async (input: SetSiblingWeightsDto) => (await run(() => save(input))).ok, [run, save]);

  const clearWeights = useCallback(
    async () => (await run(() => save({ weights: items.map((i) => ({ id: i.id, weightBp: null })) }))).ok,
    [items, run, save],
  );

  return { mode, pending, error, clearError, saveWeights, clearWeights };
}
