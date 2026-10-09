import Link from 'next/link';
import { PLANNING_TREE_LABELS as L } from '@/lib/labels';
import type { AxisBoard } from '../planning-tree-view';
import { ReadingPair } from './reading-pair';

/** Tablero de un eje (SPEC §5.2): sus dos lecturas agregadas y el desglose por unidad. */
export function AxisBoardSection({ axisId, board }: { axisId: string; board: AxisBoard | undefined }) {
  if (!board) return null;
  return (
    <div className="space-y-3 border-t border-neutral-100 pt-3" data-testid={`axis-board-${axisId}`}>
      <ReadingPair readings={board.readings} testId={`axis-${axisId}`} />
      <div>
        <h4 className="text-xs font-medium uppercase tracking-wider text-neutral-500">{L.boardUnits}</h4>
        {board.units.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-500">{L.boardUnitsEmpty}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {board.units.map((u) => (
              <li key={u.key} className="space-y-1">
                <p className="text-sm font-medium text-neutral-800">
                  {u.name} <span className="text-xs font-normal text-neutral-500">· {L.objectivesCount(u.objectivesCount)}</span>
                </p>
                <ReadingPair readings={u.readings} testId={`axis-${axisId}-unit-${u.key}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function AxisBoardLink({ periodId }: { periodId: string }) {
  return (
    <Link
      href={`/planning?periodId=${periodId}`}
      className="text-sm font-medium underline underline-offset-2"
      style={{ color: 'var(--color-primary-600)' }}
    >
      {L.boardLink} →
    </Link>
  );
}
