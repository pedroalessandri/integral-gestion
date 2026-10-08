-- Migration: 20261008000004_project_contribution
-- Planificación de gobierno (ADR-0009 D2/D5, SPEC §3.1 / RN-P12, RN-P13, RN-P14) — F7/C17. Fase "expand".
-- 1. metrics.project_contribution: aporte de un proyecto a un indicador `output` (execution_feeds_indicator).
--    Único por par (proyecto, indicador). `applied_entry_id` = carga automática positiva vigente (null = no aplicada).
-- 2. metrics.metric_entry: `origin` ('manual' | 'project_contribution') y `source_project_id` para distinguir las
--    cargas automáticas de las manuales (RN-P14). Las filas existentes quedan 'manual'.
-- No toca audit.event (sin UPDATE/DELETE).

-- ── 1. metrics.project_contribution ─────────────────────────────────────────
CREATE TABLE "metrics"."project_contribution" (
  "id"                       TEXT           NOT NULL,
  "organization_id"          TEXT           NOT NULL,
  -- FK a okr.project por SQL crudo (convención cross-schema, sin relación en Prisma).
  "project_id"               TEXT           NOT NULL,
  "objective_indicator_id"   TEXT           NOT NULL,
  "contribution_value"       DECIMAL(18, 4) NOT NULL,
  "applied_entry_id"         TEXT,
  "created_at"               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "project_contribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_project_contribution_value_nonzero" CHECK ("contribution_value" <> 0)
);

ALTER TABLE "metrics"."project_contribution"
  ADD CONSTRAINT "project_contribution_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_contribution_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "okr"."project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_contribution_objective_indicator_id_fkey"
    FOREIGN KEY ("objective_indicator_id") REFERENCES "metrics"."objective_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_contribution_applied_entry_id_fkey"
    FOREIGN KEY ("applied_entry_id") REFERENCES "metrics"."metric_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-0009 D2: un aporte por par proyecto <-> indicador.
CREATE UNIQUE INDEX "uq_project_contribution_pair" ON "metrics"."project_contribution"("project_id", "objective_indicator_id");
CREATE INDEX "idx_project_contribution_org"       ON "metrics"."project_contribution"("organization_id");
CREATE INDEX "idx_project_contribution_indicator" ON "metrics"."project_contribution"("objective_indicator_id");
CREATE INDEX "idx_project_contribution_project"   ON "metrics"."project_contribution"("project_id");

-- ── 2. metrics.metric_entry: origen de la carga ─────────────────────────────
ALTER TABLE "metrics"."metric_entry"
  ADD COLUMN "origin"            VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN "source_project_id" TEXT;

ALTER TABLE "metrics"."metric_entry"
  ADD CONSTRAINT "chk_metric_entry_origin" CHECK ("origin" IN ('manual', 'project_contribution')),
  -- Una carga automática siempre dice de qué proyecto viene; una manual nunca.
  ADD CONSTRAINT "chk_metric_entry_source_project" CHECK (
    ("origin" = 'manual' AND "source_project_id" IS NULL)
    OR ("origin" = 'project_contribution' AND "source_project_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "metric_entry_source_project_id_fkey"
    FOREIGN KEY ("source_project_id") REFERENCES "okr"."project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_metric_entry_source_project" ON "metrics"."metric_entry"("source_project_id");
