-- Migration: 20261007000003_project_task_project
-- Planificación de gobierno (ADR-0009 D2/D6, SPEC §3.1) — F3/C08. Fase "expand".
-- 1. okr.project (N5) con pesos opcionales (RN-P6) y progress_mode.
-- 2. okr.objective: result_progress_cached_bp y execution_progress_cached_bp (dos lecturas, nunca fusionadas).
-- 3. okr.task: project_id, key_result_id y weight_bp pasan a nullable; una tarea cuelga de un proyecto O de un KR.
-- No toca audit.event (sin UPDATE/DELETE).

-- ── 1. okr.project ───────────────────────────────────────────────────────────
CREATE TABLE "okr"."project" (
  "id"                              TEXT         NOT NULL,
  "objective_id"                    TEXT         NOT NULL,
  "organization_id"                 TEXT         NOT NULL,
  "org_unit_id"                     TEXT         NOT NULL,
  "title"                           VARCHAR(200) NOT NULL,
  "description"                     TEXT,
  "owner_user_id"                   TEXT,
  "weight_bp"                       INTEGER,
  "starts_at"                       TIMESTAMPTZ(6) NOT NULL,
  "ends_at"                         TIMESTAMPTZ(6) NOT NULL,
  "progress_mode"                   VARCHAR(15)  NOT NULL DEFAULT 'from_tasks',
  -- Sin FK hasta F4: metrics.objective_indicator todavía no existe (se agrega por SQL crudo).
  "source_objective_indicator_id"   TEXT,
  "progress_cached_bp"              INTEGER      NOT NULL DEFAULT 0,
  -- Idempotencia del script de migración KR -> Project (ADR-0009 D6). Sin FK: se elimina en el contract.
  "legacy_key_result_id"            TEXT,
  "deleted_at"                      TIMESTAMP(3),
  "created_at"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_project_dates"         CHECK ("ends_at" >= "starts_at"),
  CONSTRAINT "chk_project_progress_mode" CHECK ("progress_mode" IN ('from_tasks', 'from_indicator')),
  CONSTRAINT "chk_project_source_mode"   CHECK ("source_objective_indicator_id" IS NULL OR "progress_mode" = 'from_indicator'),
  CONSTRAINT "chk_project_weight_bp"     CHECK ("weight_bp" IS NULL OR ("weight_bp" >= 0 AND "weight_bp" <= 10000)),
  CONSTRAINT "chk_project_progress_bp"   CHECK ("progress_cached_bp" >= 0 AND "progress_cached_bp" <= 10000)
);

ALTER TABLE "okr"."project"
  ADD CONSTRAINT "project_objective_id_fkey"    FOREIGN KEY ("objective_id")    REFERENCES "okr"."objective"("id")    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_org_unit_id_fkey"     FOREIGN KEY ("org_unit_id")     REFERENCES "core"."org_unit"("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_owner_user_id_fkey"   FOREIGN KEY ("owner_user_id")   REFERENCES "core"."user"("id")         ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_project_org_objective" ON "okr"."project"("organization_id", "objective_id");
CREATE INDEX "idx_project_objective"     ON "okr"."project"("objective_id");
CREATE INDEX "idx_project_org_unit"      ON "okr"."project"("org_unit_id");
CREATE INDEX "idx_project_owner"         ON "okr"."project"("owner_user_id");
CREATE INDEX "idx_project_deleted_at"    ON "okr"."project"("deleted_at");

-- ADR-0009 D6: unique parcial para la idempotencia de la migración.
CREATE UNIQUE INDEX "uq_project_legacy_key_result" ON "okr"."project"("legacy_key_result_id")
  WHERE "legacy_key_result_id" IS NOT NULL;

-- ── 2. okr.objective: las dos lecturas de avance ─────────────────────────────
ALTER TABLE "okr"."objective"
  ADD COLUMN "result_progress_cached_bp"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "execution_progress_cached_bp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "okr"."objective"
  ADD CONSTRAINT "chk_objective_result_progress_bp"    CHECK ("result_progress_cached_bp" >= 0 AND "result_progress_cached_bp" <= 10000),
  ADD CONSTRAINT "chk_objective_execution_progress_bp" CHECK ("execution_progress_cached_bp" >= 0 AND "execution_progress_cached_bp" <= 10000);

-- ── 3. okr.task: project_id, key_result_id y weight_bp nullable ──────────────
ALTER TABLE "okr"."task"
  ADD COLUMN "project_id" TEXT,
  ALTER COLUMN "key_result_id" DROP NOT NULL,
  ALTER COLUMN "weight_bp"     DROP NOT NULL;

ALTER TABLE "okr"."task"
  ADD CONSTRAINT "task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "okr"."project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_task_project" ON "okr"."task"("project_id");

-- Una tarea cuelga de un proyecto O de un KR legacy (nunca de ambos ni de ninguno).
ALTER TABLE "okr"."task"
  ADD CONSTRAINT "chk_task_parent_xor"   CHECK (("project_id" IS NULL) <> ("key_result_id" IS NULL)),
  -- El camino KR legacy sigue exigiendo peso; solo las tareas de proyecto pueden no tenerlo (RN-P6).
  ADD CONSTRAINT "chk_task_kr_weight"    CHECK ("key_result_id" IS NULL OR "weight_bp" IS NOT NULL),
  ADD CONSTRAINT "chk_task_weight_bp"    CHECK ("weight_bp" IS NULL OR ("weight_bp" >= 0 AND "weight_bp" <= 10000));
