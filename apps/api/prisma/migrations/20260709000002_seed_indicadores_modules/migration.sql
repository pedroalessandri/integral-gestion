-- Migration: 20260709000002_seed_indicadores_modules
-- Seeds the module registry with the two "indicadores" modules.
-- Per docs/features/indicadores-modelo-comun.md §4.
-- Idempotent: ON CONFLICT DO NOTHING allows re-running safely.

INSERT INTO core."module" (key, name, description, created_at)
VALUES
  ('indicadores-gestion', 'Indicadores de gestión', 'Catálogo de indicadores por organización con carga periódica y visualización esperado vs. real', NOW()),
  ('indicadores-okr', 'Indicadores en OKRs', 'Vínculo de indicadores a Key Results con progreso automático. Requiere indicadores-gestion', NOW())
ON CONFLICT (key) DO NOTHING;
