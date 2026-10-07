'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectDetailDto, SetSiblingWeightsDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import { useActionRunner } from '@/features/planning/useActionRunner';
import {
  createProjectTaskAction,
  deleteProjectAction,
  deleteProjectTaskAction,
  setTaskWeightsAction,
  updateProjectAction,
  updateProjectTaskAction,
} from './project-actions';
import {
  toCreateTaskDto,
  toUpdateProjectDto,
  toUpdateTaskDto,
  type ProjectFormValues,
  type TaskFormValues,
} from './project-form';
import { useWeightedGroup } from './useWeightedGroup';

export function useProjectTasks(orgId: string, project: ProjectDetailDto, tasks: TaskSummaryDto[]) {
  const router = useRouter();
  const { pending, error, run, clearError } = useActionRunner();

  const saveWeights = useCallback(
    (input: SetSiblingWeightsDto) => setTaskWeightsAction(orgId, project.id, input),
    [orgId, project.id],
  );
  const weights = useWeightedGroup(tasks, saveWeights);

  const createTask = useCallback(
    async (values: TaskFormValues) =>
      (await run(() => createProjectTaskAction(orgId, project.id, toCreateTaskDto(values, weights.mode === 'weighted')))).ok,
    [orgId, project.id, run, weights.mode],
  );

  const updateTask = useCallback(
    async (task: TaskSummaryDto, values: TaskFormValues) => {
      const dto = toUpdateTaskDto(task, values);
      if (Object.keys(dto).length === 0) return true;
      return (await run(() => updateProjectTaskAction(orgId, task.id, dto))).ok;
    },
    [orgId, run],
  );

  const deleteTask = useCallback(
    async (task: TaskSummaryDto) => (await run(() => deleteProjectTaskAction(orgId, task.id))).ok,
    [orgId, run],
  );

  const updateProject = useCallback(
    async (values: ProjectFormValues) => {
      const dto = toUpdateProjectDto(project, values);
      if (Object.keys(dto).length === 0) return true;
      return (await run(() => updateProjectAction(orgId, project.id, dto))).ok;
    },
    [orgId, project, run],
  );

  /** Borra el proyecto y vuelve a la ficha del objetivo. */
  const deleteProject = useCallback(
    async (objectiveId: string) => {
      const result = await run(() => deleteProjectAction(orgId, project.id));
      if (result.ok) router.push(`/objectives/${objectiveId}`);
      return result.ok;
    },
    [orgId, project.id, router, run],
  );

  return {
    pending,
    error,
    clearError: () => {
      clearError();
      weights.clearError();
    },
    weights,
    createTask,
    updateTask,
    deleteTask,
    updateProject,
    deleteProject,
  };
}
