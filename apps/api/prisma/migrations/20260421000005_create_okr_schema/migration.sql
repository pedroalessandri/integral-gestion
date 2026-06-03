CREATE TABLE "okr"."objective" (
  "id"                 TEXT         NOT NULL,
  "organization_id"    TEXT         NOT NULL,
  "period_id"          TEXT         NOT NULL,
  "title"              VARCHAR(200) NOT NULL,
  "description"        TEXT,
  "progress_cached_bp" INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "objective_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_objective_progress" CHECK (progress_cached_bp >= 0 AND progress_cached_bp <= 10000)
);

CREATE TABLE "okr"."key_result" (
  "id"                 TEXT         NOT NULL,
  "objective_id"       TEXT         NOT NULL,
  "organization_id"    TEXT         NOT NULL,
  "title"              VARCHAR(200) NOT NULL,
  "weight_bp"          INTEGER      NOT NULL,
  "progress_cached_bp" INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "key_result_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_kr_weight"    CHECK (weight_bp >= 0 AND weight_bp <= 10000),
  CONSTRAINT "chk_kr_progress"  CHECK (progress_cached_bp >= 0 AND progress_cached_bp <= 10000)
);

CREATE TABLE "okr"."task" (
  "id"              TEXT         NOT NULL,
  "key_result_id"   TEXT         NOT NULL,
  "organization_id" TEXT         NOT NULL,
  "title"           VARCHAR(200) NOT NULL,
  "weight_bp"       INTEGER      NOT NULL,
  "progress_bp"     INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "task_pkey"         PRIMARY KEY ("id"),
  CONSTRAINT "chk_task_weight"   CHECK (weight_bp >= 0 AND weight_bp <= 10000),
  CONSTRAINT "chk_task_progress" CHECK (progress_bp >= 0 AND progress_bp <= 10000)
);

-- Foreign keys
ALTER TABLE "okr"."objective"
  ADD CONSTRAINT "objective_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "objective_period_id_fkey"        FOREIGN KEY ("period_id")       REFERENCES "core"."period"("id")       ON DELETE RESTRICT;

ALTER TABLE "okr"."key_result"
  ADD CONSTRAINT "key_result_objective_id_fkey"    FOREIGN KEY ("objective_id")    REFERENCES "okr"."objective"("id")     ON DELETE RESTRICT,
  ADD CONSTRAINT "key_result_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT;

ALTER TABLE "okr"."task"
  ADD CONSTRAINT "task_key_result_id_fkey"   FOREIGN KEY ("key_result_id")   REFERENCES "okr"."key_result"("id")  ON DELETE RESTRICT,
  ADD CONSTRAINT "task_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT;

-- Indexes
CREATE INDEX "idx_objective_org_period" ON "okr"."objective"("organization_id", "period_id");
CREATE INDEX "idx_objective_period"     ON "okr"."objective"("period_id");
CREATE INDEX "idx_kr_objective"         ON "okr"."key_result"("objective_id");
CREATE INDEX "idx_task_kr"              ON "okr"."task"("key_result_id");

-- Partial unique indexes (title uniqueness among active rows — cannot be expressed in Prisma inline)
CREATE UNIQUE INDEX "uq_objective_org_period_title_active"
  ON "okr"."objective" ("organization_id", "period_id", "title")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_kr_objective_title_active"
  ON "okr"."key_result" ("objective_id", "title")
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "uq_task_kr_title_active"
  ON "okr"."task" ("key_result_id", "title")
  WHERE deleted_at IS NULL;
