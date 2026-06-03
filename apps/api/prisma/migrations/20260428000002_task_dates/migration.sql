-- Migration: 20260428000002_task_dates
-- Add starts_at and ends_at to okr.task (NOT NULL).
-- Existing rows are backfilled from the parent Period via the chain:
--   okr.task -> okr.key_result -> okr.objective -> core.period

-- Step 1: add as nullable so existing rows don't violate NOT NULL during ALTER
ALTER TABLE "okr"."task"
  ADD COLUMN "starts_at" TIMESTAMPTZ(6),
  ADD COLUMN "ends_at"   TIMESTAMPTZ(6);

-- Step 2: backfill from parent period
UPDATE "okr"."task" t
SET
  starts_at = p.starts_at,
  ends_at   = p.ends_at
FROM "okr"."key_result" kr
  JOIN "okr"."objective" o  ON o.id = kr.objective_id
  JOIN "core"."period"   p  ON p.id = o.period_id
WHERE kr.id = t.key_result_id;

-- Step 3: enforce NOT NULL
ALTER TABLE "okr"."task"
  ALTER COLUMN "starts_at" SET NOT NULL,
  ALTER COLUMN "ends_at"   SET NOT NULL;
