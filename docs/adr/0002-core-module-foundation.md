# 0002 — Fundación del módulo Core

**Status**: Accepted (pending ADR 0003-audit, 0004-auth, which may refine upstream contracts)
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-20
**Author**: architect subagent
**Spec**: N/A — derivado de los contratos que ADR 0001 (OKR) asume hacia `core` y de las reglas transversales de `CLAUDE.md` / `AGENTS.md`.

---

## Context and problem

El módulo `core` es el **layer fundacional** de `gestion-publica`. Modela las entidades sin las cuales ningún módulo de negocio puede operar: **Organization** (raíz del multi-tenant), **Period** (ventana trimestral por org), **User** (identidad local, sin password, mapeada a Auth0), **UserOrganizationRole** (junction usuario ↔ organización ↔ rol) y **OrganizationModule** (habilitación de módulos por organización).

`core` **no** diseña la autenticación Auth0 (ADR 0004), **no** diseña el store append-only de audit (ADR 0003), **no** diseña el engine de RBAC (ADR 0004). Sí **expone** el contrato público que esos módulos y los módulos de negocio (empezando por `okr`) consumen.

ADR 0001 (OKR) asumió — y este ADR tiene que entregar — los siguientes contratos:

1. `OrganizationContextService` con shape a elegir.
2. `PeriodService.getCurrentOpenPeriod(organizationId): Promise<PeriodDto | null>`.
3. `PeriodService.getById(periodId): Promise<PeriodDto>` con `status: 'open' | 'closed' | 'future'`.
4. `ModuleEnablementService.isEnabled(organizationId, moduleKey): Promise<boolean>`.
5. Endpoint `GET /api/v1/me` con shape `{ userId, email, displayName, orgs: [{ id, slug, name, role: { key, permissions[] } }] }`.
6. Tablas `core.organization`, `core.period` (con `status`), `core.organization_module`, `core.user_organization_role`.
7. Seed del módulo `'okr'` en el registry de módulos conocidos.

Los siete se entregan acá. Adicionalmente, `core` resuelve decisiones estructurales que ADR 0001 dejó pendientes explícitamente (tenant scoping sobre entidades de `core`, ubicación del superadmin, seed strategy, lifecycle de Period).

### Preguntas a responder

1. ¿Soft-delete en Organization sí o no, y cómo impacta al resto del árbol?
2. ¿Quién crea periods y quién los cierra? ¿Cuántos open coexisten por org?
3. ¿Qué significa exactamente "current open period" y cómo se resuelve?
4. ¿`module_key` es un enum en código o una fila en tabla?
5. ¿Cómo arranca una instalación nueva (bootstrap org, primer superadmin, módulos default)?
6. ¿Qué entidades de `core` quedan bajo la Prisma tenant extension y cuáles no?
7. ¿Dónde vive "superadmin": flag en `User` o rol especial en `UserOrganizationRole`?
8. ¿Qué hace el sistema si una org existe pero no tiene periods?

### Asunciones declaradas

- Una instancia de `gestion-publica` sirve a **N organizaciones** (spec: "multi-tenant desde el día 1"). El MVP arranca con una única org de ejemplo pero la arquitectura no depende de eso.
- La resolución concreta del RBAC (mapping rol → permisos, persistencia de `auth.role` / `auth.permission`) vive en `auth` (ADR 0004). `core` le cede al `auth` el dueñazgo del catálogo de roles y permisos y **consume** guards/decorators desde ahí.
- El locale del proyecto es `es-AR` y la timezone operativa es `America/Argentina/Buenos_Aires` (CLAUDE.md + AGENTS.md gotcha 8 + spec OKR S-07).

## Decision

Vamos a implementar `core` como un módulo NestJS autocontenido que posee el schema Postgres `core` con cinco tablas (`organization`, `period`, `user`, `user_organization_role`, `organization_module`) más una tabla de registry (`module`, decisión D4), expone cuatro servicios públicos (`OrganizationContextService`, `PeriodService`, `ModuleEnablementService`, `MeService`) y un conjunto de endpoints bajo `/api/v1/...` para backoffice, gating de period lifecycle por marca manual de admin (con cierre manual en MVP y scheduled job diferido), "current open period" resuelto como **exactamente uno por org en cualquier momento** (D3-A), `module_key` como **tabla de registry** seedeada (D4-B), bootstrap por **seed SQL idempotente** (D5), superadmin como **flag booleano en `User`** fuera del eje de `UserOrganizationRole` (D7), creación de org atómica que **crea automáticamente la Period del Q corriente** como parte del setup (D8-c), y **sin soft-delete** en Organization/User/Period: lifecycle se maneja con `status: 'active' | 'inactive'` a nivel columna (D1-b).

---

## Data model

### Ubicación

Schema Postgres: **`core`**. Seis tablas: `core.organization`, `core.period`, `core.user`, `core.user_organization_role`, `core.organization_module`, `core.module`.

FKs cross-schema:

- `core.user_organization_role.role_id` → `auth.role(id)` `ON DELETE RESTRICT`.

Toda FK dentro de `core` es `ON DELETE RESTRICT`. No hay DB cascade delete. El lifecycle se maneja con columnas `status` / `deactivated_at`; la baja física queda fuera del alcance funcional (si aparece, es otro ADR).

### Tipos comunes

- IDs: `cuid` (string). Consistente con ADR 0001.
- Timestamps: `TIMESTAMPTZ` (Postgres) / `DateTime` (Prisma). Se persisten en UTC; la presentación convierte a `America/Argentina/Buenos_Aires` en la capa de render (gotcha 8 de AGENTS.md).
- `status` de Organization y Period: se modelan como **`VARCHAR` con `CHECK`** (no enum Postgres). Razón: facilita agregar estados futuros sin `ALTER TYPE`, que en Postgres es pesado y poco transaccional. El type-level enforcement se consigue vía el tipo TS correspondiente en `shared-types`.

### Shape ilustrativo (Prisma)

> Ilustrativo, no migración ejecutable.

```prisma
// apps/api/prisma/schema.prisma (extracto — schema "core")

model Organization {
  id             String   @id @default(cuid())
  slug           String   @unique                      // URL-safe, unique global
  name           String   @db.VarChar(200)
  status         String   @default("active")           // 'active' | 'inactive', CHECK
  deactivatedAt  DateTime? @map("deactivated_at")
  deactivatedByUserId String? @map("deactivated_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  periods        Period[]
  memberships    UserOrganizationRole[]
  modules        OrganizationModule[]

  @@index([status], map: "idx_organization_status")
  @@schema("core")
  @@map("organization")
}

model Period {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  code           String   @db.VarChar(7)               // 'YYYY-Qn'
  status         String                                 // 'open' | 'closed' | 'future', CHECK
  startsAt       DateTime @map("starts_at")            // primer día del Q en tz AR, almacenado UTC
  endsAt         DateTime @map("ends_at")              // último instante del Q en tz AR, almacenado UTC
  closedAt       DateTime? @map("closed_at")
  closedByUserId String?  @map("closed_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@unique([organizationId, code], map: "uq_period_org_code")
  @@index([organizationId, status], map: "idx_period_org_status")
  // Parcial SQL (Prisma no expresa parciales inline):
  //   CREATE UNIQUE INDEX uq_period_org_one_open
  //     ON core.period (organization_id)
  //     WHERE status = 'open';
  //   -- Garantiza a nivel DB la invariante D3-A: una sola open por org.
  @@schema("core")
  @@map("period")
}

model User {
  id             String   @id @default(cuid())
  auth0Sub       String   @unique @map("auth0_sub")    // claim 'sub' del JWT Auth0
  email          String   @unique                      // se sincroniza en cada login
  displayName    String   @map("display_name") @db.VarChar(200)
  isSuperadmin   Boolean  @default(false) @map("is_superadmin")
  lastSeenAt     DateTime? @map("last_seen_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  memberships    UserOrganizationRole[]

  @@index([isSuperadmin], map: "idx_user_superadmin")  // pequeño set, scan rápido
  @@schema("core")
  @@map("user")
}

model UserOrganizationRole {
  userId         String   @map("user_id")
  organizationId String   @map("organization_id")
  roleId         String   @map("role_id")              // FK cross-schema a auth.role(id)
  assignedAt     DateTime @default(now()) @map("assigned_at")
  assignedByUserId String @map("assigned_by_user_id")  // FK a core.user(id)
  updatedAt      DateTime @updatedAt @map("updated_at")

  user           User @relation(fields: [userId], references: [id], onDelete: Restrict)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@id([userId, organizationId])                       // un usuario, un rol por org (MVP)
  @@index([organizationId], map: "idx_uor_org")
  @@index([roleId], map: "idx_uor_role")
  @@schema("core")
  @@map("user_organization_role")
}

model OrganizationModule {
  organizationId String   @map("organization_id")
  moduleKey      String   @map("module_key")          // FK a core.module(key)
  enabledAt      DateTime @default(now()) @map("enabled_at")
  enabledByUserId String  @map("enabled_by_user_id") // FK a core.user(id)
  disabledAt     DateTime? @map("disabled_at")
  disabledByUserId String? @map("disabled_by_user_id")

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  module         Module @relation(fields: [moduleKey], references: [key], onDelete: Restrict)

  @@id([organizationId, moduleKey])
  @@index([organizationId, disabledAt], map: "idx_om_org_active")
  @@schema("core")
  @@map("organization_module")
}

model Module {
  key            String   @id                           // p.ej. 'okr'
  name           String   @db.VarChar(100)
  description    String?  @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  enablements    OrganizationModule[]

  @@schema("core")
  @@map("module")
}
```

