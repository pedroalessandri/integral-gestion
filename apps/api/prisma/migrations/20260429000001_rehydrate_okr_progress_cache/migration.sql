-- Migration: 20260429000001_rehydrate_okr_progress_cache
-- One-shot recomputation of stale progressCachedBp values on okr.key_result and okr.objective.
--
-- Root cause: prior to this change, the task progress update path (setProgress) correctly
-- recomputed KR.progressCachedBp, but the task update (weight change) and task soft-delete
-- paths did NOT recompute, leaving stale cached values.  Production rows with all tasks at
-- 100% could show KR.progressCachedBp = 0.
--
-- Formula mirrors the TypeScript helpers in packages/okr-domain/src/cascade.ts:
--
--   KR.progressCachedBp =
--     CASE
--       WHEN (no non-deleted tasks exist for the KR)          -> 0
--       WHEN (SUM(task.weight_bp) over non-deleted tasks <> 10000)  -> 0   [plan imbalanced]
--       ELSE TRUNC( SUM(task.weight_bp * task.progress_bp) / 10000 )
--     END
--
--   Objective.progressCachedBp =
--     CASE
--       WHEN (no non-deleted KRs exist for the objective)      -> 0
--       WHEN (SUM(kr.weight_bp) over non-deleted KRs <> 10000) -> 0   [KR weights imbalanced]
--       ELSE TRUNC( SUM(kr.weight_bp * kr.progress_cached_bp) / 10000 )
--     END
--
-- IMPORTANT: this migration runs after the KR cache column update below,
-- so the Objective CTE reads the freshly computed KR values, not the stale ones.
-- Both updates are in a single transaction block (Prisma migrations are wrapped
-- in a transaction by default for PostgreSQL).

-- Step 1: recompute KR.progressCachedBp
WITH kr_recomputed AS (
  SELECT
    kr.id AS kr_id,
    CASE
      -- No non-deleted tasks → 0
      WHEN COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) = 0
        THEN 0
      -- Task weights don't sum to 10000bp → 0 (plan imbalanced; matches JS short-circuit)
      WHEN SUM(t.weight_bp) FILTER (WHERE t.deleted_at IS NULL) <> 10000
        THEN 0
      -- Balanced: weighted-average progress, truncated (not rounded)
      ELSE TRUNC(
        SUM(t.weight_bp * t.progress_bp) FILTER (WHERE t.deleted_at IS NULL)::NUMERIC
        / 10000
      )::INT
    END AS new_progress_cached_bp
  FROM "okr"."key_result" kr
  LEFT JOIN "okr"."task" t ON t.key_result_id = kr.id
  WHERE kr.deleted_at IS NULL
  GROUP BY kr.id
)
UPDATE "okr"."key_result" kr
SET    progress_cached_bp = r.new_progress_cached_bp
FROM   kr_recomputed r
WHERE  kr.id = r.kr_id
  AND  kr.progress_cached_bp <> r.new_progress_cached_bp;  -- skip no-op rows

-- Step 2: recompute Objective.progressCachedBp (reads the freshly updated KR values above)
WITH obj_recomputed AS (
  SELECT
    o.id AS obj_id,
    CASE
      -- No non-deleted KRs → 0
      WHEN COUNT(kr.id) FILTER (WHERE kr.deleted_at IS NULL) = 0
        THEN 0
      -- KR weights don't sum to 10000bp → 0 (objective not fully weighted)
      WHEN SUM(kr.weight_bp) FILTER (WHERE kr.deleted_at IS NULL) <> 10000
        THEN 0
      -- Balanced: weighted-average of KR cached progress, truncated
      ELSE TRUNC(
        SUM(kr.weight_bp * kr.progress_cached_bp) FILTER (WHERE kr.deleted_at IS NULL)::NUMERIC
        / 10000
      )::INT
    END AS new_progress_cached_bp
  FROM "okr"."objective" o
  LEFT JOIN "okr"."key_result" kr ON kr.objective_id = o.id
  WHERE o.deleted_at IS NULL
  GROUP BY o.id
)
UPDATE "okr"."objective" o
SET    progress_cached_bp = r.new_progress_cached_bp
FROM   obj_recomputed r
WHERE  o.id = r.obj_id
  AND  o.progress_cached_bp <> r.new_progress_cached_bp;  -- skip no-op rows
