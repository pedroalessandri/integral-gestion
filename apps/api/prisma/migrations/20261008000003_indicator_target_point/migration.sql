-- Migration: 20261008000003_indicator_target_point
-- Planificación de gobierno (ADR-0009 D2, SPEC §3.1 / RN-P17) — F6/C15. Fase "expand".
-- metrics.indicator_target_point: puntos de la curva esperada MANUAL de un ObjectiveIndicator
-- (acumulado esperado absoluto por bucket). Solo se usan con expected_curve_mode = 'manual'; que el último
-- punto sea igual a la meta lo valida el service (depende de la meta del indicador).
-- No toca audit.event (sin UPDATE/DELETE).

CREATE TABLE "metrics"."indicator_target_point" (
  "id"                       TEXT           NOT NULL,
  "organization_id"          TEXT           NOT NULL,
  "objective_indicator_id"   TEXT           NOT NULL,
  "bucket_date"              DATE           NOT NULL,
  "expected_value"           DECIMAL(18, 4) NOT NULL,
  "created_at"               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "indicator_target_point_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "metrics"."indicator_target_point"
  ADD CONSTRAINT "indicator_target_point_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "indicator_target_point_objective_indicator_id_fkey"
    FOREIGN KEY ("objective_indicator_id") REFERENCES "metrics"."objective_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un punto por bucket y por indicador.
CREATE UNIQUE INDEX "uq_indicator_target_point_bucket" ON "metrics"."indicator_target_point"("objective_indicator_id", "bucket_date");
CREATE INDEX "idx_indicator_target_point_org" ON "metrics"."indicator_target_point"("organization_id");
