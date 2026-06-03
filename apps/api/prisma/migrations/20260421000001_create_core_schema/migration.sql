-- Migration: 20260421000001_create_core_schema
-- Creates the 6 tables of the core schema:
--   core.module, core.organization, core.period, core.user,
--   core.user_organization_role, core.organization_module
--
-- Notes:
--  - All timestamps use TIMESTAMPTZ for timezone-aware storage.
--  - CHECK constraints enforce status values and slug/code formats.
--  - Partial unique index uq_period_org_one_open enforces D3-A invariant
--    (at most one 'open' period per organization) at DB level.
--    Prisma cannot express partial unique indexes inline — added manually here.
--  - core.user_organization_role.role_id is a plain string without FK constraint.
--    TODO(ADR-0004): add FK constraint to auth.role(id) when auth migration lands.
--    The auth schema migration must run before adding that constraint.
--  - Tables created with IF NOT EXISTS for idempotency.

-- core.module must be created before core.organization_module (FK dependency).
CREATE TABLE IF NOT EXISTS core."module" (
    "key"         VARCHAR(64)  NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "module_pkey" PRIMARY KEY ("key")
);

-- core.organization
CREATE TABLE IF NOT EXISTS core."organization" (
    "id"                     TEXT         NOT NULL,
    "slug"                   VARCHAR(50)  NOT NULL,
    "name"                   VARCHAR(200) NOT NULL,
    "status"                 VARCHAR(10)  NOT NULL DEFAULT 'active',
    "deactivated_at"         TIMESTAMPTZ,
    "deactivated_by_user_id" TEXT,
    "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_organization_status"
        CHECK (status IN ('active', 'inactive')),
    CONSTRAINT "chk_organization_slug_format"
        CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_key" ON core."organization"("slug");
CREATE INDEX IF NOT EXISTS "idx_organization_status" ON core."organization"("status");

-- core.period
CREATE TABLE IF NOT EXISTS core."period" (
    "id"                TEXT        NOT NULL,
    "organization_id"   TEXT        NOT NULL,
    "code"              VARCHAR(7)  NOT NULL,
    "status"            VARCHAR(10) NOT NULL,
    "starts_at"         TIMESTAMPTZ NOT NULL,
    "ends_at"           TIMESTAMPTZ NOT NULL,
    "closed_at"         TIMESTAMPTZ,
    "closed_by_user_id" TEXT,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "period_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_period_status"
        CHECK (status IN ('open', 'closed', 'future')),
    CONSTRAINT "chk_period_code_format"
        CHECK (code ~ '^\d{4}-Q[1-4]$'),
    CONSTRAINT "chk_period_range"
        CHECK (ends_at > starts_at),
    CONSTRAINT "period_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES core."organization"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_period_org_code" ON core."period"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "idx_period_org_status" ON core."period"("organization_id", "status");

-- D3-A: at most one 'open' period per organization enforced at DB level.
-- Partial unique index — Prisma cannot generate this; hand-added here.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_period_org_one_open"
    ON core."period" ("organization_id")
    WHERE status = 'open';

-- core.user
CREATE TABLE IF NOT EXISTS core."user" (
    "id"            TEXT         NOT NULL,
    "auth0_sub"     TEXT         NOT NULL,
    "email"         TEXT         NOT NULL,
    "display_name"  VARCHAR(200) NOT NULL,
    "is_superadmin" BOOLEAN      NOT NULL DEFAULT false,
    "last_seen_at"  TIMESTAMPTZ,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_auth0_sub_key" ON core."user"("auth0_sub");
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON core."user"("email");
CREATE INDEX IF NOT EXISTS "idx_user_superadmin" ON core."user"("is_superadmin");

-- core.user_organization_role
-- TODO(ADR-0004): role_id has no FK constraint to auth.role(id) yet.
--   Add FK constraint when the auth schema migration lands.
--   The auth migration must run before adding:
--     ALTER TABLE core.user_organization_role
--       ADD CONSTRAINT user_organization_role_role_id_fkey
--       FOREIGN KEY (role_id) REFERENCES auth.role(id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS core."user_organization_role" (
    "user_id"             TEXT        NOT NULL,
    "organization_id"     TEXT        NOT NULL,
    "role_id"             TEXT        NOT NULL,
    "assigned_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "assigned_by_user_id" TEXT        NOT NULL,
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "user_organization_role_pkey" PRIMARY KEY ("user_id", "organization_id"),
    CONSTRAINT "user_organization_role_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES core."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_organization_role_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES core."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_uor_org" ON core."user_organization_role"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_uor_role" ON core."user_organization_role"("role_id");

-- core.organization_module
CREATE TABLE IF NOT EXISTS core."organization_module" (
    "organization_id"     TEXT        NOT NULL,
    "module_key"          VARCHAR(64) NOT NULL,
    "enabled_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "enabled_by_user_id"  TEXT        NOT NULL,
    "disabled_at"         TIMESTAMPTZ,
    "disabled_by_user_id" TEXT,

    CONSTRAINT "organization_module_pkey" PRIMARY KEY ("organization_id", "module_key"),
    CONSTRAINT "organization_module_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES core."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "organization_module_module_key_fkey"
        FOREIGN KEY ("module_key") REFERENCES core."module"("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_om_org_active" ON core."organization_module"("organization_id", "disabled_at");