### CHECKs SQL complementarios

```sql
ALTER TABLE core.organization
  ADD CONSTRAINT chk_organization_status
  CHECK (status IN ('active', 'inactive'));

ALTER TABLE core.organization
  ADD CONSTRAINT chk_organization_slug_format
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$');  -- URL-safe, 1..50 chars

ALTER TABLE core.period
  ADD CONSTRAINT chk_period_status
  CHECK (status IN ('open', 'closed', 'future'));

ALTER TABLE core.period
  ADD CONSTRAINT chk_period_code_format
  CHECK (code ~ '^\d{4}-Q[1-4]$');

ALTER TABLE core.period
  ADD CONSTRAINT chk_period_range
  CHECK (ends_at > starts_at);

-- Invariante D3-A: a lo sumo una Period 'open' por organization.
CREATE UNIQUE INDEX uq_period_org_one_open
  ON core.period (organization_id)
  WHERE status = 'open';
```

### Índices — justificación y comparación con `okr.*` (ADR 0001)

| Índice | Propósito |
|---|---|
| `idx_organization_status` B-tree | Listado rápido de orgs activas (backoffice superadmin). |
| `uq_period_org_code` UNIQUE | Evita duplicar `2026-Q2` en la misma org. |
| `idx_period_org_status` B-tree | Resolver "current open" y listados por estado. |
| `uq_period_org_one_open` parcial UNIQUE | **Enforcement DB** de la invariante "una sola open por org" (D3-A). |
| `idx_uor_org` / `idx_uor_role` | Membresías por org; listas de usuarios que tienen un rol dado. |
| `idx_om_org_active` B-tree | El guard `@ModuleEnabled` pregunta "¿org X tiene módulo Y activo?" con este índice. |
| `idx_user_superadmin` B-tree | Set chico; scan barato. |

**Consistencia con `okr.*`** (ADR 0001): `organizationId` aparece primero en todos los índices compuestos, igual que en `okr`. Las restricciones únicas activas se expresan como índices parciales cuando se necesita coexistir con estados "desactivados" (en `okr` por `deleted_at IS NULL`; acá por `status = 'open'` para la única-open).

### Unique constraints

- `organization.slug` **unique global**. El slug identifica orgs también en URLs; tiene que ser único a nivel sistema.
- `period (organization_id, code)` unique: un único `2026-Q2` por org.
- `period (organization_id) WHERE status = 'open'` unique **parcial** (D3-A): a lo sumo una Period open por org.
- `user.auth0_sub` unique: cada JWT resuelve a un único `core.user`.
- `user.email` unique: prevé identidad dual (un usuario no entra dos veces con distintos `auth0_sub` y mismo email; si Auth0 devuelve dos `sub` distintos por SSO, el segundo login falla y requiere merge manual — fuera de alcance MVP).
- `user_organization_role (user_id, organization_id)` **PK** — un usuario tiene un único rol por org (MVP). Si se necesita multi-rol por org, se migra a una junction `(user_id, organization_id, role_id)` con PK triple; no se diseña ahora.
- `organization_module (organization_id, module_key)` PK.
- `module.key` PK.

---

## Decisiones de diseño

### D1 — Soft-delete en Organization: **NO**

**Decisión**: `Organization` usa `status: 'active' | 'inactive'` (con `deactivated_at` + `deactivated_by_user_id` de auditoría). No se usa `deleted_at`.

**Alternativa A (descartada)** — Soft-delete con `deleted_at` y cascada lógica a periods, memberships, modules y datos de negocio. Problemas: (a) "borrar una org" tiene implicancias de trazabilidad y de integridad del historial; preferimos no ofrecer ni la ilusión de borrado. (b) La cascada lógica es viral: cada módulo (OKR, los que vengan) tendría que filtrar `deleted_at` de su organización padre en cada query, lo cual complica `okr` sin beneficio. (c) El borrado físico con `ON DELETE RESTRICT` de todas las FKs vuelve imposible el restore.

**Alternativa B (descartada)** — Prohibir desactivar orgs con cualquier dato de negocio. Problema: bloquea casos legítimos (reorganización administrativa, fusión de unidades). El status permite "congelar" una org sin destruir datos.

**Decisión adoptada (c/d)** — `status: 'inactive'` con `deactivated_at`. Implicancias:

- **Impacto en Period**: al desactivar una org, las periods existentes quedan intactas. La policy de mutaciones de `okr` consulta `period.status`, no `organization.status`; esto significa que una org inactive con una period open **todavía permitiría mutaciones** si no se cierra el circuito. Regla adicional: `PeriodService.getCurrentOpenPeriod(organizationId)` **devuelve `null`** si la organización está `inactive`, aunque exista una row `open`. Esto bloquea nuevas creaciones de Objetivos (RN-24) y, transitivamente, avances sobre períodos de orgs inactive (vía `TenantGuard` que requiere org active, ver "Tenant scoping").
- **Impacto en OKR**: `TenantGuard` rechaza con 403 toda request contra una org inactive (aunque el usuario tenga membership). La lectura de datos históricos vía backoffice superadmin (orgs inactive) queda fuera del MVP.
- **Reactivación**: `POST /orgs/:id/activate` permite volver `status='active'`, limpiando `deactivated_at`. Es una operación superadmin y emite `organization.activated`.

**Justificación final**: onerosidad de cascada lógica + beneficio marginal del soft-delete. Flag binario status cumple el 100% del caso de uso.

### D2 — Period lifecycle

**Decisión**: **creación manual desde backoffice + cierre manual en MVP**. Scheduled auto-close diferido a un ADR futuro.

Detalles:

- **Quién crea**: org-admin (permiso `core:period:manage`) desde el backoffice. **Excepción**: al crear una organización nueva, el sistema auto-crea la Period del Q corriente como parte atómica del setup (ver D8-c). Esta es la única vía automática en MVP.
- **Transición `future → open`**: explícita por org-admin vía `POST /periods/:id/open`. **No hay auto-open por cron en MVP**. Requisito: sólo se puede abrir si no hay otra period `open` en esa org (enforcement D3-A por unique parcial).
- **Transición `open → closed`**: explícita por org-admin vía `POST /periods/:id/close`. No hay job automático que cierre por `ends_at` en MVP (diferido).
- **Reapertura (`closed → open`)**: **fuera de alcance** (AR-03 de spec OKR / RN-23 reservada). El endpoint `POST /periods/:id/reopen` no existe en MVP.
- **Edición de metadata (`code`, `starts_at`, `ends_at`)**: permitida solo mientras `status='future'`. Una vez abierta, el rango queda congelado. Razón: evitar que un cambio de `ends_at` rompa los supuestos de `okr` sobre qué período es "corriente".

**Alternativa A (descartada)** — Cron job que crea periods automáticamente al cambio de trimestre y cierra la anterior. Problema: requiere infra de scheduling (Nest cron o cron externo) que en MVP no se justifica; agrega modos de fallo (cron no corrió, corrió doble, corrió en timezone equivocada). Se deja como ADR futuro cuando haya evidencia de operación a escala.

**Alternativa B (descartada)** — Multiple periods abiertas simultáneamente. Se evalúa en D3.

### D3 — "Current open period" semantics: **Opción A (exactamente una open por org)**

**Decisión**: Por diseño e invariante enforzada por DB (`uq_period_org_one_open`), una organización tiene **a lo sumo una Period con `status='open'`** en cualquier momento. `PeriodService.getCurrentOpenPeriod(orgId)` devuelve esa row (o `null` si no hay ninguna).

**Alternativa B (descartada)** — Múltiples open coexistentes, resolución de "corriente" por `NOW() ∈ [starts_at, ends_at]`. Problemas:

- Abre una clase de casos donde `getCurrentOpenPeriod` podría devolver dos candidatas (rangos solapados) y requiere tie-breaking arbitrario.
- Complica RN-24 ("solo se pueden crear Objetivos en el período **abierto corriente**") porque "corriente" y "abierto" dejan de coincidir: habría que combinar el estado con la fecha, y se vuelve ambiguo.
- El valor del caso ("Q anterior todavía abierto mientras arranca el nuevo") lo resolvemos mejor con *ventana de cierre diferido* (el admin cierra Q anterior cuando termina de cargar datos, hasta entonces sigue open), sin permitir simultaneidad con Q siguiente.

**Impacto sobre RN-24** (OKR): `POST /api/v1/okr/objectives` llama a `PeriodService.getCurrentOpenPeriod(orgId)`. Si devuelve `null`, el endpoint retorna `HTTP 422` con `error: "NoCurrentOpenPeriod"` (ya especificado en ADR 0001). Con D3-A, el caller nunca necesita desambiguar — siempre hay cero o uno.

