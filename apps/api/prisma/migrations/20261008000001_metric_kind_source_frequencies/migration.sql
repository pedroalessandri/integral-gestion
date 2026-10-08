-- Metric: frecuencias trimestral/semestral/anual (RN-P15) y columnas kind/source/description (SPEC §3.1).
-- Las filas existentes quedan con kind = 'output' (default provisorio; ver pregunta abierta en la corrida C10).

ALTER TABLE "metrics"."metric" DROP CONSTRAINT "chk_metric_frequency";
ALTER TABLE "metrics"."metric"
  ADD CONSTRAINT "chk_metric_frequency"
  CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'));

ALTER TABLE "metrics"."metric"
  ADD COLUMN "kind"        VARCHAR(10)  NOT NULL DEFAULT 'output',
  ADD COLUMN "source"      VARCHAR(500),
  ADD COLUMN "description" VARCHAR(2000);

ALTER TABLE "metrics"."metric"
  ADD CONSTRAINT "chk_metric_kind" CHECK (kind IN ('output', 'outcome'));
