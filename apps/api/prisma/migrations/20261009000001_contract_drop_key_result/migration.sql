-- F10 contract (ADR-0009 D6): se elimina el camino KeyResult.
-- NO toca audit.event (append-only): los eventos históricos de KR quedan.
-- NO borra datos de negocio vivos para satisfacer NOT NULL: si hay filas con NULL
-- (vivas o borradas) la migración aborta y hay que resolverlas a mano.

-- ── 0. Precondición: objective.org_unit_id y task.project_id sin NULL ─────────
DO $$
DECLARE
  obj_null_live    BIGINT;
  obj_null_deleted BIGINT;
  task_null_live    BIGINT;
  task_null_deleted BIGINT;
BEGIN
  SELECT count(*) FILTER (WHERE deleted_at IS NULL), count(*) FILTER (WHERE deleted_at IS NOT NULL)
    INTO obj_null_live, obj_null_deleted
    FROM "okr"."objective" WHERE "org_unit_id" IS NULL;
  SELECT count(*) FILTER (WHERE deleted_at IS NULL), count(*) FILTER (WHERE deleted_at IS NOT NULL)
    INTO task_null_live, task_null_deleted
    FROM "okr"."task" WHERE "project_id" IS NULL;

  IF obj_null_live + obj_null_deleted + task_null_live + task_null_deleted > 0 THEN
    RAISE EXCEPTION
      'contract F10 abortado: okr.objective con org_unit_id NULL (vivos=%, borrados=%); okr.task con project_id NULL (vivas=%, borradas=%). Corregir o eliminar esas filas manualmente (PA-1: datos viejos descartables) y reintentar.',
      obj_null_live, obj_null_deleted, task_null_live, task_null_deleted;
  END IF;
END $$;

-- ── 1. metrics.metric_kr_link ────────────────────────────────────────────────
DROP TABLE "metrics"."metric_kr_link";

-- ── 2. okr.task: camino KR ───────────────────────────────────────────────────
ALTER TABLE "okr"."task" DROP CONSTRAINT "chk_task_parent_xor";
ALTER TABLE "okr"."task" DROP CONSTRAINT "chk_task_kr_weight";
DROP INDEX IF EXISTS "okr"."uq_task_kr_title_active";
DROP INDEX IF EXISTS "okr"."idx_task_kr";
ALTER TABLE "okr"."task" DROP CONSTRAINT "task_key_result_id_fkey";
ALTER TABLE "okr"."task" DROP COLUMN "key_result_id";
ALTER TABLE "okr"."task" ALTER COLUMN "project_id" SET NOT NULL;

-- ── 3. okr.key_result ────────────────────────────────────────────────────────
DROP TABLE "okr"."key_result";

-- ── 4. okr.objective ─────────────────────────────────────────────────────────
ALTER TABLE "okr"."objective" DROP COLUMN "progress_cached_bp";
ALTER TABLE "okr"."objective" ALTER COLUMN "org_unit_id" SET NOT NULL;

-- ── 5. Columnas legacy_key_result_id (+ índice parcial) ──────────────────────
DROP INDEX IF EXISTS "okr"."uq_project_legacy_key_result";
ALTER TABLE "okr"."project" DROP COLUMN "legacy_key_result_id";
DROP INDEX IF EXISTS "metrics"."uq_objective_indicator_legacy_key_result";
ALTER TABLE "metrics"."objective_indicator" DROP COLUMN "legacy_key_result_id";