**Consecuencia operacional**: el admin **debe** cerrar Q2 antes de abrir Q3. Durante la ventana de transición, si Q2 se cierra antes de abrir Q3, la org queda "sin period corriente abierto" y **se bloquean creaciones de Objetivos hasta abrir Q3**. Esto es comportamiento deseado (evita crear objetivos en limbo) y alinea con D8-c (setup de org siempre deja una period open).

### D4 — Module registry: **tabla `core.module`**

**Decisión**: `module_key` es una **fila en `core.module`**, no un enum en código.

Shape de `core.module`:

```
key: String (PK, p.ej. 'okr')
name: String
description: String?
created_at: TIMESTAMPTZ
```

**Alternativa A (descartada)** — Enum TypeScript más CHECK constraint (`module_key IN ('okr')`). Problemas: (a) agregar un módulo nuevo requiere migración Prisma y redeploy, (b) el catálogo de módulos no es un tipo de dominio que cambie con el código — cambia con decisiones operativas, y tiene que ser introspectable desde DB (p.ej. para el endpoint `GET /modules` del backoffice). Un enum está del lado equivocado del eje.

**Ventajas de la tabla**:

- `OrganizationModule.moduleKey` puede llevar FK real con `ON DELETE RESTRICT` a `core.module(key)`.
- Se puede seedear (ver D5) y extender sin migración de código.
- El backoffice puede listar módulos disponibles con un `GET /modules`.

**Type-level enforcement opcional**: `shared-types` expone un `ModuleKey = 'okr'` (union string) como convenience para los clientes TS, sincronizado manualmente con los seeds. Si cae de sync, el error es `HTTP 404` en runtime al consultar el registry — aceptable.

### D5 — Seed strategy: **bootstrap vía seed SQL idempotente; org inicial opcional**

**Decisión**: la instalación arranca con los seeds **mínimos imprescindibles** y **sin org bootstrap obligatoria**. Los seeds son idempotentes (ejecutables sobre una DB ya inicializada sin romper nada).

**Seeds iniciales** (responsabilidad de `core`, ADR 0003 y 0004 aportan los suyos):

1. `core.module`: una row `{ key: 'okr', name: 'OKR', description: '...' }`. Este es el seed del registry que ADR 0001 asume.
2. **Sin seed de orgs**: la primera org se crea explícitamente vía backoffice una vez que haya un superadmin.
3. **Primer superadmin**: se promueve vía **variable de entorno de bootstrap** `CORE_BOOTSTRAP_SUPERADMIN_EMAIL`. Semántica:
   - En el primer login de Auth0 donde no exista ningún `core.user` con `is_superadmin = true`, si el email del JWT coincide con `CORE_BOOTSTRAP_SUPERADMIN_EMAIL`, ese usuario se crea (si no existe) y se marca `is_superadmin = true`.
   - Una vez que existe al menos un superadmin, la variable se vuelve inerte (no vuelve a aplicar aunque otro email haga login).
   - El evento `user.superadmin_granted` se emite con `reason: 'bootstrap'`.
4. **Habilitación de módulos**: opt-in. Crear una org no habilita ningún módulo automáticamente. El org-admin (o el superadmin) habilita módulos uno por uno desde `POST /orgs/:orgId/modules/:moduleKey/enable`. Alternativa "habilitar todos por default" descartada por higiene: preferimos explicitud.

**Alternativa A (descartada)** — Org bootstrap de ejemplo seedeada al instalar. Problema: acopla la infra a un caso particular; en entornos de test y en otras instalaciones futuras sobra una row que nadie pidió. El operador puede crear la org con un comando post-install si quiere.

**Alternativa B (descartada)** — Primer superadmin vía SQL manual. Problema: poco ergonómico y propenso a typo. El mecanismo "first login promotes to superadmin, gated by env var" es auditable, idempotente, y no requiere tocar la DB a mano.

**Alternativa C (descartada)** — Módulos habilitados por default en todas las orgs nuevas. Problema: cuando existan módulos "costosos" (p.ej. alguno que implique integración externa, storage, cron), habilitar por default es un riesgo silencioso. Mejor opt-in explícito desde el día 1.

### D6 — Tenant scoping para entidades de `core`

La Prisma extension de ADR 0001 (`tenantExtension`) filtra/inyecta `organizationId` en los modelos del schema `okr`. Para `core`, el comportamiento por modelo es:

| Modelo | Bajo extension | Comportamiento |
|---|---|---|
| `Organization` | **NO** (skip explícito) | Es la raíz del multi-tenant — no lleva `organizationId`. La extension debe reconocer este modelo y hacer bypass. Operaciones sobre `Organization` quedan reguladas por permiso (superadmin-only). |
| `Period` | **SÍ** | Lleva `organizationId` y la extension inyecta automáticamente. `PeriodService` no necesita filtrar manual. |
| `User` | **NO** (skip explícito) | Un user puede pertenecer a N orgs (vía `UserOrganizationRole`); no tiene `organizationId` directo. Las listas "usuarios de una org" van vía join con `UserOrganizationRole`. |
| `UserOrganizationRole` | **SÍ** | Lleva `organizationId`. La extension inyecta; las listas de membresías de la org corriente salen filtradas por construcción. **Edge case**: el endpoint `GET /me` lista membresías del usuario autenticado **sin** limitar a la org corriente — ver "Bypass explícito". |
| `OrganizationModule` | **SÍ** | Lleva `organizationId`. Ídem `UserOrganizationRole`. |
| `Module` | **NO** | Catálogo global. No lleva `organizationId`. |

**Configuración concreta**: `TENANT_SCOPED_MODELS` en `packages/prisma-tenant-extension` se extiende a `['Objective', 'KeyResult', 'Task', 'Period', 'UserOrganizationRole', 'OrganizationModule']`. `Organization`, `User`, `Module` quedan **fuera** del set.

**Bypass explícito para queries multi-org**: el endpoint `GET /me` necesita listar todas las membresías del usuario autenticado cruzando todas sus orgs. Se expone un escape documentado:

- Opción 1: `tenantExtension` admite `skipTenantScoping: true` como arg en la operación (Prisma extensions permiten recibir args extras y decidir el comportamiento). `MeService` lo usa.
- Opción 2: un client Prisma "raw" sin la extension para queries multi-tenant de `core`. Más simple, menos mágico.

Se adopta la **Opción 2**: `PrismaService` expone dos getters — `.scoped` (with `tenantExtension`, default path for all tenant-bound queries) and `.raw` (no extension, opt-in only for `/me`, superadmin cross-tenant operations, and `PermissionResolverService` in `auth`). Esta decisión queda anotada para que ADR 0004 (auth) la recoja al instanciar el `PrismaService`.

**Integración con D7 (superadmin)**: la extensión reconoce un flag en el `AuthContext` (`isSuperadmin: true`) y **también** hace bypass cuando ese flag está activo y la operación apunta a modelos tenant-scoped. Alternativa rechazada: que el superadmin tenga que usar `raw` explícitamente en cada llamada. Preferimos que la policy viva en un solo lugar (la extension) y que los services sean agnósticos.

### D7 — Superadmin: **flag booleano en `User`, fuera del eje `UserOrganizationRole`**

**Decisión**: `User.isSuperadmin: boolean` es la fuente de verdad. No es un "rol de org" — es un atributo del usuario a nivel sistema.

**Justificación**:

- Un superadmin **opera cross-tenant** (crea orgs, lista todas las orgs, habilita módulos en cualquier org). Modelarlo como un `UserOrganizationRole` con una "org especial" sería un hack.
- El permiso "crear organización" no pertenece a ninguna organización — es previo al multi-tenant.
- Separa claramente "admin de sistema" (superadmin) de "admin de una org" (rol `org-admin` vía `UserOrganizationRole`). Un usuario puede ser superadmin Y tener rol de `org-user` en alguna org específica; son ortogonales.

**Alternativa A (descartada)** — Rol `system-superadmin` en `auth.role` asignado vía `UserOrganizationRole` con una org "ROOT" sintética. Problema: contamina el modelo de orgs con una row que no es una org real, complica todas las queries de listado de orgs (hay que filtrarla), y los permisos "cross-tenant" se modelan como permisos "sobre la org ROOT", lo cual es conceptualmente incorrecto.

**Alternativa B (descartada)** — Tabla separada `core.superadmin (user_id PK)`. Problema: overhead de una tabla para un flag booleano. Aceptable pero no mejor.

**Cómo se marca el primer superadmin**: ver D5 — bootstrap por env var.

**Promoción/revocación posterior**: un superadmin existente puede promover a otro (`POST /users/:id/superadmin` / `DELETE /users/:id/superadmin`). Eventos de audit: `user.superadmin_granted` / `user.superadmin_revoked` con el `actor_id` (el superadmin que hizo el cambio).

**Endpoints que requieren `isSuperadmin = true`** (guard `@SuperadminOnly()`):

