-- Migration: 20261007000002_strategic_plan_axis
-- Planificación de gobierno (ADR-0009 D2, SPEC §3.1) — F2/C05. Fase "expand".
-- 1. Schema planning con strategic_plan (N1) y axis (N2).
-- 2. okr.objective.org_unit_id (nullable hasta la fase migrate) y axis_id (opcional), con FKs.
-- 3. Permiso planning:plan:manage para org-admin.
-- No toca audit.event (sin UPDATE/DELETE).

-- ── 1. Schema planning ───────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "planning";

CREATE TABLE "planning"."strategic_plan" (
  "id"                TEXT         NOT NULL,
  "organization_id"   TEXT         NOT NULL,
  "title"             VARCHAR(200) NOT NULL,
  "vision"            TEXT         NOT NULL,
  "mandate_starts_at" TIMESTAMP(3) NOT NULL,
  "mandate_ends_at"   TIMESTAMP(3) NOT NULL,
  "status"            VARCHAR(10)  NOT NULL DEFAULT 'active',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "strategic_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_strategic_plan_status" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "chk_strategic_plan_mandate_range" CHECK ("mandate_ends_at" > "mandate_starts_at")
);

ALTER TABLE "planning"."strategic_plan"
  ADD CONSTRAINT "strategic_plan_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_strategic_plan_org" ON "planning"."strategic_plan"("organization_id");

-- RN-P2: un solo plan activo por organización.
CREATE UNIQUE INDEX "uq_strategic_plan_active" ON "planning"."strategic_plan"("organization_id")
  WHERE "status" = 'active';

CREATE TABLE "planning"."axis" (
  "id"                TEXT         NOT NULL,
  "strategic_plan_id" TEXT         NOT NULL,
  "organization_id"   TEXT         NOT NULL,
  "name"              VARCHAR(200) NOT NULL,
  "description"       TEXT,
  "order"             INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"        TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "axis_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "planning"."axis"
  ADD CONSTRAINT "axis_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "planning"."strategic_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "axis_organization_id_fkey"   FOREIGN KEY ("organization_id")   REFERENCES "core"."organization"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_axis_org_plan"   ON "planning"."axis"("organization_id", "strategic_plan_id");
CREATE INDEX "idx_axis_deleted_at" ON "planning"."axis"("deleted_at");

-- ── 2. okr.objective: unidad y eje ───────────────────────────────────────────
-- org_unit_id queda nullable hasta la fase migrate (ADR-0009 D6); axis_id es opcional (RN-P2).
-- Que la unidad sea de la misma org y de kind ministry|area (RN-P3) y que el eje sea del plan activo
-- de la misma org lo valida el service (las FKs no pueden expresarlo).
ALTER TABLE "okr"."objective"
  ADD COLUMN "org_unit_id" TEXT,
  ADD COLUMN "axis_id"     TEXT;

ALTER TABLE "okr"."objective"
  ADD CONSTRAINT "objective_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "core"."org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "objective_axis_id_fkey"     FOREIGN KEY ("axis_id")     REFERENCES "planning"."axis"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_objective_org_unit" ON "okr"."objective"("org_unit_id");
CREATE INDEX "idx_objective_axis"     ON "okr"."objective"("axis_id");

-- ── 3. Permiso RBAC ──────────────────────────────────────────────────────────
-- Edición del plan de gobierno y de sus ejes (RN-P19). Superadmin bypasea con '*'.
-- La lectura usa okr:read.
INSERT INTO "auth"."permission" ("key", "description") VALUES
  ('planning:plan:manage', 'Edit the strategic plan and its axes (planificación de gobierno).')
ON CONFLICT (key) DO NOTHING;

INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, 'planning:plan:manage' FROM "auth"."role" r WHERE r.key = 'org-admin'
ON CONFLICT DO NOTHING;
