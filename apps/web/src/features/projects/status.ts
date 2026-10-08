import type { TaskStatus } from '@gestion-publica/shared-types/okr';

/**
 * Estado de presentación de un proyecto (el DTO no lo trae): derivado del avance y de la fecha de fin.
 * Solo sirve para el ícono/color del Gantt; no es una regla de negocio.
 */
export function projectDisplayStatus(
  project: { progressCachedBp: number; endsAt: string },
  now: Date = new Date(),
): TaskStatus {
  if (project.progressCachedBp >= 10000) return 'done';
  if (new Date(project.endsAt).getTime() < now.getTime()) return 'overdue';
  return project.progressCachedBp > 0 ? 'in_progress' : 'pending';
}