- Todas las operaciones de `/orgs` que mutan (`POST /orgs`, `PATCH /orgs/:id`, `POST /orgs/:id/activate`, `POST /orgs/:id/deactivate`).
- `GET /orgs` (listado global — los org-admin solo ven las suyas vía `GET /me`).
- `GET /users` (listado global de usuarios, cross-tenant).
- `POST /users/:id/superadmin` / `DELETE /users/:id/superadmin`.
- `GET /modules` (registry — ver debate D4; se elige **autenticado pero no superadmin**: cualquier usuario puede ver qué módulos existen, pero habilitarlos en una org requiere `core:module:manage`).

**Operar cross-tenant**: un superadmin, al autenticarse, puede llamar a endpoints `core` sin adjuntar `X-Organization-Id` o adjuntándolo (p.ej. para actuar dentro de una org específica). La Prisma extension, al ver `isSuperadmin`, hace bypass del filtro por `organizationId`; los services pueden explícitamente pedir una org via parámetro. **En módulos de negocio (OKR)**: el superadmin **debe** adjuntar `X-Organization-Id` para operar, igual que cualquier otro usuario. La diferencia es que el `TenantGuard` no exige membresía en esa org para superadmins. Esto queda anotado para ADR 0004 (auth).

### D8 — Orgs sin periods: **la creación de org crea atómicamente la Period del Q corriente**

**Decisión**: `POST /orgs` **crea la organización y la Period del trimestre corriente en una sola transacción**. La Period creada queda en `status='open'` (no `future`), lista para uso. El `code` se calcula a partir de la fecha UTC actual convertida a `America/Argentina/Buenos_Aires` (Q1=ene-mar, Q2=abr-jun, etc.).

**Alternativa A (descartada)** — Creación manual obligatoria de la primera Period como paso 2 del setup. Problema: introduce una ventana donde la org existe pero OKR no puede operar. Si el admin se olvida, un usuario que intente crear un Objetivo recibe "NoCurrentOpenPeriod" sin entender por qué.

**Alternativa B (descartada)** — Org se crea en `status='inactive'` hasta que se cree la primera Period, y luego se activa. Problema: exige orquestar un flujo de dos pasos en la UI. La diferencia con A es estética.

**Alternativa C (adoptada)** — Crear org y primera Period atómicamente. El body del `POST /orgs` acepta opcionalmente `firstPeriod: { code?, startsAt?, endsAt? }` para permitir overrides (por si el operador quiere que la org arranque desde `2026-Q1` en vez de `2026-Q2`); por default, se calcula el Q corriente. Si el override deja la fecha actual fuera del rango, la Period se crea como `status='future'` y el admin la abre luego con `POST /periods/:id/open`.

**Reglas de derivación cuando el override es parcial** (explícitas para que la implementación no tenga ambigüedad):

- **`firstPeriod` ausente o `{}`**: el backend deriva **todo** a partir de `NOW()` convertido a `America/Argentina/Buenos_Aires`. `code` = Q corriente; `starts_at` / `ends_at` = bordes de ese Q.
- **Solo `code` provisto** (sin `startsAt` ni `endsAt`): el backend deriva `starts_at` y `ends_at` desde el `code` usando timezone AR. Ejemplo: `'2026-Q2'` → `starts_at = 2026-04-01T00:00:00-03:00` (convertido a UTC para storage: `2026-04-01T03:00:00Z`), `ends_at = 2026-06-30T23:59:59.999-03:00` (UTC: `2026-07-01T02:59:59.999Z`). Las tablas de conversión por trimestre son: Q1 = `ene 1 – mar 31`, Q2 = `abr 1 – jun 30`, Q3 = `jul 1 – sep 30`, Q4 = `oct 1 – dic 31`.
- **Solo `startsAt` y `endsAt` provistos** (sin `code`): el backend deriva `code` desde el rango de fechas, **exigiendo que las fechas se alineen exactamente con un borde de trimestre** (convertidas a timezone AR). Si no se alinean → `HTTP 400` con payload `{ error: 'period.range_not_aligned_to_quarter', expected: { starts_at, ends_at } }` sugiriendo el rango correcto del Q detectado.
- **`code` + `startsAt` + `endsAt` todos provistos**: el backend valida coherencia (los tres derivan al mismo rango); si hay mismatch → `HTTP 400` con `{ error: 'period.code_range_mismatch' }`.
- **Override parcial mixto** (ej: `code` + solo `startsAt`, o solo `endsAt`): **rechazado** con `HTTP 400` y `{ error: 'period.partial_override_invalid', message: 'Provee firstPeriod completo, solo code, o solo startsAt+endsAt.' }`. No se intenta "rellenar" el campo faltante para evitar decisiones sorpresivas del backend.

Todas las fechas se almacenan en UTC (`TIMESTAMPTZ` en Postgres) y se interpretan/presentan en timezone AR por la capa de presentación. Esta regla es transversal a toda Period creada por cualquier endpoint (no solo `POST /orgs`).

**Alineación con RN-24 (OKR)**: `POST /orgs` garantiza que siempre haya una Period "current open" apenas la org nace, salvo que el operador haga override con un rango futuro explícitamente. En el caso base, OKR es usable inmediatamente.

**Audit**: `POST /orgs` emite **dos** eventos en la misma transacción: `organization.created` y `period.created`.

---

## API contract

Todos los endpoints bajo `/api/v1/...`. DTOs viven en `packages/shared-types/src/core/` e importan tanto desde `apps/api` como desde `apps/web`.

Guards aplicados:

- `@AuthGuard()` — valida JWT Auth0, resuelve `core.user`, sincroniza `email`/`displayName`/`lastSeenAt` en cada request, popula `AuthContext`.
- `@TenantGuard()` — extrae `organizationId` del header `X-Organization-Id`, valida membership en `core.user_organization_role` (salvo superadmin), valida `organization.status = 'active'`.
- `@SuperadminOnly()` — nuevo decorator (vive en `auth`, documentado acá), valida `AuthContext.isSuperadmin === true`.
- `@Permissions(...)` — ver "Permission keys" abajo.

Códigos HTTP comunes:

- **200**: OK (GET, PATCH con body).
- **201**: created (POST).
- **204**: no content (DELETE, algunos transition endpoints).
- **400**: validación de shape/tipo (class-validator).
- **403**: auth válida pero sin permiso.
- **404**: entidad inexistente **o** fuera del scope del usuario (consistente con edge case 9 de spec OKR: no filtrar información).
- **409**: conflicto de estado (p.ej. intento de abrir una Period cuando ya hay otra open en la org).
- **422**: regla de negocio violada (p.ej. deactivar una org que tiene datos de negocio activos, si elegimos bloquearlo — MVP: **no bloqueamos**, se permite `inactive` libremente; 422 queda para otros casos).

### Permission keys nuevos (dueñazgo: `auth`)

`core` introduce los siguientes permisos que `auth` debe seedear y mapear a roles:

| Permiso | Capacidad |
|---|---|
| `core:org:manage` | Crear/editar/activar/desactivar orgs. MVP: **solo superadmin** usa este permiso (los org-admin no pueden renombrar su propia org sin pasar por superadmin). Queda el permiso explícito para refinado futuro. |
| `core:period:manage` | Crear, editar (mientras `future`), abrir y cerrar Periods. Mapea al rol `org-admin`. |
| `core:member:manage` | Asignar/cambiar/quitar roles a usuarios dentro de la org. Mapea a `org-admin`. |
| `core:module:manage` | Habilitar/deshabilitar módulos para la org. MVP: **solo superadmin** (evita que un org-admin active módulos que impliquen costo). El permiso queda reservado para que, en un ADR futuro, org-admin pueda autohabilitar módulos marcados como "self-serve". |
| `core:user:read` | Leer datos de usuarios. Los org-admin lo tienen scoped a su org (vía `GET /orgs/:orgId/members`). El superadmin lo tiene global. |

`@SuperadminOnly()` se aplica en AND con `@Permissions()` cuando corresponde; algunos endpoints usan solo `@SuperadminOnly()` (los cross-tenant puros) y omiten el decorator de permiso.

