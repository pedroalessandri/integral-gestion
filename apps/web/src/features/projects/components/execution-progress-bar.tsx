import { ProgressReadingBar } from '@/components/progress-reading-bar';
import { LABELS } from '@/lib/labels';

interface Props {
  valueBp: number;
  projectCount: number;
  /** Para distinguirla de otras barras en la misma pantalla. */
  className?: string;
}

/**
 * Barra "Avance de gestión" (desde proyectos, RN-P8). Va sola: nunca se combina con el avance de resultado.
 */
export function ExecutionProgressBar({ valueBp, projectCount, className }: Props) {
  return (
    <ProgressReadingBar
      label={LABELS.executionProgress}
      valueBp={valueBp}
      hasItems={projectCount > 0}
      emptyText="Sin proyectos todavía"
      barClassName="bg-emerald-600"
      testId="execution-progress"
      className={className}
    />
  );
}
