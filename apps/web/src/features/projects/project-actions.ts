'use server';

import type {
  CreateProjectDto,
  CreateProjectTaskDto,
  DeleteProjectResultDto,
  ObjectiveDetailDto,
  ProjectDetailDto,
  ProjectSummaryDto,
  SetSiblingWeightsDto,
  TaskDetailDto,
  TaskSummaryDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from '@gestion-publica/shared-types/okr';
import { apiFetch } from '@/lib/api-client';
import { readApiError } from '@/lib/api-errors';
import { failure, unexpectedFailure, type ActionResult } from '@/features/planning/error-messages';

const OKR = '/api/v1/okr';

async function request<T>(
  orgId: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ActionResult<T>> {
  try {
    const res = await apiFetch(`${OKR}${path}`, {
      orgId,
      method: init?.method,
      ...(init?.body !== undefined && { body: JSON.stringify(init.body) }),
    });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export const getObjectiveAction = (orgId: string, objectiveId: string) =>
  request<ObjectiveDetailDto>(orgId, `/objectives/${objectiveId}`);

export const listProjectsAction = (orgId: string, objectiveId: string) =>
  request<ProjectSummaryDto[]>(orgId, `/objectives/${objectiveId}/projects`);

export const getProjectAction = (orgId: string, projectId: string) =>
  request<ProjectDetailDto>(orgId, `/projects/${projectId}`);

export const createProjectAction = (orgId: string, objectiveId: string, input: CreateProjectDto) =>
  request<ProjectDetailDto>(orgId, `/objectives/${objectiveId}/projects`, { method: 'POST', body: input });

export const updateProjectAction = (orgId: string, projectId: string, input: UpdateProjectDto) =>
  request<ProjectDetailDto>(orgId, `/projects/${projectId}`, { method: 'PATCH', body: input });

export const deleteProjectAction = (orgId: string, projectId: string) =>
  request<DeleteProjectResultDto>(orgId, `/projects/${projectId}`, { method: 'DELETE' });

export const setProjectWeightsAction = (orgId: string, objectiveId: string, input: SetSiblingWeightsDto) =>
  request<ProjectSummaryDto[]>(orgId, `/objectives/${objectiveId}/projects/weights`, { method: 'PUT', body: input });

export const listProjectTasksAction = (orgId: string, projectId: string) =>
  request<TaskSummaryDto[]>(orgId, `/projects/${projectId}/tasks`);

export const createProjectTaskAction = (orgId: string, projectId: string, input: CreateProjectTaskDto) =>
  request<TaskDetailDto>(orgId, `/projects/${projectId}/tasks`, { method: 'POST', body: input });

export const updateProjectTaskAction = (orgId: string, taskId: string, input: UpdateTaskDto) =>
  request<TaskDetailDto>(orgId, `/tasks/${taskId}`, { method: 'PATCH', body: input });

export async function deleteProjectTaskAction(orgId: string, taskId: string): Promise<ActionResult<null>> {
  try {
    const res = await apiFetch(`${OKR}/tasks/${taskId}`, { method: 'DELETE', orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: null };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export const setTaskWeightsAction = (orgId: string, projectId: string, input: SetSiblingWeightsDto) =>
  request<TaskSummaryDto[]>(orgId, `/projects/${projectId}/tasks/weights`, { method: 'PUT', body: input });
