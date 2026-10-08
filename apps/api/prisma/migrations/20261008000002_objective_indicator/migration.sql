-- Migration: 20261008000002_objective_indicator
-- Planificación de gobierno (ADR-0009 D2/D5/D8, SPEC §3.1) — F4/C11. Fase "expand".
-- 1. metrics.objective_indicator: vínculo objetivo <-> métrica con base, meta, dirección, peso opcional,
--    modo de curva esperada y modo de vínculo con la gestión. Manda sobre Metric para el avance (D8).
-- 2. FK pendiente de C08: okr.project.source_objective_indicator_id -> metrics.objective_indicator.
-- No toca audit.event (sin UPDATE/DELETE).

-- ── 1. metrics.objective_indicator ───────────────────────────────────────────
CREATE TABLE "metrics"."objective_indicator" (
  "id"                    TEXT           NOT NULL,
  "organization_id"       TEXT           NOT NULL,
  -- FK a okr.objective por SQL crudo (convención cross-schema, sin relación en Prisma).
  "objective_id"          TEXT           NOT NULL,
  "metric_id"             TEXT           NOT NULL,
  "baseline_value"        DECIMAL(18, 4) NOT NULL,
  "target_value"          DECIMAL(18, 4) NOT NULL,
  "direction"             VARCHAR(10)    NOT NULL,
  -- Opcional, todo-o-nada entre indicadores hermanos del objetivo (RN-P6). Basis points 0..10000.
  "weight_bp"             INTEGER,
  "expected_curve_mode"   VARCHAR(15)    NOT NULL DEFAULT 'linear',
  "link_mode"             VARCHAR(30)    NOT NULL DEFAULT 'independent',
  "progress_cached_bp"    INTEGER        NOT NULL DEFAULT 0,
  -- Idempotencia del script de migración KR -> ObjectiveIndicator (ADR-0009 D6). Sin FK: se elimina en el contract.
  "legacy_key_result_id"  TEXT,
  "deleted_at"            TIMESTAMP(3),
  "created_at"            TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "objective_indicator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_objective_indicator_direction"  CHECK ("direction" IN ('increasing', 'decreasing')),
  CONSTRAINT "chk_objective_indicator_curve_mode" CHECK ("expected_curve_mode" IN ('linear', 'manual', 'from_projects')),
  CONSTRAINT "chk_objective_indicator_link_mode"  CHECK ("link_mode" IN ('independent', 'execution_feeds_indicator', 'indicator_feeds_execution')),
  CONSTRAINT "chk_objective_indicator_weight_bp"  CHECK ("weight_bp" IS NULL OR ("weight_bp" >= 0 AND "weight_bp" <= 10000)),
  CONSTRAINT "chk_objective_indicator_progress_bp" CHECK ("progress_cached_bp" >= 0 AND "progress_cached_bp" <= 10000)
);

ALTER TABLE "metrics"."objective_indicator"
  ADD CONSTRAINT "objective_indicator_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "objective_indicator_objective_id_fkey"    FOREIGN KEY ("objective_id")    REFERENCES "okr"."objective"("id")        ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "objective_indicator_metric_id_fkey"       FOREIGN KEY ("metric_id")       REFERENCES "metrics"."metric"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_objective_indicator_org_objective" ON "metrics"."objective_indicator"("organization_id", "objective_id");
CREATE INDEX "idx_objective_indicator_objective"     ON "metrics"."objective_indicator"("objective_id");
CREATE INDEX "idx_objective_indicator_metric"        ON "metrics"."objective_indicator"("metric_id");
CREATE INDEX "idx_objective_indicator_deleted_at"    ON "metrics"."objective_indicator"("deleted_at");

-- ADR-0009 D2: un indicador (métrica) aparece una sola vez por objetivo. Parcial: el soft delete libera el par.
CREATE UNIQUE INDEX "uq_objective_indicator_objective_metric" ON "metrics"."objective_indicator"("objective_id", "metric_id")
  WHERE "deleted_at" IS NULL;

-- ADR-0009 D6: unique parcial para la idempotencia de la migración.
CREATE UNIQUE INDEX "uq_objective_indicator_legacy_key_result" ON "metrics"."objective_indicator"("legacy_key_result_id")
  WHERE "legacy_key_result_id" IS NOT NULL;

-- ── 2. FK pendiente de C08 ───────────────────────────────────────────────────
-- Soft delete: nunca se borra la fila, así que RESTRICT no se dispara en el flujo normal.
ALTER TABLE "okr"."project"
  ADD CONSTRAINT "project_source_objective_indicator_id_fkey"
  FOREIGN KEY ("source_objective_indicator_id") REFERENCES "metrics"."objective_indicator"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
