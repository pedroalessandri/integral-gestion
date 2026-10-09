'use client';

import { useCallback, useState } from 'react';
import type { ProjectSummaryDto, SetSiblingWeightsDto } from '@gestion-publica/shared-types/okr';
import { useActionRunner } from '@/features/planning/useActionRunner';
import {
  createProjectAction,
  deleteProjectAction,
  setProjectWeightsAction,
} from './project-actions';
import { toCreateProjectDto, type ProjectFormValues } from './project-form';
import { useWeightedGroup } from './useWeightedGroup';

export function useObjectiveProjects(
  orgId: string,
  objective: { id: string; orgUnitId: string },
  projects: ProjectSummaryDto[],
) {
  const { pending, error, run, clearError } = useActionRunner();
  const [notice, setNotice] = useState<string | null>(null);

  const saveWeights = useCallback(
    (input: SetSiblingWeightsDto) => setProjectWeightsAction(orgId, objective.id, input),
    [orgId, objective.id],
  );
  const weights = useWeightedGroup(projects, saveWeights);

  const createProject = useCallback(
    async (values: ProjectFormValues) =>
      (
        await run(() =>
          createProjectAction(orgId, objective.id, toCreateProjectDto(values, objective.orgUnitId, weights.mode === 'weighted')),
        )
      ).ok,
    [orgId, objective.id, objective.orgUnitId, run, weights.mode],
  );

  const deleteProject = useCallback(
    async (project: ProjectSummaryDto) => {
      setNotice(null);
      const result = await run(() => deleteProjectAction(orgId, project.id));
      if (result.ok) {
        const n = result.data.deletedTaskCount;
        setNotice(
          n > 0
            ? `Eliminaste el proyecto "${project.title}" y ${n === 1 ? 'su tarea' : `sus ${n} tareas`}.`
            : `Eliminaste el proyecto "${project.title}".`,
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
    clearError: () => {
      clearError();
      weights.clearError();
    },
    weights,
    createProject,
    deleteProject,
  };
}
