import { PendingLoadBadge } from '@/components/pending-load-badge';
import { SemaphoreBadge } from '@/components/semaphore-badge';
import { LABELS, PLANNING_TREE_LABELS } from '@/lib/labels';
import type { NodeReadings } from '../planning-tree-view';

/** Semáforo de cada lectura (separadas) y cargas pendientes de un objetivo, para el listado. */
export function ObjectiveStatusCell({ readings }: { readings: NodeReadings | undefined }) {
  if (!readings) return <span className="text-xs text-neutral-400">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-neutral-500">{PLANNING_TREE_LABELS.readingShort.result}</span>
        <SemaphoreBadge
          color={readings.result.semaphore}
          deviationBp={readings.result.deviationBp}
          reading={LABELS.resultProgress}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-neutral-500">{PLANNING_TREE_LABELS.readingShort.execution}</span>
        <SemaphoreBadge
          color={readings.execution.semaphore}
          deviationBp={readings.execution.deviationBp}
          reading={LABELS.executionProgress}
        />
      </div>
      <PendingLoadBadge count={readings.result.pendingBucketsCount} />
    </div>
  );
}
