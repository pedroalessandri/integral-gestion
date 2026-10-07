-- Migration: 20261007000001_org_unit
-- Planificación de gobierno (ADR-0009, SPEC §3.1) — F2/C04. Fase "expand".
-- 1. core.org_unit: árbol de unidades (central -> ministry -> area, profundidad <= 4 validada en el service).
-- 2. core.user_organization_role.org_unit_id: alcance de escritura de la membresía (null = toda la org, RN-P19).
-- 3. Backfill de la raíz central para todas las organizaciones existentes (RN-P1).
-- 4. Permiso core:org-unit:manage para org-admin.
-- No se hace UPDATE/DELETE sobre audit.event (solo INSERT del backfill).

-- ── 1. core.org_unit ─────────────────────────────────────────────────────────
CREATE TABLE "core"."org_unit" (
  "id"              TEXT         NOT NULL,
  "organization_id" TEXT         NOT NULL,
  "parent_id"       TEXT,
  "kind"            VARCHAR(10)  NOT NULL,
  "name"            VARCHAR(200) NOT NULL,
  "vision"          TEXT,
  "mission"         TEXT,
  "order"           INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_org_unit_kind" CHECK ("kind" IN ('central', 'ministry', 'area')),
  -- La raíz es central y solo la raíz es central.
  CONSTRAINT "chk_org_unit_central_is_root" CHECK (("kind" = 'central') = ("parent_id" IS NULL))
);

ALTER TABLE "core"."org_unit"
  ADD CONSTRAINT "org_unit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "org_unit_parent_id_fkey"       FOREIGN KEY ("parent_id")       REFERENCES "core"."org_unit"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_org_unit_org_parent" ON "core"."org_unit"("organization_id", "parent_id");
CREATE INDEX "idx_org_unit_deleted_at" ON "core"."org_unit"("deleted_at");

-- RN-P1: una sola raíz central no borrada por organización.
CREATE UNIQUE INDEX "uq_org_unit_central_root" ON "core"."org_unit"("organization_id")
  WHERE "kind" = 'central' AND "deleted_at" IS NULL;

-- ── 2. core.user_organization_role.org_unit_id ───────────────────────────────
ALTER TABLE "core"."user_organization_role" ADD COLUMN "org_unit_id" TEXT;

ALTER TABLE "core"."user_organization_role"
  ADD CONSTRAINT "user_organization_role_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "core"."org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_uor_org_unit" ON "core"."user_organization_role"("org_unit_id");

-- ── 3. Backfill de la raíz central (TODAS las organizaciones, RN-P1) ─────────
-- Idempotente: NOT EXISTS sobre la raíz viva. El nombre de la raíz es el de la org.
-- Auditoría: actor 'system:migration' (ADR-0009 D6). audit.event.actor_id tiene FK a core.user,
-- por lo que se asegura (ON CONFLICT DO NOTHING) una fila de sistema con ese id.
INSERT INTO "core"."user" ("id", "auth0_sub", "email", "display_name", "is_superadmin", "updated_at")
  VALUES ('system:migration', 'system:migration', 'system-migration@system.invalid', 'System migration', false, NOW())
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE "_org_unit_backfill" ON COMMIT DROP AS
  SELECT
    'c' || substr(md5(random()::text || o.id), 1, 24) AS id,
    o.id AS organization_id,
    o.name
  FROM "core"."organization" o
  WHERE NOT EXISTS (
    SELECT 1 FROM "core"."org_unit" u
    WHERE u.organization_id = o.id AND u.kind = 'central' AND u.deleted_at IS NULL
  );

INSERT INTO "core"."org_unit" ("id", "organization_id", "parent_id", "kind", "name", "order", "updated_at")
  SELECT id, organization_id, NULL, 'central', name, 0, CURRENT_TIMESTAMP FROM "_org_unit_backfill";

INSERT INTO "audit"."event" ("id", "occurred_at", "actor_id", "organization_id", "entity_type", "entity_id", "action", "diff", "request_id")
  SELECT
    'c' || substr(md5(random()::text || id), 1, 24),
    NOW(),
    'system:migration',
    organization_id,
    'core.org_unit',
    id,
    'org_unit.created',
    jsonb_build_object(
      'before', NULL,
      'after', jsonb_build_object('kind', 'central', 'name', name, 'parentId', NULL, 'order', 0, 'source', 'migration-backfill')
    ),
    gen_random_uuid()
  FROM "_org_unit_backfill";

-- ── 4. Permiso RBAC ──────────────────────────────────────────────────────────
-- Gestión del árbol de unidades y del alcance de los miembros (RN-P19). Superadmin bypasea con '*'.
INSERT INTO "auth"."permission" ("key", "description") VALUES
  ('core:org-unit:manage', 'Manage the org unit tree and member unit scope (planificación de gobierno).')
ON CONFLICT (key) DO NOTHING;

INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, 'core:org-unit:manage' FROM "auth"."role" r WHERE r.key = 'org-admin'
ON CONFLICT DO NOTHING;