### Organizations (superadmin)

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/orgs` | Lista todas las orgs del sistema (paginado). | `@AuthGuard`, `@SuperadminOnly` | query: `ListOrgsQueryDto` `{ status?, page?, pageSize? }` | `{ items: OrganizationSummaryDto[], total, page, pageSize }` | 200, 400, 403 |
| `GET /api/v1/orgs/:id` | Detalle de una org. | `@AuthGuard`, `@SuperadminOnly` | — | `OrganizationDetailDto` | 200, 403, 404 |
| `POST /api/v1/orgs` | Crea org **y primera Period** atómicamente (D8-c). | `@AuthGuard`, `@SuperadminOnly` | `CreateOrganizationDto` `{ slug, name, firstPeriod?: { code?, startsAt?, endsAt? } }` | `OrganizationDetailDto` + `firstPeriodId` | 201, 400, 403, 409 (slug taken) |
| `PATCH /api/v1/orgs/:id` | Edita `name` (no `slug` en MVP — cambiar slug rompe URLs). | `@AuthGuard`, `@SuperadminOnly` | `UpdateOrganizationDto` `{ name? }` | `OrganizationDetailDto` | 200, 400, 403, 404 |
| `POST /api/v1/orgs/:id/deactivate` | Marca `status='inactive'`, setea `deactivated_at`. | `@AuthGuard`, `@SuperadminOnly` | `DeactivateOrganizationDto` `{ reason?: string }` | `OrganizationDetailDto` | 200, 403, 404, 409 (ya inactive) |
| `POST /api/v1/orgs/:id/activate` | Revierte a `status='active'`. | `@AuthGuard`, `@SuperadminOnly` | — | `OrganizationDetailDto` | 200, 403, 404, 409 (ya active) |

**No existe `DELETE /orgs/:id`** en MVP (ver D1).

### Periods (org-admin o superadmin)

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/orgs/:orgId/periods` | Lista periods de la org. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | query: `ListPeriodsQueryDto` `{ status? }` | `PeriodSummaryDto[]` | 200, 403 |
| `GET /api/v1/periods/:id` | Detalle de period. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | — | `PeriodDetailDto` | 200, 403, 404 |
| `POST /api/v1/orgs/:orgId/periods` | Crea period en `status='future'`. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | `CreatePeriodDto` `{ code, startsAt, endsAt }` | `PeriodDetailDto` | 201, 400, 403, 409 (duplicate code) |
| `PATCH /api/v1/periods/:id` | Edita metadata solo si `status='future'`. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | `UpdatePeriodDto` `{ code?, startsAt?, endsAt? }` | `PeriodDetailDto` | 200, 400, 403, 404, 422 (not future) |
| `POST /api/v1/periods/:id/open` | Transiciona `future → open`. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | — | `PeriodDetailDto` | 200, 403, 404, 409 (otra period ya open), 422 (no está en `future`) |
| `POST /api/v1/periods/:id/close` | Transiciona `open → closed`, setea `closed_at` / `closed_by_user_id`. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:period:manage')` | — | `PeriodDetailDto` | 200, 403, 404, 422 (no está en `open`) |

**No existen** `POST /periods/:id/reopen` ni `DELETE /periods/:id` en MVP (AR-03 / RN-23 reservada).

### UserOrganizationRole / Members

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/orgs/:orgId/members` | Lista miembros de la org con sus roles. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:member:manage')` | query: `ListMembersQueryDto` `{ roleKey? }` | `MemberDto[]` con `{ userId, email, displayName, role: { id, key, name } }` | 200, 403 |
| `POST /api/v1/orgs/:orgId/members` | Asigna rol a un usuario (lo invita implícitamente — el usuario no existirá en `core.user` hasta su primer login). | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:member:manage')` | `AssignMemberDto` `{ email, roleKey }` | `MemberDto` | 201, 400, 403, 404 (role key desconocido), 409 (email ya es miembro) |
| `PATCH /api/v1/orgs/:orgId/members/:userId` | Cambia rol. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:member:manage')` | `UpdateMemberDto` `{ roleKey }` | `MemberDto` | 200, 400, 403, 404 |
| `DELETE /api/v1/orgs/:orgId/members/:userId` | Revoca membership (el user sigue existiendo, solo se borra la row de la junction). | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:member:manage')` | — | — | 204, 403, 404 |

**Nota sobre "invitar un usuario que no existe todavía"**: `POST /members` con `{ email, roleKey }` requiere resolver el `userId`. Si no hay `core.user` con ese email todavía, el MVP **rechaza con 404** (el usuario tiene que haber logueado al menos una vez via Auth0 para existir en `core.user`). Un endpoint de "invitar por email" que cree una row pending queda fuera del MVP; el flujo alternativo es: (1) el superadmin o el org-admin comparte la URL de Auth0 con el email invitado, (2) el invitado loguea y se crea su `core.user`, (3) el org-admin asigna el rol. Este trade-off se documenta en "Consequences".

### OrganizationModule

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/orgs/:orgId/modules` | Lista módulos habilitados/deshabilitados de la org. | `@AuthGuard`, `@TenantGuard`, `@Permissions('core:module:manage')` o `@SuperadminOnly` | — | `OrganizationModuleDto[]` con `{ moduleKey, name, enabledAt, disabledAt }` | 200, 403 |
| `POST /api/v1/orgs/:orgId/modules/:moduleKey/enable` | Habilita un módulo. | `@AuthGuard`, `@TenantGuard`, `@SuperadminOnly` (D5: solo superadmin en MVP) | — | `OrganizationModuleDto` | 201, 403, 404 (module key desconocido), 409 (ya habilitado) |
| `POST /api/v1/orgs/:orgId/modules/:moduleKey/disable` | Deshabilita. | `@AuthGuard`, `@TenantGuard`, `@SuperadminOnly` | — | `OrganizationModuleDto` | 200, 403, 404, 409 (ya deshabilitado) |

**Deshabilitar módulo con datos existentes**: en MVP, deshabilitar OKR en una org con Objetivos existentes **bloquea lecturas y escrituras** (el guard `@ModuleEnabled('okr')` responde 403), pero **no** borra datos. Rehabilitar restaura el acceso. Esto no es "desinstalar el módulo" — es un switch binario.

### Me

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/me` | Identifica al usuario autenticado y lista sus membresías con roles y permisos efectivos por org. | `@AuthGuard` (sin `@TenantGuard` — este es el endpoint de descubrimiento de orgs) | — | `MeDto` | 200, 401 |

Shape exacta (contrato pedido por ADR 0001 y refinado acá):

```ts
// packages/shared-types/src/core/me.dto.ts
export interface MeDto {
  userId: string;
  email: string;
  displayName: string;
  isSuperadmin: boolean;
  orgs: Array<{
    id: string;
    slug: string;
    name: string;
    role: {
      key: string;            // p.ej. 'org-admin', 'org-user', 'org-reader'
      name: string;           // display name del rol
      permissions: string[];  // p.ej. ['okr:read', 'okr:write', 'core:period:manage']
    };
    enabledModules: string[]; // p.ej. ['okr']
  }>;
}
```

**Nota de diferencia con el shape que ADR 0001 asumió**: ADR 0001 describió orgs como `{ id, slug, name }` (sin `role` ni `enabledModules`) en la sección "Organization selection for multi-org users". Este ADR **extiende** el shape para incluir `role` (con `permissions` resueltos) y `enabledModules`, porque:

- La UI del frontend necesita saber qué endpoints están disponibles para decidir qué pantallas mostrar, y `permissions` se los da en un round-trip (evita una query por página).
- `enabledModules` permite al frontend no ofrecer la navegación a OKR si la org no lo tiene habilitado.

ADR 0001 ya tolera el shape extendido (no rompe sus asunciones), pero se anota como **ajuste pendiente** al contrato asumido allí.

### Module registry

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/modules` | Lista módulos conocidos del sistema (registry). | `@AuthGuard` (cualquier usuario autenticado) | — | `ModuleDto[]` con `{ key, name, description }` | 200, 401 |

No hay `POST /modules` en MVP — agregar un módulo requiere migración y redeploy (agrega row al seed de `core.module`).

### Shape de DTOs principales (`packages/shared-types/src/core/`)

```ts
// packages/shared-types/src/core/organization.dto.ts
export interface OrganizationSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface OrganizationDetailDto extends OrganizationSummaryDto {
  deactivatedAt: string | null;
  deactivatedByUserId: string | null;
  updatedAt: string;
}

export interface CreateOrganizationDto {
  slug: string;
  name: string;
  firstPeriod?: {
    code?: string;         // default: Q corriente según AR timezone
    startsAt?: string;     // ISO-8601 UTC
    endsAt?: string;       // ISO-8601 UTC
  };
}
```

```ts
// packages/shared-types/src/core/period.dto.ts
export interface PeriodSummaryDto {
  id: string;
  organizationId: string;
  code: string;                                 // 'YYYY-Qn'
  status: 'open' | 'closed' | 'future';
  startsAt: string;
  endsAt: string;
}

