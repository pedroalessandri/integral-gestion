CREATE TABLE "auth"."role" (
  "id"          TEXT         NOT NULL,
  "key"         VARCHAR(64)  NOT NULL,
  "name"        VARCHAR(120) NOT NULL,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "role_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_key_key" UNIQUE ("key"),
  CONSTRAINT "chk_role_key_format" CHECK (key ~ '^[a-z][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE TABLE "auth"."permission" (
  "key"         VARCHAR(64) NOT NULL,
  "description" TEXT        NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "chk_permission_key_format" CHECK (key ~ '^[a-z][a-z0-9:_-]{1,62}[a-z0-9]$')
);

CREATE TABLE "auth"."role_permission" (
  "role_id"        TEXT        NOT NULL,
  "permission_key" VARCHAR(64) NOT NULL,
  "assigned_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id", "permission_key"),
  CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."role"("id") ON DELETE RESTRICT,
  CONSTRAINT "role_permission_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "auth"."permission"("key") ON DELETE RESTRICT
);

CREATE INDEX "idx_role_permission_key" ON "auth"."role_permission"("permission_key");

-- Add FK from core.user_organization_role to auth.role
ALTER TABLE "core"."user_organization_role"
  ADD CONSTRAINT "user_organization_role_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "auth"."role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seeds: permissions (11 total per ADR 0004 D7)
INSERT INTO "auth"."permission" ("key", "description") VALUES
  ('okr:read',             'Read OKR entities (objectives, key results, tasks).'),
  ('okr:write',            'Create, edit, soft-delete OKR entities; rebalance weights.'),
  ('okr:progress:write',   'Set task progress (avance).'),
  ('okr:admin',            'Reserved for future sensitive OKR operations.'),
  ('core:org:manage',      'Create/edit/activate/deactivate organizations.'),
  ('core:period:manage',   'Manage periods (create, open, close).'),
  ('core:member:manage',   'Assign, change, remove user roles within an organization.'),
  ('core:module:manage',   'Enable/disable modules for an organization.'),
  ('core:user:read',       'Read user data.'),
  ('audit:read',           'Read audit events scoped to the caller current organization.'),
  ('audit:read:all',       'Read all audit events cross-tenant.')
ON CONFLICT (key) DO NOTHING;

-- Seeds: roles (4 total per ADR 0004 D7)
INSERT INTO "auth"."role" ("id", "key", "name", "description") VALUES
  ('role_org_reader',    'org-reader',       'Organization Reader',  'Read-only access to OKR.'),
  ('role_org_user',      'org-user',         'Organization User',    'Read OKR and upload task progress.'),
  ('role_org_admin',     'org-admin',        'Organization Admin',   'Full organization operations.'),
  ('role_ext_auditor',   'external-auditor', 'External Auditor',     'Reserved for future cross-tenant audit access.')
ON CONFLICT (key) DO NOTHING;

-- Seeds: role_permission assignments (MVP per ADR 0004 D7 matrix)
-- org-reader
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES ('okr:read')) AS v(p)
  WHERE r.key = 'org-reader'
ON CONFLICT DO NOTHING;

-- org-user
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES ('okr:read'), ('okr:progress:write')) AS v(p)
  WHERE r.key = 'org-user'
ON CONFLICT DO NOTHING;

-- org-admin
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES
      ('okr:read'), ('okr:write'), ('okr:progress:write'),
      ('core:period:manage'), ('core:member:manage'),
      ('core:user:read'), ('audit:read')
    ) AS v(p)
  WHERE r.key = 'org-admin'
ON CONFLICT DO NOTHING;

-- external-auditor: no permissions in MVP
