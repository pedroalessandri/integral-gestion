-- Migration: 20260422000001_kr_task_description_owner
-- Adds optional description (TEXT) and owner_user_id (FK → core.user) to
-- okr.key_result and okr.task.

-- okr.key_result
ALTER TABLE "okr"."key_result"
  ADD COLUMN "description"    TEXT NULL,
  ADD COLUMN "owner_user_id"  TEXT NULL
    REFERENCES "core"."user"("id") ON DELETE SET NULL;

CREATE INDEX "idx_kr_owner_user" ON "okr"."key_result"("owner_user_id");

-- okr.task
ALTER TABLE "okr"."task"
  ADD COLUMN "description"    TEXT NULL,
  ADD COLUMN "owner_user_id"  TEXT NULL
    REFERENCES "core"."user"("id") ON DELETE SET NULL;

CREATE INDEX "idx_task_owner_user" ON "okr"."task"("owner_user_id");
