'use client';

import { useCallback, useMemo } from 'react';
import type { ObjectiveIndicatorDto, ProjectContributionDto } from '@gestion-publica/shared-types/metrics';
import { useActionRunner } from '@/features/planning/useActionRunner';
import { contributionOptions, validateContributionValue } from './contributions';
import {
  createContributionAction,
  deleteContributionAction,
  updateContributionAction,
} from './contribution-actions';

/** Estado y mutaciones de la sección "Aporta a indicador" de un proyecto. */
export function useProjectContributions(
  orgId: string,
  projectId: string,
  indicators: ObjectiveIndicatorDto[],
  contributions: ProjectContributionDto[],
) {
  const { pending, error, run, clearError } = useActionRunner();
  const options = useMemo(() => contributionOptions(indicators, contributions), [indicators, contributions]);
  const indicatorName = useCallback(
    (indicatorId: string) => indicators.find((i) => i.id === indicatorId)?.metricName ?? 'Indicador',
    [indicators],
  );
  const indicatorById = useCallback((id: string) => indicators.find((i) => i.id === id) ?? null, [indicators]);

  const create = useCallback(
    async (indicatorId: string, contributionValue: string): Promise<boolean> => {
      const invalid = validateContributionValue(contributionValue);
      if (invalid) return false;
      return (
        await run(() => createContributionAction(orgId, indicatorId, { projectId, contributionValue: contributionValue.trim() }))
      ).ok;
    },
    [orgId, projectId, run],
  );

  const update = useCallback(
    async (contribution: ProjectContributionDto, contributionValue: string): Promise<boolean> => {
      if (contribution.applied || validateContributionValue(contributionValue)) return false;
      return (
        await run(() => updateContributionAction(orgId, contribution.id, { contributionValue: contributionValue.trim() }))
      ).ok;
    },
    [orgId, run],
  );

  const remove = useCallback(
    async (contribution: ProjectContributionDto): Promise<boolean> => {
      if (contribution.applied) return false;
      return (await run(() => deleteContributionAction(orgId, contribution.id))).ok;
    },
    [orgId, run],
  );

  return { pending, error, clearError, options, indicatorName, indicatorById, create, update, remove };
}
