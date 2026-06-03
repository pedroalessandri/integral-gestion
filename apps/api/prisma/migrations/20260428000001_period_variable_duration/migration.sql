-- Migration: 20260428000001_period_variable_duration
-- Makes Period duration variable (no longer YYYY-Qn enforced), non-editable after creation,
-- and soft-deletable. Updates the partial unique index to exclude soft-deleted rows.
--
-- Changes:
--  1. Widen code column from VARCHAR(7) to VARCHAR(50).
--  2. Drop chk_period_code_format (regex check for YYYY-Qn format).
--  3. Add chk_period_code_nonempty (non-empty after trim).
--  4. Add deleted_at TIMESTAMPTZ column (nullable) for soft-delete.
--  5. Add index on deleted_at (matches pattern of Task/KeyResult/Objective).
--  6. Drop and recreate uq_period_org_one_open to exclude soft-deleted rows.
--
-- 2026-04-28: Fixed DROP INDEX statement to be schema-qualified.
-- The original version `DROP INDEX IF EXISTS "uq_period_org_one_open"` (without
-- schema prefix) silently did nothing in production because the migration
-- runner's search_path doesn't include `core`. The subsequent CREATE UNIQUE
-- INDEX then collided with the existing index. Production DB was reset clean
-- after this fix.

-- 1. Widen code column
ALTER TABLE core."period" ALTER COLUMN "code" TYPE VARCHAR(50);

-- 2. Drop the YYYY-Qn format constraint
ALTER TABLE core."period" DROP CONSTRAINT IF EXISTS "chk_period_code_format";

-- 3. Add non-empty constraint
ALTER TABLE core."period" ADD CONSTRAINT "chk_period_code_nonempty"
    CHECK (char_length(trim("code")) > 0);

-- 4. Add soft-delete column
ALTER TABLE core."period" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

-- 5. Index on deleted_at (matches idx_objective_deleted_at etc. pattern)
CREATE INDEX IF NOT EXISTS "idx_period_deleted_at" ON core."period"("deleted_at");

-- 6. Update uq_period_org_one_open to also exclude soft-deleted periods
DROP INDEX IF EXISTS core."uq_period_org_one_open";
CREATE UNIQUE INDEX "uq_period_org_one_open"
    ON core."period" ("organization_id")
    WHERE status = 'open' AND deleted_at IS NULL;
