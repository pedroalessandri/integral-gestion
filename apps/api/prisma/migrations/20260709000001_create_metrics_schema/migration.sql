-- Migration: 20260709000001_create_metrics_schema
-- Creates the "metrics" schema with metric + metric_entry tables.
-- Módulo 1 "Indicadores de gestión" — per docs/features/indicadores-modelo-comun.md.
-- Values use DECIMAL(18,4) (never Float). Entries store INCREMENTS, not accumulated values.

CREATE SCHEMA IF NOT EXISTS "metrics";

-- ── metrics.metric ────────────────────────────────────────────────────────────

CREATE TABLE "metrics"."metric" (
  "id"              TEXT          NOT NULL,
  "organization_id" TEXT          NOT NULL,
  "period_id"       TEXT          NOT NULL,
  "name"            VARCHAR(200)  NOT NULL,
  "unit"            VARCHAR(10)   NOT NULL,
  "direction"       VARCHAR(10)   NOT NULL,
  "frequency"       VARCHAR(10)   NOT NULL,
  "baseline_value"  DECIMAL(18,4) NOT NULL DEFAULT 0,
  "target_value"    DECIMAL(18,4) NOT NULL,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "metric_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_metric_unit"      CHECK (unit IN ('number', 'percent', 'currency')),
  CONSTRAINT "chk_metric_direction" CHECK (direction IN ('increasing', 'decreasing')),
  CONSTRAINT "chk_metric_frequency" CHECK (frequency IN ('weekly', 'biweekly', 'monthly'))
);

ALTER TABLE "metrics"."metric"
  ADD CONSTRAINT "metric_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "metric_period_id_fkey"       FOREIGN KEY ("period_id")       REFERENCES "core"."period"("id")       ON DELETE RESTRICT;

CREATE INDEX "idx_metric_org_period" ON "metrics"."metric"("organization_id", "period_id");
CREATE INDEX "idx_metric_deleted_at" ON "metrics"."metric"("deleted_at");

-- RN-M1: name unique per (org, period), case-insensitive, among non-deleted metrics.
-- Partial functional index — cannot be expressed in Prisma (documented in schema.prisma).
CREATE UNIQUE INDEX "uq_metric_org_period_name"
  ON "metrics"."metric"("organization_id", "period_id", LOWER("name"))
  WHERE "deleted_at" IS NULL;

-- ── metrics.metric_entry ──────────────────────────────────────────────────────

CREATE TABLE "metrics"."metric_entry" (
  "id"                 TEXT          NOT NULL,
  "metric_id"          TEXT          NOT NULL,
  "organization_id"    TEXT          NOT NULL,
  "bucket_date"        DATE          NOT NULL,
  "increment_value"    DECIMAL(18,4) NOT NULL,
  "comment"            TEXT,
  "created_by_user_id" TEXT          NOT NULL,
  "deleted_at"         TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT "metric_entry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "metrics"."metric_entry"
  ADD CONSTRAINT "metric_entry_metric_id_fkey"       FOREIGN KEY ("metric_id")       REFERENCES "metrics"."metric"("id")     ON DELETE RESTRICT,
  ADD CONSTRAINT "metric_entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id")  ON DELETE RESTRICT;

CREATE INDEX "idx_metric_entry_metric_bucket" ON "metrics"."metric_entry"("metric_id", "bucket_date");
CREATE INDEX "idx_metric_entry_org"           ON "metrics"."metric_entry"("organization_id");