export interface PeriodDetailDto extends PeriodSummaryDto {
  closedAt: string | null;
  closedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// packages/shared-types/src/core/member.dto.ts
export interface MemberDto {
  userId: string;
  email: string;
  displayName: string;
  role: {
    id: string;
    key: string;
    name: string;
  };
  assignedAt: string;
}
```

```ts
// packages/shared-types/src/core/module.dto.ts
export interface ModuleDto {
  key: string;
  name: string;
  description: string | null;
}

export interface OrganizationModuleDto {
  organizationId: string;
  moduleKey: string;
  moduleName: string;
  enabledAt: string;
  disabledAt: string | null;
}
```

### Errores: shape común

Idéntico al definido en ADR 0001 (`{ statusCode, message, error, details? }`). `core` introduce códigos de error propios:

- `OrgSlugTaken` (HTTP 409).
- `PeriodCodeDuplicate` (HTTP 409).
- `PeriodAlreadyOpen` — otra period ya está open en la org (HTTP 409).
- `PeriodNotInExpectedState` — intento de transición desde un estado inválido (HTTP 422).
- `UserNotYetRegistered` — al invitar a un email sin `core.user` (HTTP 404 con hint).

---

## Module boundaries

### Módulo `core` — forma interna

```
apps/api/src/modules/core/
├── core.module.ts                    # @Module; wires controllers, services, repos
├── index.ts                          # superficie pública
├── controllers/
│   ├── organization.controller.ts
│   ├── period.controller.ts
│   ├── member.controller.ts
│   ├── organization-module.controller.ts
│   ├── me.controller.ts
│   └── module.controller.ts
├── services/
│   ├── organization.service.ts
│   ├── period.service.ts
│   ├── organization-context.service.ts
│   ├── module-enablement.service.ts
│   ├── me.service.ts
│   └── user-sync.service.ts          # idempotent sync desde JWT Auth0 a core.user
├── repositories/
│   ├── organization.repository.ts
│   ├── period.repository.ts
│   ├── user.repository.ts
│   ├── user-organization-role.repository.ts
│   └── organization-module.repository.ts
├── dto/
├── events/                           # adaptadores a AuditEventEmitter
└── __tests__/
```

### `core/index.ts` — superficie pública

```ts
// apps/api/src/modules/core/index.ts
export { CoreModule } from './core.module';

// Services consumidos desde otros módulos (okr, futuros):
export { OrganizationContextService } from './services/organization-context.service';
export { PeriodService } from './services/period.service';
export { ModuleEnablementService } from './services/module-enablement.service';
export { MeService } from './services/me.service';
export { UserSyncService } from './services/user-sync.service';   // consumed by auth's AuthGuard per ADR 0004

// Tipos públicos (también expuestos via shared-types cuando aplica):
export type { OrganizationContextDto } from './dto/organization-context.dto';
// PeriodDto, ModuleDto, OrganizationDto, MeDto viven en packages/shared-types
// y se re-exportan si es conveniente para tree-shaking.
```

`UserSyncService` is exported because `auth`'s `AuthGuard` invokes it after JWT validation, before permission resolution (see ADR 0004 section "UserSyncService invocation").

### Contratos públicos exportados

#### `OrganizationContextService`

Resuelve la org corriente a partir del `AuthContext` (vía `TenantContextStorage`, ADR 0001 / ADR 0004). Shape elegida:

```ts
export class OrganizationContextService {
  // Lanza si no hay AuthContext con organizationId en ALS.
  getCurrent(): { organizationId: string; slug: string };

  // Nullable — null si no hay contexto.
  getCurrentOrNull(): { organizationId: string; slug: string } | null;

  // Resolve a full DTO (lee organization row).
  getCurrentDetail(): Promise<OrganizationDetailDto>;
}
```

#### `PeriodService`

```ts
export class PeriodService {
  getCurrentOpenPeriod(organizationId: string): Promise<PeriodDetailDto | null>;
  // Devuelve null si la org está inactive (ver D1) o si no hay open.

  getById(periodId: string): Promise<PeriodDetailDto>;
  // Lanza 404 si no existe o si el tenant scope lo oculta.

  // Internos al módulo (no exportados):
  // createForOrganization, openPeriod, closePeriod, patchPeriod → usados solo por controllers.
}
```

El shape `PeriodDetailDto` (`id`, `organizationId`, `code`, `status`, `startsAt`, `endsAt`, `closedAt`, `closedByUserId`) es el que ADR 0001 asumió. Se entrega exactamente.

#### `ModuleEnablementService`

```ts
export class ModuleEnablementService {
  isEnabled(organizationId: string, moduleKey: string): Promise<boolean>;
  // true si existe row en core.organization_module con disabled_at IS NULL.

