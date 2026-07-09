import type { PrismaTransactionClient } from '../../audit/context/transaction-context-storage.js';

/**
 * Shared cascade-recompute helpers for the OKR module.
 *
 * The cascade is: Task progress → KeyResult.progressCachedBp → Objective.progressCachedBp.
 * Per docs/features/indicadores-okr.md (RN-O4), a KeyResult whose `progressMode`
 * is 'automatic' does NOT derive its progress from tasks — its cache is owned by
 * the linked indicator (written via KeyResultService.applyAutomaticKrProgress).
 * Tasks under an automatic KR remain operational but purely informative.
 *
 * These helpers must be called inside an active transaction.
 */

/**
 * Recompute a KeyResult's cached progress from its active tasks, UNLESS the KR
 * is in 'automatic' mode (in which case its cache is left untouched, owned by the
 * indicator). Returns the parent objectiveId so the caller can cascade upward.
 *
 * Short-circuit rule for manual KRs (mirrors computeKrProgress):
 *  - No active tasks → 0.
 *  - Active tasks don't sum to 10000bp → 0 (plan imbalanced).
 */
export async function recomputeKrFromTasks(
  tx: PrismaTransactionClient,
  keyResultId: string,
  organizationId: string,
  computeKrProgressFn: (tasks: Array<{ weightBp: number; progressBp: number }>) => number,
): Promise<string> {
  const kr = await tx.keyResult.findFirstOrThrow({
    where: { id: keyResultId, organizationId },
    select: { objectiveId: true, progressMode: true },
  });

  // Automatic KR: the indicator owns the cache; never overwrite from tasks.
  if ((kr as { progressMode: string }).progressMode === 'automatic') {
    return (kr as { objectiveId: string }).objectiveId;
  }

  const allKrTasks = await tx.task.findMany({
    where: { keyResultId, organizationId, deletedAt: null },
    select: { weightBp: true, progressBp: true },
  });

  const krTaskSum = (allKrTasks as Array<{ weightBp: number }>).reduce(
    (acc, t) => acc + t.weightBp,
    0,
  );
  let newKrProgressBp = 0;
  if (allKrTasks.length > 0 && krTaskSum === 10000) {
    newKrProgressBp = computeKrProgressFn(
      allKrTasks as Array<{ weightBp: number; progressBp: number }>,
    );
  }

  await tx.keyResult.update({
    where: { id: keyResultId },
    data: { progressCachedBp: newKrProgressBp },
  });

  return (kr as { objectiveId: string }).objectiveId;
}

/**
 * Recompute an Objective's cached progress from its active KRs' cached progress.
 * This step is mode-agnostic: it reads each KR's current progressCachedBp,
 * whether that value came from tasks (manual) or from an indicator (automatic).
 *
 * Short-circuit rule (mirrors computeObjectiveProgress):
 *  - No active KRs → 0.
 *  - Active KRs don't sum to 10000bp → 0 (plan imbalanced).
 */
export async function recomputeObjectiveFromKrs(
  tx: PrismaTransactionClient,
  objectiveId: string,
  organizationId: string,
  computeObjectiveProgressFn: (krs: Array<{ weightBp: number; progressBp: number }>) => number,
): Promise<void> {
  const allObjKrs = await tx.keyResult.findMany({
    where: { objectiveId, organizationId, deletedAt: null },
    select: { weightBp: true, progressCachedBp: true },
  });

  const krSum = (allObjKrs as Array<{ weightBp: number }>).reduce(
    (acc, kr) => acc + kr.weightBp,
    0,
  );
  let newObjProgressBp = 0;
  if (allObjKrs.length > 0 && krSum === 10000) {
    newObjProgressBp = computeObjectiveProgressFn(
      (allObjKrs as Array<{ weightBp: number; progressCachedBp: number }>).map((kr) => ({
        weightBp: kr.weightBp,
        progressBp: kr.progressCachedBp,
      })),
    );
  }

  await tx.objective.update({
    where: { id: objectiveId },
    data: { progressCachedBp: newObjProgressBp },
  });
}

/**
 * Recompute a KR's cached progress from its tasks (branch-aware) and then cascade
 * to the parent Objective. Manual KRs recompute from tasks; automatic KRs keep
 * their indicator-derived cache and only the objective is re-aggregated.
 */
export async function recomputeKrAndObjectiveProgress(
  tx: PrismaTransactionClient,
  keyResultId: string,
  organizationId: string,
  computeKrProgressFn: (tasks: Array<{ weightBp: number; progressBp: number }>) => number,
  computeObjectiveProgressFn: (krs: Array<{ weightBp: number; progressBp: number }>) => number,
): Promise<void> {
  const objectiveId = await recomputeKrFromTasks(
    tx,
    keyResultId,
    organizationId,
    computeKrProgressFn,
  );
  await recomputeObjectiveFromKrs(tx, objectiveId, organizationId, computeObjectiveProgressFn);
}
