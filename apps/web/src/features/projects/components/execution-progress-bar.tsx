import type { ObjectiveExecutionStatusDto } from '@gestion-publica/shared-types/metrics';
import { ProgressReadingBar } from '@/components/progress-reading-bar';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { LABELS } from '@/lib/labels';

interface Props {
  valueBp: number;
  projectCount: number;
  /** Lectura de gestión de `GET okr/objectives/:id/status`; `null` si no se pudo cargar. */
  status?: Pick<ObjectiveExecutionStatusDto, 'semaphore' | 'deviationBp'> | null;
  /** Para distinguirla de otras barras en la misma pantalla. */
  className?: string;
}

/**
 * Barra "Avance de gestión" (desde proyectos, RN-P8) con su semáforo. Va sola: nunca se combina con el avance de
 * resultado.
 */
export function ExecutionProgressBar({ valueBp, projectCount, status, className }: Props) {
  const hasItems = projectCount > 0;
  return (
    <ProgressReadingBar
      label={LABELS.executionProgress}
      valueBp={valueBp}
      hasItems={hasItems}
      emptyText="Sin proyectos todavía"
      barClassName="bg-emerald-600"
      testId="execution-progress"
      className={className}
      badges={
        hasItems && status ? (
          <SemaphoreBadge
            color={status.semaphore}
            deviationBp={status.deviationBp}
            reading={LABELS.executionProgress}
            testId="execution-semaphore"
          />
        ) : undefined
      }
    />
  );
}
