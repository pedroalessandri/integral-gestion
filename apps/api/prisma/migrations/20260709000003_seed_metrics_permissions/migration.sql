-- Migration: 20260709000003_seed_metrics_permissions
-- Seeds metrics:* permissions and assigns them to the existing roles.
-- Matrix per docs/features/indicadores-modelo-comun.md §5:
--   org-reader → metrics:read
--   org-user   → metrics:read, metrics:entry:write
--   org-admin  → metrics:read, metrics:write, metrics:entry:write
-- Superadmin bypasses via wildcard '*' (TenantGuard).
-- Idempotent: ON CONFLICT DO NOTHING allows re-running safely.

INSERT INTO "auth"."permission" ("key", "description") VALUES
  ('metrics:read',        'Read metrics, series and entries.'),
  ('metrics:write',       'Create, edit, soft-delete metrics; manage KR links (Módulo 2).'),
  ('metrics:entry:write', 'Create, edit, soft-delete metric entries (avances).')
ON CONFLICT (key) DO NOTHING;

-- org-reader
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES ('metrics:read')) AS v(p)
  WHERE r.key = 'org-reader'
ON CONFLICT DO NOTHING;

-- org-user
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES ('metrics:read'), ('metrics:entry:write')) AS v(p)
  WHERE r.key = 'org-user'
ON CONFLICT DO NOTHING;

-- org-admin
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, p FROM "auth"."role" r,
    (VALUES ('metrics:read'), ('metrics:write'), ('metrics:entry:write')) AS v(p)
  WHERE r.key = 'org-admin'
ON CONFLICT DO NOTHING;
