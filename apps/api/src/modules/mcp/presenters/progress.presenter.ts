import { formatBpAsPercentString } from '@gestion-publica/okr-domain';
import type { AvanceGestionOut, AvanceResultadoOut, Semaforo } from './output-schemas.js';

const SEMAFORO: Record<'green' | 'yellow' | 'red', Semaforo> = {
  green: 'verde',
  yellow: 'amarillo',
  red: 'rojo',
};

export function semaforoEs(color: 'green' | 'yellow' | 'red' | null): Semaforo | null {
  return color === null ? null : SEMAFORO[color];
}

/** Porcentaje en bp + texto decimal exacto, o `null` si no hay valor. */
export function bpPair(bp: number | null): { bp: number | null; porcentaje: string | null } {
  return bp === null ? { bp: null, porcentaje: null } : { bp, porcentaje: formatBpAsPercentString(bp) };
}

export interface ResultReadingInput {
  progressBp: number | null;
  deviationBp: number | null;
  semaphore: 'green' | 'yellow' | 'red' | null;
  pendingBucketsCount: number;
}

/**
 * Avance de resultado de un objetivo o de un agregado. `emptyReason` explica el `null` de avance/desvío
 * ("sin objetivos" en un agregado vacío).
 */
export function presentResultReading(
  input: ResultReadingInput,
  options: { noObjectives?: boolean } = {},
): AvanceResultadoOut {
  const progress = bpPair(input.progressBp);
  const out: AvanceResultadoOut = {
    ...progress,
    desvioBp: input.deviationBp,
    desvioPuntos: input.deviationBp === null ? null : formatBpAsPercentString(input.deviationBp),
    semaforo: semaforoEs(input.semaphore),
    cargasPendientes: input.pendingBucketsCount,
  };
  if (input.deviationBp === null) out.motivo = options.noObjectives ? 'sin objetivos' : 'sin cargas';
  return out;
}

export interface ExecutionReadingInput {
  progressBp: number | null;
  /** Solo en un objetivo; los agregados no traen avance planificado. */
  plannedBp?: number;
  deviationBp: number | null;
  semaphore: 'green' | 'yellow' | 'red' | null;
}

export function presentExecutionReading(input: ExecutionReadingInput): AvanceGestionOut {
  const out: AvanceGestionOut = {
    ...bpPair(input.progressBp),
    desvioBp: input.deviationBp,
    desvioPuntos: input.deviationBp === null ? null : formatBpAsPercentString(input.deviationBp),
    semaforo: semaforoEs(input.semaphore),
  };
  if (input.plannedBp !== undefined) {
    out.planificadoBp = input.plannedBp;
    out.planificadoPorcentaje = formatBpAsPercentString(input.plannedBp);
  }
  if (input.deviationBp === null) out.motivo = 'sin objetivos';
  return out;
}
