import type {
  CreateProjectDto,
  CreateProjectTaskDto,
  ProjectDetailDto,
  TaskSummaryDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from '@gestion-publica/shared-types/okr';
import { dateInputToIso, isoToDateInput } from '@/features/strategic-plan/plan-form';

export interface ProjectFormValues {
  title: string;
  description: string;
  ownerUserId: string | null;
  /** Unidad del proyecto; `null` = la del objetivo. */
  orgUnitId: string | null;
  /** YYYY-MM-DD */
  startsAt: string;
  endsAt: string;
}

export interface TaskFormValues {
  title: string;
  description: string;
  ownerUserId: string | null;
  startsAt: string;
  endsAt: string;
}

export function isDateRangeValid(startsAt: string, endsAt: string): boolean {
  return startsAt !== '' && endsAt !== '' && startsAt <= endsAt;
}

export function projectToFormValues(
  project: ProjectDetailDto | null,
  objective: { orgUnitId: string | null; periodStartsAt: string; periodEndsAt: string },
): ProjectFormValues {
  return {
    title: project?.title ?? '',
    description: project?.description ?? '',
    ownerUserId: project?.ownerUserId ?? null,
    orgUnitId: project ? project.orgUnitId : objective.orgUnitId,
    startsAt: isoToDateInput(project?.startsAt ?? objective.periodStartsAt),
    endsAt: isoToDateInput(project?.endsAt ?? objective.periodEndsAt),
  };
}

/**
 * Sin `weightBp`: los pesos viajan solo por el PUT en bloque. Si el grupo ya está ponderado, el caller pasa
 * `weightBp: 0` para que la suma siga en 10000 y el proyecto nuevo se ajuste después con "Editar pesos".
 */
export function toCreateProjectDto(
  values: ProjectFormValues,
  objectiveOrgUnitId: string | null,
  groupWeighted: boolean,
): CreateProjectDto {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    ...(description !== '' && { description }),
    ...(values.ownerUserId && { ownerUserId: values.ownerUserId }),
    ...(values.orgUnitId && values.orgUnitId !== objectiveOrgUnitId && { orgUnitId: values.orgUnitId }),
    ...(groupWeighted && { weightBp: 0 }),
    startsAt: dateInputToIso(values.startsAt),
    endsAt: dateInputToIso(values.endsAt),
  };
}

export function toUpdateProjectDto(project: ProjectDetailDto, values: ProjectFormValues): UpdateProjectDto {
  const dto: UpdateProjectDto = {};
  const description = values.description.trim() === '' ? null : values.description.trim();
  if (values.title.trim() !== project.title) dto.title = values.title.trim();
  if (description !== project.description) dto.description = description;
  if (values.ownerUserId !== project.ownerUserId) dto.ownerUserId = values.ownerUserId;
  if (values.orgUnitId && values.orgUnitId !== project.orgUnitId) dto.orgUnitId = values.orgUnitId;
  if (values.startsAt !== isoToDateInput(project.startsAt)) dto.startsAt = dateInputToIso(values.startsAt);
  if (values.endsAt !== isoToDateInput(project.endsAt)) dto.endsAt = dateInputToIso(values.endsAt);
  return dto;
}

export function taskToFormValues(
  task: TaskSummaryDto | null,
  project: { startsAt: string; endsAt: string },
): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: '',
    ownerUserId: null,
    startsAt: isoToDateInput(task?.startsAt ?? project.startsAt),
    endsAt: isoToDateInput(task?.endsAt ?? project.endsAt),
  };
}

export function toCreateTaskDto(values: TaskFormValues, groupWeighted: boolean): CreateProjectTaskDto {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    ...(description !== '' && { description }),
    ...(values.ownerUserId && { ownerUserId: values.ownerUserId }),
    ...(groupWeighted && { weightBp: 0 }),
    startsAt: dateInputToIso(values.startsAt),
    endsAt: dateInputToIso(values.endsAt),
  };
}

/**
 * Solo título y fechas: la lista de tareas devuelve `TaskSummaryDto` (sin descripción ni responsable) y no hay
 * `GET tasks/:id`, así que no se pueden precargar ni pisar esos campos al editar.
 */
export function toUpdateTaskDto(task: TaskSummaryDto, values: TaskFormValues): UpdateTaskDto {
  const dto: UpdateTaskDto = {};
  if (values.title.trim() !== task.title) dto.title = values.title.trim();
  if (values.startsAt !== isoToDateInput(task.startsAt)) dto.startsAt = dateInputToIso(values.startsAt);
  if (values.endsAt !== isoToDateInput(task.endsAt)) dto.endsAt = dateInputToIso(values.endsAt);
  return dto;
}
