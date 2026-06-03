-- Migration: 20260501000001_objective_owner
-- Adds optional owner_user_id (FK → core.user) to okr.objective.

ALTER TABLE "okr"."objective"
  ADD COLUMN "owner_user_id"  TEXT NULL
    REFERENCES "core"."user"("id") ON DELETE SET NULL;

CREATE INDEX "idx_objective_owner" ON "okr"."objective"("owner_user_id");
