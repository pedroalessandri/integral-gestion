import type { PrismaTransactionClient } from '../../audit/context/transaction-context-storage.js';

/**
 * Recálculo de la lectura de GESTIÓN (RN-P8, ADR-0009 D4):
 *   Task.progressBp -> Project.progressCachedBp -> Objective.executionProgressCachedBp.
 *
 * Es independiente del camino KR legacy (`recompute.ts`, que escribe `progressCachedBp` del objetivo)
 * y de la lectura de resultado (`resultProgressCachedBp`, F4): nunca se combinan. La matemática vive en
 * `@gestion-publica/okr-domain` y se recibe por parámetro (mismo patrón que `recompute.ts`).
 * Todo-o-nada de pesos (RN-P6) lo garantiza el service antes de persistir; un grupo mixto o con suma
 * incorrecta acá es corrupción y el dominio lo rechaza con su error tipado (no se corrige en silencio).
 *
 * Estas funciones deben llamarse dentro de una transacción activa. `tx` es el cliente crudo: todas las
 * queries filtran por organizationId a mano.
 */

type ProgressFn = (items: Array<{ weightBp: number | null; progressBp: number }>) => number;

/**
 * Bloquea la fila del proyecto (`SELECT ... FOR UPDATE`) para serializar las mutaciones concurrentes de
 * tareas del mismo proyecto y su recálculo (AGENTS.md, gotcha 5).
 */
export async function lockProject(
  tx: PrismaTransactionClient,
  projectId: string,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "okr"."project" WHERE id = ${projectId} AND organization_id = ${organizationId} FOR UPDATE`;
}

/**
 * Bloquea la fila del objetivo (`SELECT ... FOR UPDATE`) para serializar las mutaciones concurrentes del
 * grupo de proyectos hermanos (alta, baja, pesos) y el recálculo de su avance de gestión.
 */
export async function lockObjective(
  tx: PrismaTransactionClient,
  objectiveId: string,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "okr"."objective" WHERE id = ${objectiveId} AND organization_id = ${organizationId} FOR UPDATE`;
}

/**
 * Recalcula `Objective.executionProgressCachedBp` a partir del `progressCachedBp` de sus proyectos vivos
 * (promedio ponderado o simple según RN-P6; vacío -> 0).
 */
export async function recomputeObjectiveExecution(
  tx: PrismaTransactionClient,
  objectiveId: string,
  organizationId: string,
  computeExecutionProgressFn: ProgressFn,
): Promise<number> {
  const projects = await tx.project.findMany({
    where: { objectiveId, organizationId, deletedAt: null },
    select: { weightBp: true, progressCachedBp: true },
  });

  const executionProgressCachedBp = computeExecutionProgressFn(
    projects.map((p) => ({ weightBp: p.weightBp, progressBp: p.progressCachedBp })),
  );

  await tx.objective.update({
    where: { id: objectiveId },
    data: { executionProgressCachedBp },
  });
  return executionProgressCachedBp;
}

/**
 * Recalcula `Project.progressCachedBp` desde sus tareas vivas y cascada al objetivo.
 * Un proyecto `from_indicator` no toma su avance de las tareas (informativas): solo se reagrega el objetivo.
 * Devuelve el `objectiveId` del proyecto.
 */
export async function recomputeProjectAndObjectiveExecution(
  tx: PrismaTransactionClient,
  projectId: string,
  organizationId: string,
  computeProjectProgressFn: ProgressFn,
  computeExecutionProgressFn: ProgressFn,
): Promise<string> {
  const project = await tx.project.findFirstOrThrow({
    where: { id: projectId, organizationId },
    select: { objectiveId: true, progressMode: true },
  });

  if (project.progressMode === 'from_tasks') {
    const tasks = await tx.task.findMany({
      where: { projectId, organizationId, deletedAt: null },
      select: { weightBp: true, progressBp: true },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { progressCachedBp: computeProjectProgressFn(tasks) },
    });
  }

  await recomputeObjectiveExecution(tx, project.objectiveId, organizationId, computeExecutionProgressFn);
  return project.objectiveId;
}
