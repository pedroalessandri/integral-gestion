import type { PlanningAggregateDto } from '@gestion-publica/shared-types/okr';
import type { AgregadoOut } from './output-schemas.js';
import { presentExecutionReading, presentResultReading } from './progress.presenter.js';

/** Agregado (promedio simple de objetivos por lectura). Las dos lecturas viajan separadas. */
export function presentAggregate(aggregate: PlanningAggregateDto): AgregadoOut {
  const empty = aggregate.objectivesCount === 0;
  return {
    objetivos: aggregate.objectivesCount,
    avanceResultado: presentResultReading(
      {
        progressBp: aggregate.result.progressBp,
        deviationBp: aggregate.result.deviationBp,
        semaphore: aggregate.result.semaphore,
        pendingBucketsCount: aggregate.result.pendingBucketsCount,
      },
      { noObjectives: empty },
    ),
    avanceGestion: presentExecutionReading({
      progressBp: aggregate.execution.progressBp,
      deviationBp: aggregate.execution.deviationBp,
      semaphore: aggregate.execution.semaphore,
    }),
  };
}