  // Internos (no exportados): enableModule, disableModule.
}
```

El guard `@ModuleEnabled('okr')` (que vive en `auth` según ADR 0001, pero consume `ModuleEnablementService`) se apoya en este contrato.

#### `MeService`

```ts
export class MeService {
  getMe(userId: string): Promise<MeDto>;
}
```

Implementa el endpoint `GET /me`. Usa el `PrismaService.raw` (ver D6) para leer cross-tenant sin la extension.

### `core` consume de `auth`

Importa exclusivamente desde `modules/auth/index.ts`:

- `AuthGuard` — valida JWT Auth0.
- `TenantGuard` — valida membership y popula `AuthContext.organizationId`.
- `SuperadminOnly` — decorator para endpoints cross-tenant.
- `Permissions` — decorator con permission keys.
- `CurrentUser` / `AuthContext` — inyección del contexto autenticado.
- `TenantContextStorage` — `AsyncLocalStorage` que `OrganizationContextService` lee.

Contrato que `auth` le debe a `core`: ver "Faltantes en otros módulos".

### `core` consume de `audit`

Importa desde `modules/audit/index.ts`:

- `AuditEventEmitter.emit(event, tx?)` — con la misma semántica que ADR 0001 (en-transacción).

### `core` no consume de `okr`

Dirección inversa. `core` es upstream; no conoce de la existencia de `okr`.

### Prohibiciones explícitas

- **Prohibido**: `import { X } from '../auth/internal/...'` o `'../audit/internal/...'`. Solo `index.ts`.
- **Prohibido**: `import { X } from '../okr/...'`. `core` nunca depende de módulos de negocio.
- **Prohibido**: `core` escribe directamente en `audit.event` vía Prisma. Siempre vía `AuditEventEmitter`.
- **Prohibido**: `core` consulta `auth.role` / `auth.permission` vía Prisma directo para resolver permisos. Para resolver permisos del `MeDto`, `core` consume un servicio público de `auth` (`AuthService.getPermissionsForMembership(userId, orgId)` o equivalente). Esto queda anotado como faltante para ADR 0004.

---

## Tenant scoping

### Flujo end-to-end (consistente con ADR 0001)

```
JWT Auth0
  ↓
AuthGuard → resuelve core.user (UserSyncService hace upsert por auth0_sub).
  ↓
TenantGuard → lee header X-Organization-Id:
  - Si falta y endpoint requiere tenant → 400.
  - Si presente: valida que core.user_organization_role tenga la row (salvo isSuperadmin=true).
  - Valida core.organization.status = 'active' (salvo bypass superadmin).
  - Popula AuthContext.organizationId.
  ↓
AsyncLocalStorage (TenantContextStorage) ← AuthContext.
  ↓
Prisma extension filtra/inyecta organizationId en modelos tenant-scoped.
  ↓
Repositories.
```

### Modelos bajo la extension (D6)

Set actualizado tras este ADR:

```
TENANT_SCOPED_MODELS = {
  // Schema okr:
  'Objective', 'KeyResult', 'Task',
  // Schema core:
  'Period', 'UserOrganizationRole', 'OrganizationModule',
  // Schema audit: scoping aparte (ADR 0003).
}
```

Fuera del set:

- `core.Organization` — raíz del tenant, no lleva `organizationId`.
- `core.User` — cross-tenant por diseño.
- `core.Module` — catálogo global.

### Superadmin bypass

Cuando `AuthContext.isSuperadmin === true`:

- La Prisma extension **no** inyecta `organizationId` en operaciones de modelos tenant-scoped. El service es responsable de pasar el `organizationId` explícito si corresponde.
- El `TenantGuard` permite pasar con un `X-Organization-Id` que no tiene membership en `core.user_organization_role`.
- La organización target **debe seguir existiendo y estar `active`** (salvo que el superadmin esté operando sobre el endpoint de reactivación).

Esto resuelve la pregunta de "operar cross-tenant" que ADR 0001 dejó fuera de alcance en "MVP del módulo okr". Acá se define a nivel core; los módulos de negocio heredan el comportamiento.

### Edge cases

- **`GET /me`**: no usa `TenantGuard`. Usa `PrismaService.raw` para leer cross-tenant (D6). El único endpoint con este patrón en `core`.
- **`GET /orgs` (superadmin)**: no usa `TenantGuard`. Lee `core.organization` (fuera del set scoped).
- **`POST /orgs` (superadmin)**: crea una org y la primera Period atómicamente. La Period, aunque el modelo está scoped, se inserta pasando `organizationId` explícito; la extension **bypassa** por el flag superadmin.
- **Audit events de `core`**: `AuditEventEmitter` recibe el `organizationId` del evento explícitamente (ver "Audit events"). Para eventos que **no** son de una org específica (p.ej. `user.superadmin_granted`), el `organization_id` del evento es `null`. El schema de `audit.event` debe permitir `organization_id NULL` para estos casos — faltante para ADR 0003.

---

## Audit events

Todos los eventos son INSERT en `audit.event`, dentro de la misma transacción Prisma que la mutación. Shape y campos comunes (consistente con ADR 0001):

```
{
  id: cuid,
  occurred_at: timestamp,
  actor_id: userId,
  organization_id: orgId | null,   // null para eventos de sistema (p.ej. superadmin grant)
  entity_type: string,
  entity_id: string,
  action: string,
  diff: JSONB,
  request_id: string
}
```

Tabla de eventos:

> Todos los eventos listados tienen su `organization_id` poblado **por default** desde `TenantContextStorage` (ADR 0003 + ADR 0004). Los endpoints **cross-tenant** (`POST /orgs`, `POST /orgs/:id/modules/:key/enable`, `POST /users/:id/superadmin`, `DELETE /users/:id/superadmin`, `organization.activated` / `organization.deactivated` disparados por superadmin) deben usar la variante override `emit(event, { organizationId })` — o `emit(event, { organizationId: null })` para eventos de sistema como `user.superadmin_granted` que no pertenecen a ninguna org.

| Mutación | `action` | `entity_type` | `entity_id` | `organization_id` | `diff` (JSONB) | Notas |
|---|---|---|---|---|---|---|
| `POST /orgs` | `organization.created` | `core.organization` | `org.id` | `org.id` | `{ before: null, after: { slug, name, status } }` | Se emite **junto con** `period.created` (misma tx). [confirmed: explicit override required] |
| `POST /orgs` (Period inicial) | `period.created` | `core.period` | `period.id` | `org.id` | `{ before: null, after: { code, status, startsAt, endsAt } }` | Evento de la Period auto-creada en D8. [confirmed: explicit override required] |
| `PATCH /orgs/:id` | `organization.updated` | `core.organization` | `org.id` | `org.id` | `{ before: { name }, after: { name } }` | Solo campos cambiados. [confirmed: explicit override required] |
| `POST /orgs/:id/deactivate` | `organization.deactivated` | `core.organization` | `org.id` | `org.id` | `{ before: { status: 'active' }, after: { status: 'inactive', deactivatedAt, reason? } }` | [confirmed: explicit override required] |
| `POST /orgs/:id/activate` | `organization.activated` | `core.organization` | `org.id` | `org.id` | `{ before: { status: 'inactive' }, after: { status: 'active' } }` | [confirmed: explicit override required] |
| `POST /orgs/:orgId/periods` | `period.created` | `core.period` | `period.id` | `orgId` | `{ before: null, after: { code, status: 'future', startsAt, endsAt } }` | Period creada manualmente (no la auto de D8). |
| `PATCH /periods/:id` | `period.updated` | `core.period` | `period.id` | `orgId` | `{ before: {...}, after: {...} }` | Solo campos cambiados. Válido solo en `status='future'`. |
| `POST /periods/:id/open` | `period.opened` | `core.period` | `period.id` | `orgId` | `{ before: { status: 'future' }, after: { status: 'open' } }` | |
| `POST /periods/:id/close` | `period.closed` | `core.period` | `period.id` | `orgId` | `{ before: { status: 'open' }, after: { status: 'closed', closedAt, closedByUserId } }` | |
| `user-sync` (primer login) | `user.created` | `core.user` | `user.id` | `null` | `{ before: null, after: { auth0Sub, email, displayName } }` | Emitido por `UserSyncService` en primer login Auth0. [confirmed: nullable] |
| `user-sync` (cambio email/name) | `user.updated` | `core.user` | `user.id` | `null` | `{ before: { email?, displayName? }, after: {...} }` | Solo si cambió desde la request anterior. [confirmed: nullable] |
| `POST /orgs/:orgId/members` | `user_organization_role.assigned` | `core.user_organization_role` | `${userId}:${orgId}` | `orgId` | `{ before: null, after: { roleId, roleKey } }` | |
| `PATCH /orgs/:orgId/members/:userId` | `user_organization_role.role_changed` | `core.user_organization_role` | `${userId}:${orgId}` | `orgId` | `{ before: { roleId, roleKey }, after: { roleId, roleKey } }` | |
| `DELETE /orgs/:orgId/members/:userId` | `user_organization_role.removed` | `core.user_organization_role` | `${userId}:${orgId}` | `orgId` | `{ before: { roleId }, after: null }` | |
| `POST /orgs/:orgId/modules/:moduleKey/enable` | `organization_module.enabled` | `core.organization_module` | `${orgId}:${moduleKey}` | `orgId` | `{ before: null, after: { enabledAt, enabledByUserId } }` | [confirmed: explicit override required] |
| `POST /orgs/:orgId/modules/:moduleKey/disable` | `organization_module.disabled` | `core.organization_module` | `${orgId}:${moduleKey}` | `orgId` | `{ before: { disabledAt: null }, after: { disabledAt, disabledByUserId } }` | [confirmed: explicit override required] |
| Bootstrap + promoción superadmin | `user.superadmin_granted` | `core.user` | `user.id` | `null` | `{ before: { isSuperadmin: false }, after: { isSuperadmin: true }, reason: 'bootstrap' \| 'manual' }` | [confirmed: nullable] |
| Revocación superadmin | `user.superadmin_revoked` | `core.user` | `user.id` | `null` | `{ before: { isSuperadmin: true }, after: { isSuperadmin: false } }` | [confirmed: nullable] |

**Confirmación**: todos son INSERTs. `core` nunca hace UPDATE/DELETE sobre `audit.event`. Correcciones → eventos compensatorios.

**No auditado**: lecturas (`GET`), por consistencia con ADR 0001. `GET /me` tiene tráfico alto; auditar se evalúa a futuro si aparece requisito forense.

---

## Alternatives considered

Además de las alternativas internas a cada decisión D1–D8 (ya documentadas en esa sección), se evaluaron:

### A1. Schema layout: `core` único vs distribución

**Descartada**: separar `organization`, `user`, `period`, `organization_module` en schemas distintos (uno por "bounded context interno"). Problema: todas comparten un ciclo de vida fuertemente acoplado (una org tiene periods, miembros y módulos; no hay caso de uso donde una viva sin las otras). Separar schemas agrega complejidad de migración sin ganar aislamiento real. Se mantiene todo en `core`.

### A2. Naming: `module_key` vs `module_id`

**Descartada**: usar un `module_id` cuid generado. Razón para preferir `module_key` (string natural, p.ej. `'okr'`):

- El key es el identificador que los devs de cada módulo necesitan usar en el código (`@ModuleEnabled('okr')`). Usar un cuid obligaría a hardcodear UUIDs en decorators, que es ilegible y frágil (cambia entre entornos si no hay seed determinístico).
- La cardinalidad es baja (módulos cuentan en decenas, no millones). Usar string PK no tiene costo.
- FK más legibles en logs y audit.

### A3. REST vs GraphQL

**Descartada**: GraphQL. ADR 0001 eligió REST; por consistencia, `core` sigue REST. Si en el futuro aparece necesidad de queries complejas compuestas (especialmente para backoffice admin), se evalúa GraphQL en un ADR dedicado sin romper los endpoints REST actuales.

### A4. `PeriodService.getCurrentOpenPeriod` devuelve Optional vs lanza excepción

**Descartada**: lanzar una excepción custom cuando no hay period open. Se prefiere devolver `null` porque el caller (p.ej. `okr` en `POST /objectives`) tiene que tomar una decisión de UX específica (retornar 422 con `error: 'NoCurrentOpenPeriod'`); una excepción obligaría a catch + re-throw en ese caller. Devolver `Optional` deja la decisión en el sitio donde importa.

### A5. `core.user` vs delegar completamente la identidad a Auth0

**Descartada**: no persistir `core.user` y resolver identidad solo del JWT. Problemas: (a) `UserOrganizationRole.user_id` necesita una FK estable; no podemos referenciar `auth0_sub` directamente porque Auth0 permite merge de identidades y el `sub` podría cambiar (caso borde). (b) `displayName` y `lastSeenAt` son datos "nuestros" — no pertenecen a Auth0. (c) Performance: joinear contra una tabla local es más barato que hacer lookups a Auth0 en cada request.

### A6. Auto-crear Period del Q corriente en TODO login vs solo al crear org

**Descartada**: cron que se asegure de que cada org activa siempre tenga una Period open. Problemas: (a) convierte al sistema en opinador sobre el flujo de la org (qué pasa si el admin quiso cerrar Q2 unos días antes de abrir Q3 para hacer post-mortem sin presión de nuevos objetivos?), (b) requiere infra de cron que MVP no tiene. Se delega al admin de org.

---

## Impact

### Migraciones requeridas

1. Crear schema Postgres `core` si no existe.
2. Crear tablas `core.organization`, `core.period`, `core.user`, `core.user_organization_role`, `core.organization_module`, `core.module` con columnas, FKs, CHECKs e índices listados en "Data model".
3. Crear índice parcial único `uq_period_org_one_open` (SQL directo, no Prisma).
4. Seed idempotente de `core.module` con row `{ key: 'okr', ... }`.
5. Hook en `UserSyncService` para promoción automática del primer superadmin por env var.
6. Consumo de FK cross-schema `user_organization_role.role_id → auth.role(id)` — requiere que `auth.role` exista **antes** de aplicar la migración de `core.user_organization_role`. Orden de migraciones: schema `auth` + tabla `auth.role` **primero**, luego `core.user_organization_role`.

### Tests nuevos

- **Unit (`apps/api/src/modules/core/__tests__/`)**:
  - `PeriodService`: `getCurrentOpenPeriod` respeta `organization.status`, devuelve `null` si inactive o sin open; `getById` respeta tenant scope.
  - `ModuleEnablementService.isEnabled`: activo / inactivo / nunca habilitado.
  - `MeService.getMe`: lista correcta de membresías, incluye permisos resueltos, incluye `enabledModules`.
  - `OrganizationContextService`: lanza `MissingTenantContextError` si ALS vacío.
  - `UserSyncService`: upsert idempotente; promoción al superadmin si env var coincide y no hay otro superadmin.

- **Integration (`apps/api/test/`, testcontainers Postgres)**:
  - `POST /orgs` crea atómicamente org + Period open (D8). Si la tx falla en paso 2, no queda la org.
  - Unique parcial `uq_period_org_one_open` rechaza `INSERT` de una segunda Period con `status='open'` en la misma org.
  - `POST /periods/:id/open` valida que no exista otra open (409).
  - `POST /periods/:id/close` cierra y registra `closed_at`, `closed_by_user_id`.
  - `PATCH /periods/:id` en `status='open'` falla con 422.
  - `GET /me` lista permisos correctos según el rol de cada membership; no expone orgs a las que el user no pertenece.
  - Tenant scoping: un org-admin de Org A que pide `GET /orgs/:orgIdB/members` recibe 403 (no 404 — D6: aplica `@TenantGuard` que rechaza antes de consultar).
  - Superadmin bypass: superadmin puede `POST /orgs`, `GET /orgs`, `POST /orgs/:id/modules/:key/enable` en cualquier org.
  - Module enablement: `@ModuleEnabled('okr')` responde 403 si el módulo está disabled o nunca habilitado.
  - Bootstrap superadmin: variable de entorno promueve al primer login; subsiguientes logins con el mismo email no re-promueven si ya hay un superadmin (idempotente).
  - Period auto-creada por `POST /orgs`: arranca con `status='open'`, `code` correcto según fecha actual en tz AR, `starts_at`/`ends_at` alineados al Q.

- **E2E (`apps/web`, Playwright)**:
  - Flujo fundacional: superadmin loguea (bootstrap), crea org "Test Org", verifica que la primera Period quedó open, habilita módulo OKR, invita un email como `org-admin`, el invitado loguea (se crea su `core.user`), se le asigna rol, crea su primer Objetivo.
  - Cambio de organización: un usuario con membership en dos orgs ve las dos en `GET /me`, cambia de org en el selector, el contexto se propaga a OKR.
  - Org inactive: desactivar una org hace que las requests a `/api/v1/okr/...` con esa org en `X-Organization-Id` respondan 403.

### Módulos afectados

- **`auth`** (ADR 0004 futuro): debe exponer `AuthGuard`, `TenantGuard`, `SuperadminOnly`, `Permissions`, `CurrentUser` decorator, `AuthContext` tipo, `TenantContextStorage` (ALS). Debe exponer un servicio para resolver permisos de una membership (consumido por `MeService`). Debe seedear roles base (`org-admin`, `org-user`, `org-reader`) y permisos `core:*` + `okr:*`.
- **`audit`** (ADR 0003 futuro): debe aceptar `organization_id NULL` en `audit.event` para eventos sistema (user.*). Debe exponer `AuditEventEmitter` que acepte `tx` opcional.
- **`packages/shared-types`**: agrega namespace `core` con DTOs listados (`OrganizationDto`, `PeriodDto`, `MemberDto`, `ModuleDto`, `OrganizationModuleDto`, `MeDto`).
- **`packages/prisma-tenant-extension`**: el set `TENANT_SCOPED_MODELS` se extiende para incluir `Period`, `UserOrganizationRole`, `OrganizationModule`. Se agrega soporte para el flag `isSuperadmin` en el context (bypass). Se agrega un mecanismo documentado para queries "raw" sin la extension (ver D6).

### Faltantes públicos que deben resolver ADRs futuros

Ver sección final del resumen al usuario.

---

## Consequences

### Trade-offs aceptados

- **No soft-delete en Organization**: perdemos el "undo" conceptual; ganamos simplicidad y alineación con el modelo de auditoría. Aceptable.
- **Una sola Period open por org**: bloquea el patrón "Q anterior aún abierto mientras arranca el nuevo". Se mitiga con ventana de cierre diferido administrado por el admin (ver D3). Si aparece demanda, se reevalúa.
- **Cierre de Period manual**: el admin **debe** cerrar a mano cuando termina el Q. Si se olvida, la Period sigue open y `okr` sigue aceptando creaciones en `Q2 vencido` mientras esté open. Mitigación: dashboard de admin muestra "Period X venció hace N días — ¿cerrar?". No es bloqueante pero es visible.
- **Primer superadmin via env var**: operador tiene que setear una env var específica para bootstrap. Riesgo: si no la setea, nadie puede crear la primera org. Mitigación: documentar el paso en el README/onboarding (fuera de esta ADR).
- **Invitar por email no crea `core.user` pending**: org-admin no puede pre-configurar roles para usuarios que aún no loguearon. Trade-off explícito por simplicidad MVP.
- **Módulos no pre-habilitados**: cada org arranca sin módulos. El superadmin habilita OKR explícitamente. Levemente tedioso para el MVP donde solo hay OKR, pero es la policy correcta para cuando haya más módulos.
- **`GET /me` acarrea permisos expandidos**: payload crece lineal con orgs × roles × permisos. Para un usuario con membership en 50 orgs con 10 permisos cada uno, son 500 strings. Aceptable; si crece, se pagina o se vuelve lazy.

### Limitaciones conocidas

- **Cambiar `slug` de una org**: no soportado. Rompería URLs y el `X-Organization-Id` si alguien usa slug en vez de id. Requiere ADR dedicado.
- **Merge de usuarios**: si Auth0 merge dos identidades en un solo `sub`, el mapeo a `core.user` queda roto. Fuera de alcance MVP.
- **Transferencia de orgs entre instancias**: no hay export/import de una org con su contenido OKR. Si aparece (ej: reorganización de la plataforma), requiere ADR.
- **Scheduling de Period lifecycle**: no hay cron. Transiciones son siempre manuales.
- **Idempotencia del `POST /orgs`**: si el request timeouts entre la inserción de org y de Period, la tx rollback deja nada. La UI debe manejar "el request falló, ¿creo de nuevo con el mismo slug?" (el uniqueness de slug previene duplicados).
- **Revocación accidental del único superadmin**: si el **único** superadmin del sistema se revoca a sí mismo (o es revocado por otro superadmin), el sistema queda sin ningún superadmin, y la env var `CORE_BOOTSTRAP_SUPERADMIN_EMAIL` ya no tiene efecto (D5 es idempotente por diseño: solo promueve al primer login si **no existe ningún superadmin previo**, y un usuario revocado ya pasó por ese primer login). **Recuperación**: SQL manual para setear `is_superadmin = true` sobre un usuario conocido en `core.user`. Aceptable para MVP dado que requiere la coincidencia de (a) un superadmin revocándose a sí mismo y (b) no existir ningún otro superadmin — escenario raro y reversible por operador con acceso a DB. **Mitigación futura**: guard a nivel service-layer en `POST /users/:id/revoke-superadmin` que rechace la operación si el usuario objetivo es el último con `is_superadmin = true` (query `COUNT(*) WHERE is_superadmin = true AND id != :targetId`), devolviendo `HTTP 409` con mensaje accionable. Extensión de ~10 LOC; diferida a que el feedback operacional muestre que el escenario ocurre en la práctica.

### Decisiones diferidas

- **Auto-close de Period por `ends_at`**: scheduled job. ADR futuro cuando haya evidencia operacional.
- **Reapertura de Period cerrado**: explícitamente fuera (RN-23 reservada). Requiere ADR dedicado + revisión de inmutabilidad de datos.
- **Invitaciones con `core.user` pending**: ADR futuro cuando haya demanda.
- **Multi-rol por org (un user con varios roles en la misma org)**: ADR futuro. Por ahora PK `(user_id, organization_id)`.
- **Org-admin con permiso `core:module:manage`**: MVP restringe a superadmin. El permiso keyed está listo para que un ADR futuro mueva ese poder a org-admin por módulo (módulos "self-serve" vs "gated").
- **Identidad secundaria (org slug aliases, renaming)**: ADR futuro si aparece caso de uso.
- **`GET /modules` paginado / con flags de enabled per current org**: actualmente devuelve el catálogo plano. Si crece, se expande el contrato.

---

## Conflicts with frozen rules

None detected.

Verificación explícita contra las reglas frozen:

- **Multi-tenant en toda entidad de negocio**: sí. `Period`, `UserOrganizationRole`, `OrganizationModule` llevan `organizationId`. `Organization`, `User`, `Module` quedan fuera del eje (no son entidades de negocio del tipo que la regla apunta — son meta-entidades de infra).
- **`audit.event` append-only**: sí. La tabla de eventos de `core` enumera solo INSERTs.
- **Decimales en Float prohibidos**: n/a. `core` no maneja pesos ni porcentajes.
- **Module boundaries**: sí. `core/index.ts` exporta solo los 4 services + `CoreModule`. `core` consume `auth` y `audit` por `index.ts`; no importa de `okr`.
- **Default deny en endpoints**: sí. Todo endpoint lleva `@AuthGuard` como mínimo; los endpoints que mutan o listan datos sensibles llevan además `@SuperadminOnly` o `@Permissions(...)`.
- **No commitear credenciales**: n/a (no se persisten tokens Auth0 en `core`; solo `auth0_sub`).
- **Jerarquía vertical entre unidades**: n/a acá (ADR 0001 ya lo descartó para OKR; `core` no introduce el concepto).
- **`Objetivo` ligado a un único `Period`**: n/a (cuestión de OKR); `core` provee Period como dependencia, no altera la regla.
- **No auditar GET**: consistente con ADR 0001.
