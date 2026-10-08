import { ProgressReadingBar } from '@/components/progress-reading-bar';
import { LABELS } from '@/lib/labels';

interface Props {
  valueBp: number;
  indicatorCount: number;
  className?: string;
}

/**
 * Barra "Avance de resultado" (desde indicadores, RN-P8). Va junto a la de gestión pero separada: nunca se combinan
 * en un número único.
 */
export function ResultProgressBar({ valueBp, indicatorCount, className }: Props) {
  return (
    <ProgressReadingBar
      label={LABELS.resultProgress}
      valueBp={valueBp}
      hasItems={indicatorCount > 0}
      emptyText="Sin indicadores todavía"
      barClassName="bg-sky-600"
      testId="result-progress"
      className={className}
    />
  );
}
