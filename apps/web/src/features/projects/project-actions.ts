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

export async function getObjectiveAction(orgId: string, objectiveId: string) {
  return request<ObjectiveDetailDto>(orgId, `/objectives/${objectiveId}`);
}

export async function listProjectsAction(orgId: string, objectiveId: string) {
  return request<ProjectSummaryDto[]>(orgId, `/objectives/${objectiveId}/projects`);
}

export async function getProjectAction(orgId: string, projectId: string) {
  return request<ProjectDetailDto>(orgId, `/projects/${projectId}`);
}

export async function createProjectAction(
  orgId: string,
  objectiveId: string,
  input: CreateProjectDto,
) {
  return request<ProjectDetailDto>(orgId, `/objectives/${objectiveId}/projects`, {
    method: 'POST',
    body: input,
  });
}

export async function updateProjectAction(
  orgId: string,
  projectId: string,
  input: UpdateProjectDto,
) {
  return request<ProjectDetailDto>(orgId, `/projects/${projectId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteProjectAction(orgId: string, projectId: string) {
  return request<DeleteProjectResultDto>(orgId, `/projects/${projectId}`, { method: 'DELETE' });
}

export async function setProjectWeightsAction(
  orgId: string,
  objectiveId: string,
  input: SetSiblingWeightsDto,
) {
  return request<ProjectSummaryDto[]>(orgId, `/objectives/${objectiveId}/projects/weights`, {
    method: 'PUT',
    body: input,
  });
}

export async function listProjectTasksAction(orgId: string, projectId: string) {
  return request<TaskSummaryDto[]>(orgId, `/projects/${projectId}/tasks`);
}

export async function createProjectTaskAction(
  orgId: string,
  projectId: string,
  input: CreateProjectTaskDto,
) {
  return request<TaskDetailDto>(orgId, `/projects/${projectId}/tasks`, {
    method: 'POST',
    body: input,
  });
}

export async function updateProjectTaskAction(orgId: string, taskId: string, input: UpdateTaskDto) {
  return request<TaskDetailDto>(orgId, `/tasks/${taskId}`, { method: 'PATCH', body: input });
}

export async function deleteProjectTaskAction(
  orgId: string,
  taskId: string,
): Promise<ActionResult<null>> {
  try {
    const res = await apiFetch(`${OKR}/tasks/${taskId}`, { method: 'DELETE', orgId });
    if (!res.ok) return failure(await readApiError(res));
    return { ok: true, data: null };
  } catch (err) {
    return unexpectedFailure(err);
  }
}

export async function setTaskWeightsAction(
  orgId: string,
  projectId: string,
  input: SetSiblingWeightsDto,
) {
  return request<TaskSummaryDto[]>(orgId, `/projects/${projectId}/tasks/weights`, {
    method: 'PUT',
    body: input,
  });
}
