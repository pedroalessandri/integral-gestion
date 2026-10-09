-- Migration: 20261009000002_catalog_texts_without_kr
-- Catálogo (datos sembrados): textos sin "KR" / "Key Result" tras el contract de la Fase 10 (ADR-0009 D6).
-- Solo UPDATE de descripciones y de la etiqueta del módulo `indicadores-okr`; no cambia ninguna key.
-- No toca `audit.event`. Idempotente: se puede correr de nuevo sin efecto adicional.

UPDATE "core"."module"
SET "description" = 'Gestión de objetivos estratégicos, proyectos y tareas'
WHERE "key" = 'okr';

UPDATE "core"."module"
SET "name" = 'Indicadores de contexto en objetivos',
    "description" = 'Asociación de indicadores de contexto a los objetivos. Requiere indicadores-gestion'
WHERE "key" = 'indicadores-okr';

UPDATE "auth"."permission"
SET "description" = 'Create, edit, soft-delete metrics; manage metric-objective context links.'
WHERE "key" = 'metrics:write';

UPDATE "auth"."permission"
SET "description" = 'Read OKR entities (objectives, projects, tasks).'
WHERE "key" = 'okr:read';

UPDATE "auth"."permission"
SET "description" = 'Create, edit, soft-delete OKR entities (objectives, projects, tasks).'
WHERE "key" = 'okr:write';
