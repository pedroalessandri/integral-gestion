-- Migration: 20261011000001_organization_sector
-- ADR-0011 (terminología por sector, Fase 12 / C30).
-- 1) core.organization.sector: 'public' | 'private' | 'nonprofit'. En Postgres >= 11 el ADD COLUMN con DEFAULT
--    constante es solo metadata: no reescribe filas ni necesita backfill (todas las orgs existentes quedan 'public').
-- 2) Catálogo neutral (UPDATE idempotente sobre datos sembrados; no cambia ninguna key y no toca `audit.event`).

ALTER TABLE "core"."organization"
  ADD COLUMN "sector" VARCHAR(10) NOT NULL DEFAULT 'public';

ALTER TABLE "core"."organization"
  ADD CONSTRAINT "organization_sector_check" CHECK ("sector" IN ('public', 'private', 'nonprofit'));

-- Catálogo: el módulo `okr` deja de llamarse "OKR".
UPDATE "core"."module"
SET "name" = 'Planificación',
    "description" = 'Gestión de objetivos estratégicos, proyectos y tareas'
WHERE "key" = 'okr';

-- Catálogo: permisos sin "(planificación de gobierno)".
UPDATE "auth"."permission"
SET "description" = 'Manage the org unit tree and member unit scope.'
WHERE "key" = 'core:org-unit:manage';

UPDATE "auth"."permission"
SET "description" = 'Edit the vision and mission of an org unit within the member scope.'
WHERE "key" = 'core:org-unit:vision:write';

UPDATE "auth"."permission"
SET "description" = 'Edit the strategic plan and its axes.'
WHERE "key" = 'planning:plan:manage';
