/**
 * Lógica PURA de la migración KR -> indicador / proyecto (SPEC §6 punto 2, ADR-0009 D6).
 *
 * No toca la DB: recibe los KR de un objetivo ya cargados y devuelve el plan de lo que hay que crear.
 * La usa `migrate-to-planning.ts` (que carga, persiste y audita) y se testea sin DB.
 *
 * Reglas aplicadas:
 *  - KR `automatic` con `MetricKrLink` -> `ObjectiveIndicator` (misma métrica, base, meta y dirección;
 *    peso = peso del KR). Sus tareas pasan a un proyecto "Tareas de <KR>" (eran informativas, RN-O4).
 *  - Cualquier otro KR (manual, o automático sin vínculo) -> `Project` con título, owner, descripción y
 *    peso del KR; fechas = min/max de sus tareas, o las del período si no tiene tareas.
 *  - Ponderación todo-o-nada por grupo de hermanos (RN-P6). Como el reparto de los KR se parte en dos
 *    grupos (indicadores y proyectos), la suma de cada grupo casi nunca da 10000: si el grupo resultante
 *    no queda completo y sumando 10000, se queda sin pesos (promedio simple). No se inventan pesos.
 */

export type Direction = 'increasing' | 'decreasing';

export interface LegacyTask {
  id: string;
  weightBp: number | null;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
}

export interface LegacyKeyResult {
  id: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  weightBp: number;
  progressMode: string;
  /** Vínculo con una métrica (`metrics.metric_kr_link`), si existe. */
  link: { metricId: string; baselineValue: string; targetValue: string; direction: Direction } | null;
  /** Tareas vivas del KR. */
  tasks: LegacyTask[];
}

export interface PlannedIndicator {
  krId: string;
  metricId: string;
  baselineValue: string;
  targetValue: string;
  direction: Direction;
  weightBp: number | null;
}

export interface PlannedTask {
  id: string;
  weightBp: number | null;
  progressBp: number;
}

export type PlannedProjectOrigin = 'manual_kr' | 'automatic_kr_without_link' | 'tasks_of_automatic_kr';

export interface PlannedProject {
  krId: string;
  origin: PlannedProjectOrigin;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  weightBp: number | null;
  startsAt: Date;
  endsAt: Date;
  tasks: PlannedTask[];
}

export interface PlanConflict {
  krId: string;
  reason: 'metric_already_linked_to_objective' | 'existing_indicators_weighted' | 'existing_projects_weighted';
}

export interface ObjectiveMigrationPlan {
  indicators: PlannedIndicator[];
  projects: PlannedProject[];
  /** KR que NO se migran en esta corrida (se reintentan en la siguiente). */
  conflicts: PlanConflict[];
  /** Cantidad de grupos (indicadores / proyectos / tareas) que perdieron sus pesos por no cerrar en 10000. */
  weightGroupsReset: { indicators: number; projects: number; tasks: number };
}

export interface PlanInput {
  krs: ReadonlyArray<LegacyKeyResult>;
  period: { startsAt: Date; endsAt: Date };
  /** Pesos de los indicadores vivos que el objetivo ya tiene (no creados por esta corrida). */
  existingIndicatorWeights: ReadonlyArray<number | null>;
  /** Pesos de los proyectos vivos que el objetivo ya tiene. */
  existingProjectWeights: ReadonlyArray<number | null>;
  /** Métricas ya medidas por un indicador vivo del objetivo (único parcial objective+metric). */
  existingMetricIds: ReadonlyArray<string>;
}

const BP_TOTAL = 10_000;
const TITLE_MAX = 200;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function isCompleteAndSumsTotal(weights: ReadonlyArray<number | null>): boolean {
  if (weights.length === 0) return false;
  let sum = 0;
  for (const w of weights) {
    if (w === null) return false;
    sum += w;
  }
  return sum === BP_TOTAL;
}

export type GroupWeightResolution =
  | { ok: true; weights: Array<number | null>; reset: boolean }
  | { ok: false; reason: 'existing_weighted' };

/**
 * Resuelve los pesos de los hermanos nuevos de un grupo (RN-P6, todo-o-nada).
 *  - Sin nada nuevo: no hay nada que resolver.
 *  - Grupo con hermanos existentes sin peso: los nuevos entran sin peso.
 *  - Grupo con hermanos existentes ponderados: los nuevos no pueden entrar sin romper la suma (conflicto).
 *  - Grupo vacío: los nuevos conservan sus pesos solo si están todos y suman 10000; si no, ninguno.
 */
export function resolveGroupWeights(
  existing: ReadonlyArray<number | null>,
  incoming: ReadonlyArray<number | null>,
): GroupWeightResolution {
  if (incoming.length === 0) return { ok: true, weights: [], reset: false };
  if (existing.length > 0) {
    if (existing.some((w) => w !== null)) return { ok: false, reason: 'existing_weighted' };
    return { ok: true, weights: incoming.map(() => null), reset: incoming.some((w) => w !== null) };
  }
  if (isCompleteAndSumsTotal(incoming)) return { ok: true, weights: [...incoming], reset: false };
  return { ok: true, weights: incoming.map(() => null), reset: incoming.some((w) => w !== null) };
}

