-- Migration: 20261008000005_org_unit_vision_permission
-- Planificación de gobierno F8/C19 (RN-P20). Permiso fino para editar SOLO la visión y misión de una unidad (N3),
-- separado de core:org-unit:manage (estructura del árbol, solo alcance central). Se combina con el alcance de unidad.
-- Solo catálogo de RBAC: no toca audit.event.

INSERT INTO "auth"."permission" ("key", "description") VALUES
  ('core:org-unit:vision:write', 'Edit the vision and mission of an org unit within the member scope (planificación de gobierno).')
ON CONFLICT (key) DO NOTHING;

-- Todos los roles que hoy escriben OKR (okr:write) y además org-user, que carga avance en su unidad.
INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT DISTINCT rp.role_id, 'core:org-unit:vision:write'
  FROM "auth"."role_permission" rp
  WHERE rp.permission_key = 'okr:write'
ON CONFLICT DO NOTHING;

INSERT INTO "auth"."role_permission" ("role_id", "permission_key")
  SELECT r.id, 'core:org-unit:vision:write' FROM "auth"."role" r WHERE r.key IN ('org-admin', 'org-user')
ON CONFLICT DO NOTHING;
