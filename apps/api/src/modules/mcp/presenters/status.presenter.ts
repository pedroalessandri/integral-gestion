import type { TaskStatus } from '@gestion-publica/okr-domain';

export type EstadoEs = 'pendiente' | 'en_curso' | 'terminado' | 'vencido';

const ESTADOS: Record<TaskStatus, EstadoEs> = {
  pending: 'pendiente',
  in_progress: 'en_curso',
  done: 'terminado',
  overdue: 'vencido',
};

/** Estado derivado de una tarea o proyecto, en español. */
export function estadoEs(status: TaskStatus): EstadoEs {
  return ESTADOS[status];
}

export const EstadoValues = ['pendiente', 'en_curso', 'terminado', 'vencido'] as const;
