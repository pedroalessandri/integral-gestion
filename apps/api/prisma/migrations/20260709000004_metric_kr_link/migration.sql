-- Migration: 20260709000004_metric_kr_link
-- Módulo 2 "Indicadores en OKRs" — per docs/features/indicadores-okr.md.
-- Adds progress_mode to okr.key_result and the metric↔KR / metric↔objective link tables.
-- Cross-schema FKs to okr.* are declared here in raw SQL (mirrors audit.event → core.*).

-- ── 1. okr.key_result.progress_mode ──────────────────────────────────────────
ALTER TABLE "okr"."key_result"
  ADD COLUMN "progress_mode" VARCHAR(10) NOT NULL DEFAULT 'manual';

ALTER TABLE "okr"."key_result"
  ADD CONSTRAINT "chk_key_result_progress_mode" CHECK (progress_mode IN ('manual', 'automatic'));

-- ── 2. metrics.metric_kr_link ────────────────────────────────────────────────
CREATE TABLE "metrics"."metric_kr_link" (
  "id"                 TEXT          NOT NULL,
  "metric_id"          TEXT          NOT NULL,
  "key_result_id"      TEXT          NOT NULL,
  "organization_id"    TEXT          NOT NULL,
  "baseline_value"     DECIMAL(18,4) NOT NULL,
  "target_value"       DECIMAL(18,4) NOT NULL,
  "direction"          VARCHAR(10)   NOT NULL,
  "created_by_user_id" TEXT          NOT NULL,
  "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "metric_kr_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_mkl_direction" CHECK (direction IN ('increasing', 'decreasing'))
);

ALTER TABLE "metrics"."metric_kr_link"
  ADD CONSTRAINT "metric_kr_link_metric_id_fkey"       FOREIGN KEY ("metric_id")       REFERENCES "metrics"."metric"("id")    ON DELETE RESTRICT,
  ADD CONSTRAINT "metric_kr_link_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "metric_kr_link_key_result_id_fkey"   FOREIGN KEY ("key_result_id")   REFERENCES "okr"."key_result"("id")    ON DELETE RESTRICT;

-- A KR has at most one link (RN-O1).
CREATE UNIQUE INDEX "metric_kr_link_key_result_id_key" ON "metrics"."metric_kr_link"("key_result_id");
CREATE INDEX "idx_mkl_metric" ON "metrics"."metric_kr_link"("metric_id");
CREATE INDEX "idx_mkl_org"    ON "metrics"."metric_kr_link"("organization_id");

-- ── 3. metrics.metric_objective_context ──────────────────────────────────────
CREATE TABLE "metrics"."metric_objective_context" (
  "metric_id"          TEXT        NOT NULL,
  "objective_id"       TEXT        NOT NULL,
  "organization_id"    TEXT        NOT NULL,
  "created_by_user_id" TEXT        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "metric_objective_context_pkey" PRIMARY KEY ("metric_id", "objective_id")
);

ALTER TABLE "metrics"."metric_objective_context"
  ADD CONSTRAINT "moc_metric_id_fkey"       FOREIGN KEY ("metric_id")       REFERENCES "metrics"."metric"("id")    ON DELETE RESTRICT,
  ADD CONSTRAINT "moc_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "moc_objective_id_fkey"    FOREIGN KEY ("objective_id")    REFERENCES "okr"."objective"("id")     ON DELETE RESTRICT;

CREATE INDEX "idx_moc_objective" ON "metrics"."metric_objective_context"("objective_id");
