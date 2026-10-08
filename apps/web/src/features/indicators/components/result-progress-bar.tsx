import type { ObjectiveResultStatusDto } from '@gestion-publica/shared-types/metrics';
import { PendingLoadBadge } from '@/components/pending-load-badge';
import { ProgressReadingBar } from '@/components/progress-reading-bar';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { LABELS } from '@/lib/labels';

interface Props {
  valueBp: number;
  indicatorCount: number;
  /** Lectura de resultado de `GET okr/objectives/:id/status`; `null` si no se pudo cargar. */
  status?: Pick<ObjectiveResultStatusDto, 'semaphore' | 'deviationBp' | 'pendingBucketsCount'> | null;
  className?: string;
}

/**
 * Barra "Avance de resultado" (desde indicadores, RN-P8) con su semáforo y las cargas pendientes. Va junto a la de
 * gestión pero separada: nunca se combinan en un número único.
 */
export function ResultProgressBar({ valueBp, indicatorCount, status, className }: Props) {
  const hasItems = indicatorCount > 0;
  return (
    <ProgressReadingBar
      label={LABELS.resultProgress}
      valueBp={valueBp}
      hasItems={hasItems}
      emptyText="Sin indicadores todavía"
      barClassName="bg-sky-600"
      testId="result-progress"
      className={className}
      badges={
        hasItems && status ? (
          <>
            <SemaphoreBadge
              color={status.semaphore}
              deviationBp={status.deviationBp}
              reading={LABELS.resultProgress}
              testId="result-semaphore"
            />
            <PendingLoadBadge count={status.pendingBucketsCount} testId="result-pending" />
          </>
        ) : undefined
      }
    />
  );
}
