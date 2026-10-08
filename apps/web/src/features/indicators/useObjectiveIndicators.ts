'use client';

import { useCallback } from 'react';
import type { ObjectiveIndicatorDto, SetObjectiveIndicatorWeightsDto } from '@gestion-publica/shared-types/metrics';
import type { ActionResult } from '@/features/planning/error-messages';
import { useActionRunner } from '@/features/planning/useActionRunner';
import { updateMetricAction } from '@/components/metrics/actions';
import { useWeightedGroup } from '@/features/projects/useWeightedGroup';
import {
  createIndicatorAction,
  deleteIndicatorAction,
  setIndicatorWeightsAction,
  updateIndicatorAction,
} from './indicator-actions';
import type { CurvePeriod } from './curve-form';
import {
  toCreateIndicatorDto,
  toMetricAttributesPatch,
  toUpdateIndicatorDto,
  type IndicatorFormValues,
} from './indicator-form';

interface CurrentMetricAttributes {
  kind: ObjectiveIndicatorDto['kind'];
  source: string | null;
  description: string | null;
}

export function useObjectiveIndicators(
  orgId: string,
  objectiveId: string,
  indicators: ObjectiveIndicatorDto[],
  period: CurvePeriod,
) {
  const { pending, error, run, clearError } = useActionRunner();

  const saveWeights = useCallback(
    (input: SetObjectiveIndicatorWeightsDto) => setIndicatorWeightsAction(orgId, objectiveId, input),
    [orgId, objectiveId],
  );
  const weights = useWeightedGroup(indicators, saveWeights);

  const createIndicator = useCallback(
    async (values: IndicatorFormValues) =>
      (
        await run(() =>
          createIndicatorAction(orgId, objectiveId, toCreateIndicatorDto(values, weights.mode === 'weighted', period)),
        )
      ).ok,
    [orgId, objectiveId, run, weights.mode, period],
  );

  /**
   * Tipo, fuente y descripción viven en la métrica (PATCH propio, primero: puede dar 422 por RN-P12);
   * base, meta, dirección y curva (con sus puntos, en el mismo PATCH) en el indicador (D8, RN-P17).
   */
  const updateIndicator = useCallback(
    async (indicator: ObjectiveIndicatorDto, current: CurrentMetricAttributes, values: IndicatorFormValues) =>
      (
        await run(async (): Promise<ActionResult<unknown>> => {
          const patch = toMetricAttributesPatch(values, current);
          if (patch) {
            const metricResult = await updateMetricAction({ orgId, metricId: indicator.metricId, ...patch });
            if (metricResult.error) return { ok: false, error: metricResult.error, code: null, status: 0 };
          }
          return updateIndicatorAction(orgId, indicator.id, toUpdateIndicatorDto(values, period, indicator.linkMode));
        })
      ).ok,
    [orgId, run, period],
  );

  const deleteIndicator = useCallback(
    async (indicator: ObjectiveIndicatorDto) => (await run(() => deleteIndicatorAction(orgId, indicator.id))).ok,
    [orgId, run],
  );

  return {
    pending,
    error,
    clearError: () => {
      clearError();
      weights.clearError();
    },
    weights,
    createIndicator,
    updateIndicator,
    deleteIndicator,
  };
}