/** Pesos de tareas al moverlas a un proyecto: se conservan solo si están todas y suman 10000. */
function resolveTaskWeights(tasks: ReadonlyArray<PlannedTask>): { tasks: PlannedTask[]; reset: boolean } {
  const keep = isCompleteAndSumsTotal(tasks.map((t) => t.weightBp));
  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      weightBp: keep ? t.weightBp : null,
      progressBp: t.progressBp,
    })),
    reset: !keep && tasks.some((t) => t.weightBp !== null),
  };
}

function projectDates(
  tasks: ReadonlyArray<LegacyTask>,
  period: { startsAt: Date; endsAt: Date },
): { startsAt: Date; endsAt: Date } {
  if (tasks.length === 0) return { startsAt: period.startsAt, endsAt: period.endsAt };
  let min = tasks[0]!.startsAt.getTime();
  let max = tasks[0]!.endsAt.getTime();
  for (const t of tasks) {
    min = Math.min(min, t.startsAt.getTime());
    max = Math.max(max, t.endsAt.getTime());
  }
  return { startsAt: new Date(min), endsAt: new Date(max) };
}

/** Planifica la migración de los KR no migrados de UN objetivo. */
export function planObjectiveMigration(input: PlanInput): ObjectiveMigrationPlan {
  const conflicts: PlanConflict[] = [];
  const takenMetrics = new Set(input.existingMetricIds);

  const indicatorCandidates: PlannedIndicator[] = [];
  const projectCandidates: PlannedProject[] = [];

  for (const kr of input.krs) {
    if (kr.progressMode === 'automatic' && kr.link) {
      if (takenMetrics.has(kr.link.metricId)) {
        conflicts.push({ krId: kr.id, reason: 'metric_already_linked_to_objective' });
        continue;
      }
      takenMetrics.add(kr.link.metricId);
      indicatorCandidates.push({
        krId: kr.id,
        metricId: kr.link.metricId,
        baselineValue: kr.link.baselineValue,
        targetValue: kr.link.targetValue,
        direction: kr.link.direction,
        weightBp: kr.weightBp,
      });
      if (kr.tasks.length > 0) {
        const dates = projectDates(kr.tasks, input.period);
        projectCandidates.push({
          krId: kr.id,
          origin: 'tasks_of_automatic_kr',
          title: truncate(`Tareas de ${kr.title}`, TITLE_MAX),
          description: null,
          ownerUserId: kr.ownerUserId,
          // El peso del KR lo consume el indicador; el proyecto de tareas no tiene peso propio.
          weightBp: null,
          ...dates,
          tasks: kr.tasks.map((t) => ({ id: t.id, weightBp: t.weightBp, progressBp: t.progressBp })),
        });
      }
      continue;
    }

    const dates = projectDates(kr.tasks, input.period);
    projectCandidates.push({
      krId: kr.id,
      origin: kr.progressMode === 'automatic' ? 'automatic_kr_without_link' : 'manual_kr',
      title: truncate(kr.title, TITLE_MAX),
      description: kr.description,
      ownerUserId: kr.ownerUserId,
      weightBp: kr.weightBp,
      ...dates,
      tasks: kr.tasks.map((t) => ({ id: t.id, weightBp: t.weightBp, progressBp: t.progressBp })),
    });
  }

  const weightGroupsReset = { indicators: 0, projects: 0, tasks: 0 };

  // Si el objetivo ya tiene hermanos ponderados en un grupo donde hay que agregar, no se puede entrar sin
  // romper la suma (RN-P6): el objetivo entero queda para una próxima corrida, con el conflicto reportado.
  const indRes = resolveGroupWeights(
    input.existingIndicatorWeights,
    indicatorCandidates.map((i) => i.weightBp),
  );
  const projRes = resolveGroupWeights(
    input.existingProjectWeights,
    projectCandidates.map((p) => p.weightBp),
  );
  if (!indRes.ok || !projRes.ok) {
    const blocked: PlanConflict[] = [];
    for (const kr of input.krs) {
      if (conflicts.some((c) => c.krId === kr.id)) continue;
      blocked.push({
        krId: kr.id,
        reason: !indRes.ok && indicatorCandidates.some((i) => i.krId === kr.id)
          ? 'existing_indicators_weighted'
          : 'existing_projects_weighted',
      });
    }
    return {
      indicators: [],
      projects: [],
      conflicts: [...conflicts, ...blocked],
      weightGroupsReset,
    };
  }

  if (indRes.reset) weightGroupsReset.indicators += 1;
  if (projRes.reset) weightGroupsReset.projects += 1;

  const indicators = indicatorCandidates.map((i, idx) => ({ ...i, weightBp: indRes.weights[idx] ?? null }));
  const projects = projectCandidates.map((p, idx) => {
    const tw = resolveTaskWeights(p.tasks);
    if (tw.reset) weightGroupsReset.tasks += 1;
    return { ...p, weightBp: projRes.weights[idx] ?? null, tasks: tw.tasks };
  });

  return { indicators, projects, conflicts, weightGroupsReset };
}
