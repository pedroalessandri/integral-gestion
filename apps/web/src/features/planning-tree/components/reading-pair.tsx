import { PendingLoadBadge } from '@/components/pending-load-badge';
import { ProgressReadingBar } from '@/components/progress-reading-bar';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { LABELS, PLANNING_TREE_LABELS } from '@/lib/labels';
import type { NodeReadings } from '../planning-tree-view';

interface Props {
  readings: NodeReadings;
  /** Prefijo de los data-testid (único por nodo). */
  testId: string;
  /** Texto cuando no hay con qué medir (ej: nodo sin objetivos). */
  emptyText?: string;
}

/**
 * Las dos lecturas de un nodo, cada una con su barra, semáforo y desvío. Nunca se combinan en un único número
 * (RN-P8). Los valores vienen del backend: acá solo se formatean.
 */
export function ReadingPair({ readings, testId, emptyText = PLANNING_TREE_LABELS.noObjectivesReading }: Props) {
  const { result, execution } = readings;
  const resultHas = result.progressBp !== null;
  const executionHas = execution.progressBp !== null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ProgressReadingBar
        label={LABELS.resultProgress}
        valueBp={result.progressBp ?? 0}
        hasItems={resultHas}
        emptyText={emptyText}
        barClassName="bg-sky-600"
        testId={`${testId}-result`}
        badges={
          resultHas ? (
            <>
              <SemaphoreBadge color={result.semaphore} deviationBp={result.deviationBp} reading={LABELS.resultProgress} />
              <PendingLoadBadge count={result.pendingBucketsCount} />
            </>
          ) : undefined
        }
      />
      <ProgressReadingBar
        label={LABELS.executionProgress}
        valueBp={execution.progressBp ?? 0}
        hasItems={executionHas}
        emptyText={emptyText}
        barClassName="bg-emerald-600"
        testId={`${testId}-execution`}
        badges={
          executionHas ? (
            <SemaphoreBadge
              color={execution.semaphore}
              deviationBp={execution.deviationBp}
              reading={LABELS.executionProgress}
            />
          ) : undefined
        }
      />
    </div>
  );
}
