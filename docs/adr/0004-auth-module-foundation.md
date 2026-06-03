# 0004 — Fundación del módulo Auth

**Status**: Proposed
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-20
**Author**: architect subagent
**Spec**: N/A — derivado de los contratos que ADR 0001 (OKR), ADR 0002 (Core) y ADR 0003 (Audit) asumen hacia `auth`, y de las reglas transversales de `CLAUDE.md` / `AGENTS.md`.

---

## Context and problem

El módulo `auth` es el **último módulo fundacional** de `gestion-publica`. Es el borde del sistema donde se verifica la identidad de quien llega (JWT Auth0), se sincroniza a la DB local (`core.user`), se resuelven los permisos contra el RBAC interno (tablas `auth.role`, `auth.permission`, `auth.role_permission`), se valida la pertenencia a una organización (`core.user_organization_role`), y se propaga todo por las ALS que el resto de módulos consumen.

`auth` **no diseña** entidades de negocio (eso es `okr`), **no diseña** organizaciones ni periods (`core`), **no diseña** el trail append-only (`audit`). Sí **entrega** los guards, decoradores, tipos y servicios que los tres ADRs anteriores asumieron como ya resueltos. Este ADR es la contraparte explícita de esas asunciones.

Los tres ADRs previos reclaman a `auth` los siguientes contratos:

1. **Guards**: `AuthGuard`, `TenantGuard`, `ModuleEnabled`, `SuperadminOnly`.
2. **Decoradores**: `@Permissions(...)`, `@CurrentUser()`, `@SuperadminOnly()`.
3. **Tipos**: `AuthContext` con shape `{ userId, organizationId, permissions[], isSuperadmin }` y extensiones consensuadas (ver D2).
4. **ALS**: `TenantContextStorage` — ownership canónica acá (0002 lo confirma, 0003 lo reafirma).
5. **Servicio de resolución de permisos**: una función pública `hasPermission(ctx, key): boolean` (solicitada por 0002 D9 y por 0003 `@AuditReadAccess`).
6. **Invocación del `UserSyncService` de `core`**: el `AuthGuard` es el entry-point natural; `core` owns la lógica de upsert, `auth` owns el hook (0002 D5).
7. **Package `packages/prisma-tenant-extension`**: 0001 lo ubicó como paquete hermano; `auth` lo **consume** y lo wires al `PrismaService` (0001 "Module boundaries", 0002 D6).
8. **Seeds de `auth.role`, `auth.permission`, `auth.role_permission`**: catálogo definitivo consolidando 0001 + 0002 + 0003.
9. **Flujo frontend Auth0 → Next.js**: cómo la UI adquiere y adjunta el JWT + `X-Organization-Id` header.
10. **Rate limiting** baseline (no especificado en ADRs previos pero necesario para cerrar el borde).

Adicionalmente, `auth` cierra decisiones que quedaron abiertas:

- Librería de validación JWT (jwks + firma).
- Cacheo de JWKS y política de rotación.
- Mecanismo exacto de enforcement del orden de guards (`APP_GUARD` vs `@UseGuards` por controller).
- Resolución del edge case "usuario autenticado sin org" y del edge case "superadmin sin `X-Organization-Id`".
- Representación interna de los permisos del superadmin (`'*'` sentinel vs expansión completa vs `null`).

### Preguntas a responder

1. ¿Qué librería valida el JWT y cachea el JWKS, y bajo qué política de rotación?
2. ¿Cuál es el shape final de `AuthContext`, qué guard popula cada campo y cuáles pueden quedar `undefined`?
3. ¿Cómo se resuelven los permisos de `(userId, organizationId)`? ¿Se cachean por request? ¿Cómo se representa al superadmin?
4. ¿En qué orden corren los guards y cómo lo enforza NestJS?
5. ¿Dónde exactamente se invoca `UserSyncService` y con qué semántica de orden respecto a la resolución de permisos?
6. ¿Qué forma tiene `packages/prisma-tenant-extension` y cómo expone `PrismaService` las dos variantes (scoped vs raw)?
7. ¿Cuál es la matriz definitiva permisos × roles, consolidando los tres ADRs previos?
8. ¿Qué endpoints admin expone `auth` en MVP?
9. ¿Qué SDK de frontend se adopta y cómo se transporta `X-Organization-Id`?
10. ¿Hay rate limiting baseline?
11. ¿Qué ajustes (si alguno) requieren los ADRs 0001/0002/0003 para quedar coherentes con las decisiones de este ADR?

### Asunciones declaradas

- El tenant por Auth0 ya existe, con un Application de tipo "Regular Web" (para Next.js) y una API registrada con audience `https://api.gestion-publica.ar` (placeholder; el valor concreto vive en env).
- El locale es `es-AR`; los `email` llegan en UTF-8 normalizado por Auth0.
- La comunicación entre Next.js y la API Nest es sobre HTTPS; `Set-Cookie` con `Secure; SameSite=Lax` es aceptable en el entorno de producción.
- Ningún job autónomo emite eventos en MVP (consistente con ADR 0003 D9).

## Decision

Vamos a implementar `auth` como un módulo NestJS autocontenido que:

- **Valida JWT** con `jwks-rsa` + `jsonwebtoken` (D1), con JWKS cacheado en memoria por 10 minutos y fallback stale-on-error al endpoint JWKS de Auth0.
- **Publica `AuthContext`** con shape `{ userId, auth0Sub, email, displayName, isSuperadmin, organizationId, permissions, requestId }` populado incrementalmente por `AuthGuard` → `TenantGuard` (D2).
- **Resuelve permisos en DB por request** con un único JOIN `user_organization_role → role_permission → permission`, cacheado en `AuthContext.permissions[]` para el resto de la request; el superadmin se representa con el sentinel `'*'` y un helper `hasPermission()` (D3).
- **Enforza orden de guards** via una combinación de `APP_GUARD` provider para `AuthGuard` y `RequestContextInterceptor` (global), más `@UseGuards()` explícito por controller para `TenantGuard` / `ModuleEnabled` / `Permissions` / `SuperadminOnly` en el orden documentado (D4).
- **Invoca `UserSyncService` de `core` desde `AuthGuard`** tras validar JWT y antes de resolver permisos (D5). El bootstrap del primer superadmin ocurre dentro de ese upsert.
- **Posee `packages/prisma-tenant-extension`** con soporte para bypass de superadmin y de modelos no-scoped, expuesto via `PrismaService.scoped` (default, con la extension) y `PrismaService.raw` (sin la extension) (D6).
- **Seedea el catálogo consolidado** de permisos (`okr:*`, `core:*`, `audit:*`) y roles (`org-reader`, `org-user`, `org-admin`, más `external-auditor` declarado pero sin asignaciones MVP) (D7).
- **Expone endpoints admin** de solo lectura sobre roles y permisos (D8); mutaciones de roles/permisos quedan fuera de MVP (solo migraciones).
- **En frontend** adopta `@auth0/nextjs-auth0` v3+ con session cookie, y transporta `X-Organization-Id` en una **cookie httpOnly** (D9).
- **Rate limiting** via `@nestjs/throttler` con bucket por `auth0Sub` (fallback IP), 100 req/min default (D10).
- **No propone amendments materiales** a 0001/0002/0003; identifica y lista ajustes textuales menores en §11.

---

## Data model

### Ubicación

Schema Postgres: **`auth`**. Tres tablas: `auth.role`, `auth.permission`, `auth.role_permission`.

**`core.user_organization_role`** (definida en ADR 0002) consume FK cross-schema a `auth.role(id)`. Por lo tanto la migración de `auth` debe correr **antes** que la migración de `core.user_organization_role`, como ya anotó 0002 "Impact → Migraciones requeridas".

### Tipos comunes

- IDs de `auth.role`: `cuid` (string). Consistente con 0001/0002/0003.
- `auth.permission.key`: PK **string** (no cuid), idéntico al approach de `core.module.key` (0002 D4). Razón: los permission keys son literales usados en decoradores (`@Permissions('okr:write')`); hardcodear cuids en decoradores sería ilegible y frágil entre entornos.
- `auth.role.key`: también string PK (ej. `'org-admin'`), por la misma razón. El `id` cuid se mantiene porque `core.user_organization_role.role_id` ya se diseñó en 0002 como FK a `auth.role.id`; pero el `key` queda `UNIQUE` para lookup por literal.

### Shape ilustrativo (Prisma)

> Ilustrativo, no migración ejecutable.

```prisma
// apps/api/prisma/schema.prisma (extracto — schema "auth")

model Role {
  id             String   @id @default(cuid())
  key            String   @unique @db.VarChar(64)       // 'org-admin', 'org-user', 'org-reader', 'external-auditor'
  name           String   @db.VarChar(120)
  description    String?  @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  rolePermissions RolePermission[]

  @@schema("auth")
  @@map("role")
}

model Permission {
  key            String   @id @db.VarChar(64)           // p.ej. 'okr:write'
  description    String   @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  rolePermissions RolePermission[]

  @@schema("auth")
  @@map("permission")
}

model RolePermission {
  roleId         String   @map("role_id")
  permissionKey  String   @map("permission_key")
  assignedAt     DateTime @default(now()) @map("assigned_at")

  role           Role       @relation(fields: [roleId], references: [id], onDelete: Restrict)
  permission     Permission @relation(fields: [permissionKey], references: [key], onDelete: Restrict)

  @@id([roleId, permissionKey])
  @@index([permissionKey], map: "idx_role_permission_key")
  @@schema("auth")
  @@map("role_permission")
}
```

### CHECKs SQL complementarios

```sql
ALTER TABLE auth.role
  ADD CONSTRAINT chk_role_key_format
  CHECK (key ~ '^[a-z][a-z0-9-]{1,62}[a-z0-9]$');

ALTER TABLE auth.permission
  ADD CONSTRAINT chk_permission_key_format
  CHECK (key ~ '^[a-z][a-z0-9:_-]{1,62}[a-z0-9]$');
```

El formato permite `okr:write`, `core:period:manage`, `audit:read:all` y variantes con `_` (`superadmin_granted` si en el futuro se permite permission literal; hoy no).

### Índices — justificación

| Índice | Propósito |
|---|---|
| `auth.role.key UNIQUE` | Lookup por literal desde decoradores y seeds. |
| `auth.permission.key` (PK, string) | Acceso directo; el PK ya indexa. |
| `idx_role_permission_key` | Reverse lookup: "qué roles tienen el permiso X" (útil para `GET /permissions/:key/roles`, backoffice). |

El JOIN crítico de cada request (resolución de permisos) es:

```
core.user_organization_role (user_id, organization_id) 
  JOIN auth.role ON auth.role.id = core.user_organization_role.role_id
  JOIN auth.role_permission ON auth.role_permission.role_id = auth.role.id
  JOIN auth.permission ON auth.permission.key = auth.role_permission.permission_key
```

Indexado por:

- `core.user_organization_role (user_id, organization_id)` — PK compuesta en `core` (ADR 0002).
- `auth.role (id)` — PK.
- `auth.role_permission (role_id, permission_key)` — PK.
- `auth.permission (key)` — PK.

Plan esperado: tres index lookups + un hash/merge join sobre sets pequeños. Sub-milisegundo en el caso MVP (< 10 permisos por rol, < 5 roles).

### Unique constraints

- `auth.role.key` unique global.
- `auth.permission.key` PK.
- `auth.role_permission (role_id, permission_key)` PK compuesta.

---

## API contract

Todos los endpoints bajo `/api/v1/...`. DTOs viven en `packages/shared-types/src/auth/`.

Guards aplicados:

- `@AuthGuard()` — en todos los endpoints del módulo.
- `@SuperadminOnly()` o `@Permissions(...)` — según endpoint.
- **No** se aplica `@TenantGuard()` a los endpoints de `auth`: son operaciones de catálogo global (roles/permisos), no de una org específica.
- **No** se aplica `@ModuleEnabled(...)` — `auth` no es un módulo de negocio habilitable.

Códigos HTTP comunes (consistentes con 0001/0002/0003):

- **200**, **201**, **204**: éxitos normales.
- **400**: validación de shape.
- **401**: JWT ausente, malformado o expirado.
- **403**: JWT válido pero sin permiso.
- **404**: entidad inexistente. Aplica a entidades top-level del sistema (p.ej. `Organization` en el header `X-Organization-Id`). Para entidades de negocio per-tenant (Objetivos, KRs, Tareas), la política anti-leak colapsa "no existe" y "no tenés acceso" a un 403 uniforme — ver sección "Secuencia A" para el desglose.

### Endpoints (D8)

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/roles` | Lista todos los roles del sistema. | `@AuthGuard`, `@SuperadminOnly` | — | `RoleDto[]` | 200, 401, 403 |
| `GET /api/v1/roles/:key` | Detalle de un rol. | `@AuthGuard`, `@SuperadminOnly` | — | `RoleDetailDto` | 200, 401, 403, 404 |
| `GET /api/v1/roles/:key/permissions` | Permisos asignados a un rol. | `@AuthGuard`, `@SuperadminOnly` | — | `PermissionDto[]` | 200, 401, 403, 404 |
| `GET /api/v1/permissions` | Lista todos los permisos del sistema. | `@AuthGuard`, `@SuperadminOnly` | — | `PermissionDto[]` | 200, 401, 403 |
| `GET /api/v1/permissions/:key` | Detalle de un permiso. | `@AuthGuard`, `@SuperadminOnly` | — | `PermissionDetailDto` | 200, 401, 403, 404 |

**No hay mutaciones** (ni `POST`, ni `PATCH`, ni `DELETE`). Decisión D8: roles y permisos son seeds; agregar/modificar requiere migración + redeploy. Razones:

- El MVP tiene un catálogo cerrado (4 roles, ~11 permisos). La probabilidad de que un org-admin quiera crear un rol ad-hoc es baja.
- Exponer mutaciones introduce complejidad de coherencia: si se borra un permiso que otro módulo usa en `@Permissions(...)`, se rompe el sistema en runtime.
- Para el caso "crear un rol `external-auditor` futuro con `audit:read:all`", basta una migración de seed. Más auditable que un endpoint.

Cuando aparezcan orgs con necesidad de roles custom, se abrirá un ADR dedicado para el submodelo (roles seedeados vs roles custom por org, namespace separado, etc.). No se anticipa.

### DTOs principales (`packages/shared-types/src/auth/`)

```ts
// packages/shared-types/src/auth/role.dto.ts
export interface RoleDto {
  id: string;
  key: string;                 // 'org-admin', 'org-user', ...
  name: string;
  description: string | null;
}

export interface RoleDetailDto extends RoleDto {
  permissions: PermissionDto[];
  createdAt: string;           // ISO-8601
}
```

```ts
// packages/shared-types/src/auth/permission.dto.ts
export interface PermissionDto {
  key: string;                 // 'okr:write', 'core:period:manage', ...
  description: string;
}

export interface PermissionDetailDto extends PermissionDto {
  roles: Array<{ key: string; name: string }>;
  createdAt: string;
}
```

```ts
// packages/shared-types/src/auth/auth-context.ts
// Runtime type, consumido internamente por apps/api; se expone a shared-types
// para tipos auxiliares como PermissionKey (ver abajo).
export interface AuthContext {
  userId: string;               // core.user.id
  auth0Sub: string;             // JWT 'sub' claim
  email: string;                // cached from last sync
  displayName: string;          // cached from last sync
  isSuperadmin: boolean;        // core.user.is_superadmin
  organizationId: string | null; // null si el endpoint es cross-tenant o si el user no eligió org
  permissions: readonly string[];// resueltos para (userId, organizationId); '*' si superadmin
  requestId: string;            // copiado de RequestContextStorage para conveniencia
}
```

```ts
// packages/shared-types/src/auth/permission-keys.ts
// Catálogo definitivo (D7). Se re-genera con los seeds.
export type PermissionKey =
  | 'okr:read'
  | 'okr:write'
  | 'okr:progress:write'
  | 'okr:admin'
  | 'core:org:manage'
  | 'core:period:manage'
  | 'core:member:manage'
  | 'core:module:manage'
  | 'core:user:read'
  | 'audit:read'
  | 'audit:read:all';

export type RoleKey =
  | 'org-reader'
  | 'org-user'
  | 'org-admin'
  | 'external-auditor';  // declarado, sin asignaciones MVP
```

### Errores: shape común

Idéntico a 0001/0002/0003 (`{ statusCode, message, error, details? }`). Códigos propios de `auth`:

- `JwtMalformed` — HTTP 401.
- `JwtExpired` — HTTP 401.
- `JwtSignatureInvalid` — HTTP 401.
- `JwtIssuerInvalid` / `JwtAudienceInvalid` — HTTP 401.
- `JwksFetchFailed` — HTTP 503 (servicio degradado; ver D1 fallback).
- `MissingTenantHeader` — HTTP 400 (endpoint requiere `X-Organization-Id` y no vino).
- `OrganizationNotFound` — HTTP 404 (el `orgId` del header no existe en `core.organization`; `Organization` es entidad top-level del sistema, no record de negocio per-tenant, por lo que un 404 veraz es correcto — la anti-leak policy no aplica acá).
- `NotAMember` — HTTP 403 (user válido, org válida y activa, pero no tiene row en `core.user_organization_role`). Anti-leak: el mensaje no distingue "no sos miembro" de "la org existe pero no te corresponde".
- `OrganizationInactive` — HTTP 403 (la org existe pero está `inactive`, ADR 0002 D1; a un non-superadmin no se le debe indicar si es miembro o no de una org inactive — se responde 403 uniforme).
- `ModuleNotEnabled` — HTTP 403 (`@ModuleEnabled('okr')` falla).
- `PermissionDenied` — HTTP 403 (el permission key requerido no está en `AuthContext.permissions`).

---

## Decisiones de diseño

### D1 — Auth0 integration mechanics: **`jwks-rsa` + `jsonwebtoken`**

**Decisión**: librería `jwks-rsa` para traer y cachear las claves públicas del JWKS endpoint de Auth0, y `jsonwebtoken` para verificar la firma y decodificar el JWT. **No** se usa `passport-jwt` ni el `@auth0/node-auth0` SDK.

**Justificación**:

- `jwks-rsa` + `jsonwebtoken` son dos librerías pequeñas, bien mantenidas, usadas en toda la industria para validación JWT con JWKS. Suman ~30 KB.
- `passport-jwt` requiere Passport, que es una capa de middleware pensada para múltiples strategies (session, JWT, OAuth). En un sistema stateless con un único método de auth (JWT), Passport agrega indirección sin ganancia.
- El `@auth0/node-auth0` SDK es para el **Management API** (crear users, gestionar roles en Auth0 dashboard), no para validación de JWTs en el borde de una API. No se usa.
- Los Nest-specific wrappers (`nest-keycloak-connect`, `@nestjs/passport`, etc.) esconden la complejidad pero también el control — queremos poder inspeccionar la validación y el cacheo en producción.

**JWKS caching policy**:

- TTL: **10 minutos** por key id (`kid`).
- Comportamiento ante rotación de keys: `jwks-rsa` hace lookup del `kid` en cache; si el `kid` no está, invalida el cache y refetcha. El JWT rechazado por `kid` desconocido dispara un refetch automático.
- Fallback stale-on-error: si el endpoint JWKS está caído, `jwks-rsa` configurado con `cache: true, rateLimit: true` devuelve la key cacheada aunque haya expirado (best-effort). Si la key no está en cache y el fetch falla, se responde HTTP 503 con `JwksFetchFailed` — el request no puede validarse.
- La cache es **en memoria por instancia**. En un despliegue multi-réplica, cada instancia cachea independiente. Coherente con MVP (baja escala); si se escala horizontalmente, el cache-miss inicial por instancia es tolerable.

**Validaciones obligatorias del JWT**:

- `iss` (issuer) === `process.env.AUTH0_ISSUER_BASE_URL` (p.ej. `https://gestion-publica.auth0.com/`).
- `aud` (audience) contiene `process.env.AUTH0_AUDIENCE` (p.ej. `https://api.gestion-publica.ar`).
- `exp` (expiration) > `NOW()`.
- `nbf` (not-before) opcional; si viene, `NOW()` >= `nbf`.
- `sub` (subject) presente y no vacío. Se mapea a `core.user.auth0_sub`.
- `email` presente y no vacío. Se mapea a `core.user.email`. Auth0 lo popula en JWTs de aplicaciones con el scope `email` solicitado en el login.

**Custom claims**: ninguno obligatorio. `auth` **no** consume claims de permisos ni de orgs desde el JWT. La resolución siempre pasa por DB (consistente con 0001/0002/0003 "claims drift policy"). Si en el futuro se decide optimizar con un claim namespaced `https://gestion-publica.ar/orgs` para pre-poblar `MeDto` sin DB roundtrip, se abre un ADR dedicado; **no se anticipa**.

**Variables de entorno**:

```
AUTH0_ISSUER_BASE_URL       # p.ej. https://gestion-publica.auth0.com/
AUTH0_AUDIENCE              # p.ej. https://api.gestion-publica.ar
AUTH0_JWKS_URI              # derivable de ISSUER; se permite override
AUTH0_CLIENT_ID             # para el frontend Next.js (no la API)
AUTH0_CLIENT_SECRET         # frontend Next.js (lado servidor)
AUTH0_SECRET                # @auth0/nextjs-auth0 session encryption secret
```

**No** se consume el Management API en MVP; `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET` quedan sin usarse.

**Mapeo de errores**:

| Caso | Código | Tipo de error |
|---|---|---|
| JWT ausente | 401 | `JwtMissing` |
| JWT malformado (no parsea) | 401 | `JwtMalformed` |
| JWT expirado | 401 | `JwtExpired` |
| Firma inválida | 401 | `JwtSignatureInvalid` |
| `iss` o `aud` incorrectos | 401 | `JwtIssuerInvalid` / `JwtAudienceInvalid` |
| Fetch de JWKS falla y no hay cache | 503 | `JwksFetchFailed` |
| Validación OK, user no existe en `core.user` | — | Se crea via `UserSyncService` (D5); no es error. |
| Validación OK, user sin orgs | — | No es error por sí solo; `TenantGuard` rechaza si el endpoint es tenant-scoped. `/me` responde 200. |

**Incertidumbre**: baja. `jwks-rsa` + `jsonwebtoken` es el path más directo y auditable.

### D2 — `AuthContext` shape canónico

**Decisión**: el tipo `AuthContext` tiene los siguientes campos, populados en dos pasos:

| Campo | Tipo | Poblado por | Observaciones |
|---|---|---|---|
| `userId` | `string` | `AuthGuard` | `core.user.id`, tras `UserSyncService.upsertFromJwt()`. |
| `auth0Sub` | `string` | `AuthGuard` | JWT `sub` claim. Para debugging y correlación con Auth0 dashboard. |
| `email` | `string` | `AuthGuard` | `core.user.email`, sincronizado en cada request. |
| `displayName` | `string` | `AuthGuard` | `core.user.display_name`, sincronizado. |
| `isSuperadmin` | `boolean` | `AuthGuard` | `core.user.is_superadmin`, leído en el upsert. |
| `organizationId` | `string \| null` | `TenantGuard` (si aplica) | `null` en endpoints `@SuperadminOnly` cross-tenant o si el endpoint no requiere tenant (`GET /me`, `GET /modules`). Seteado desde header `X-Organization-Id` tras validar membership. |
| `permissions` | `readonly string[]` | `TenantGuard` (si aplica) | Resuelto para `(userId, organizationId)`. `['*']` si `isSuperadmin`. Si no hay `organizationId`, `[]` (excepto superadmin). |
| `requestId` | `string` | `AuthGuard` | Copiado de `RequestContextStorage` (populada antes por el interceptor global, ADR 0003 D8). |

**Dónde vive el tipo**: `packages/shared-types/src/auth/auth-context.ts`. Consumido por `apps/api` (decoradores `@CurrentUser()` lo inyectan) y referenciado por `apps/web` para tipos auxiliares (p.ej. `PermissionKey`). El `AsyncLocalStorage` que lo transporta es `TenantContextStorage` y vive en `apps/api/src/modules/auth/context/`.

**Política de mutación post-populate**: `AuthContext` es **readonly** una vez que `TenantGuard` termina (para endpoints tenant-scoped). Los services consumidores no lo mutan; leen. Si un service necesita actuar sobre una org distinta (caso superadmin), recibe el `organizationId` por parámetro, no lo pisa en `AuthContext`.

**`permissions` como `readonly string[]`**: ergonómico para decoradores y helpers (`includes()` directo). El superadmin lleva `['*']` como **sentinel**; `hasPermission(ctx, 'okr:write')` devuelve true si `ctx.permissions.includes('*') || ctx.permissions.includes('okr:write')`. Ver D3 para justificación.

**Campos NO incluidos** (decisión deliberada):

- `roles: string[]` — descartado. El shape que 0001/0003 asumieron habla de `permissions[]`, no de `roles[]`. Los permisos son el control de autorización efectivo; los roles son un agrupamiento de seed. Si un endpoint quisiera gate-ar por "eres org-admin" en vez de por un permiso específico, el patrón correcto es crear un permiso para ese caso (p.ej. `core:org:admin-level`), no preguntar por el rol. Evita acoplamiento al modelo de agrupamiento.
- `jwt: string` (el token crudo) — no se pasa a los services. Acoplamiento innecesario.
- `scopes: string[]` — terminología Auth0; no se usa acá. Los "scopes" de Auth0 existen en el JWT pero `auth` los ignora (ver D1: permisos siempre por DB).

**Incertidumbre**: baja. El shape que 0003 asumió (`{ userId, organizationId, permissions[], isSuperadmin }`) queda extendido con identidad (`email`, `displayName`, `auth0Sub`) y con `requestId` de conveniencia. Ninguna adición rompe asunciones previas.

### D3 — Permission resolution

**Decisión**:

- **Query única por request** al poblar `AuthContext.permissions`. Corre dentro de `TenantGuard`, tras validar la membership.
- **Representación del superadmin con sentinel `'*'`**.
- **Cache per-request**: `AuthContext` dura toda la request y no se re-consulta; los decoradores `@Permissions(...)` leen de ahí.

#### Shape de la query (Prisma)

```ts
// Ilustrativo, no código ejecutable.
// Vive en apps/api/src/modules/auth/services/permission-resolver.service.ts.

async function resolvePermissions(
  userId: string,
  organizationId: string,
): Promise<readonly string[]> {
  const rows = await prismaRaw.userOrganizationRole.findMany({
    where: { userId, organizationId },
    select: {
      role: {
        select: {
          key: true,
          rolePermissions: {
            select: { permissionKey: true },
          },
        },
      },
    },
  });
  // En MVP: un único row (PK compuesta (userId, organizationId) en core, ADR 0002).
  const permissions = rows.flatMap(r =>
    r.role.rolePermissions.map(rp => rp.permissionKey)
  );
  return Object.freeze([...new Set(permissions)]);
}
```

Nota: se usa `prismaRaw` (el client **sin** la tenant extension) porque `core.user_organization_role` está bajo la extension (ADR 0002 D6), y acá el filtro por `(userId, organizationId)` es explícito. Alternativamente, se lee con el client scoped si `organizationId` coincide con el del `AuthContext`; ambas variantes son equivalentes en MVP.

#### Representación del superadmin: **sentinel `'*'`**

**Decisión**: si `AuthContext.isSuperadmin === true`, `AuthContext.permissions = ['*']` (exactamente un elemento, el sentinel).

**Alternativa A — Expandir al catálogo completo**: leer todas las rows de `auth.permission` y poner las 11 keys en el array.

- Pro: el helper `hasPermission(ctx, key)` es un simple `includes(key)` sin branch especial.
- Contra: acoplamiento — cada vez que un módulo nuevo introduce un permiso, el superadmin "lo gana" automáticamente solo si el permiso se seedea. Si alguien olvida agregarlo al seed, el superadmin no lo tiene. Fragilidad.
- Contra: si el catálogo crece a cientos de permisos, cada `AuthContext` del superadmin arrastra esa lista. Overhead marginal, pero feo.

**Alternativa B — `permissions: null` cuando `isSuperadmin`**: un `null` semánticamente significa "todos".

- Pro: visualmente claro.
- Contra: rompe el tipo `readonly string[]`; cada consumer tiene que distinguir `null` de `[]`. El `hasPermission` pasa a `perms === null || perms.includes(key)`. Peor que el sentinel porque introduce un segundo shape.

**Alternativa C (elegida) — Sentinel `'*'`**:

- Pro: el tipo sigue siendo `readonly string[]`. El helper `hasPermission(ctx, key) → ctx.permissions.includes('*') || ctx.permissions.includes(key)` es una sola línea.
- Pro: imposible olvidarse: el `AuthGuard` setea el sentinel si el user es superadmin, una vez en un lugar; el resto del sistema no necesita saber de superadmin en ningún otro punto de decisión de permisos.
- Pro: extensible a jerarquías futuras: `'okr:*'` podría significar "todos los permisos de OKR" si un día se necesita; el helper se extiende sin romper el shape.
- Contra: el sentinel es "magia" (una string con significado especial). Se mitiga nombrándolo como constante exportada: `export const ALL_PERMISSIONS = '*'`, y documentando en el tipo.

**Incertidumbre**: baja.

#### Helper `hasPermission`

```ts
// packages/shared-types/src/auth/permission-helpers.ts  (tipo-only; wrapper runtime en apps/api)
export const ALL_PERMISSIONS = '*' as const;

export function hasPermission(
  ctx: Pick<AuthContext, 'permissions'>,
  key: string,
): boolean {
  return ctx.permissions.includes(ALL_PERMISSIONS) || ctx.permissions.includes(key);
}
```

Consumido por:

- El decorator `@Permissions(...)` internamente (via un guard `PermissionsGuard` que evalúa contra `AuthContext`).
- El decorator compuesto `@AuditReadAccess()` de `audit` (ADR 0003 lo declaró solicitante de este helper).
- Cualquier lógica dentro de services que necesite ramificar por permiso (p.ej. `MeService` filtrando qué permisos exponer al frontend).

**No** es accesible desde `apps/web`: el frontend recibe `permissions[]` en `MeDto` y hace su propio `.includes('okr:write')`. El frontend nunca implementa lógica de autorización de backend; solo decide qué UI mostrar.

#### Edge cases

- **Usuario autenticado sin org (sin header `X-Organization-Id` y no es superadmin)**:
  - Endpoints tenant-scoped (`okr/*`, `core/orgs/:orgId/*`, `audit/*`): `TenantGuard` rechaza con 400 (`MissingTenantHeader`) o 403 (`NotAMember`).
  - Endpoints cross-tenant sin `@TenantGuard`: `GET /me`, `GET /modules`, `GET /roles` (superadmin). Estos no requieren `organizationId`; `AuthContext.organizationId = null`, `permissions = []` (no-superadmin) o `['*']` (superadmin).
  - `GET /me` es el endpoint de descubrimiento: siempre 200 si el JWT es válido.

- **Usuario con `X-Organization-Id` válido pero sin membership**:
  - `TenantGuard` consulta `core.user_organization_role` para `(userId, organizationId)`. Si no existe row y el user no es superadmin → 403 `NotAMember`.
  - Si el user es superadmin: bypass (consistente con 0002 D7).

- **Organización inactive**:
  - `TenantGuard` consulta `core.organization.status`. Si `inactive` y user no-superadmin → 403 `OrganizationInactive`.
  - Superadmin: bypass, salvo para el endpoint `POST /orgs/:id/activate` que precisamente necesita operar sobre orgs inactive (consistente con 0002 D1).

- **Refetch de permisos durante una request**: **no se hace**. El `AuthContext` se populó al inicio y dura toda la request. Consecuencia: si un admin cambia el rol de un user mientras ese user tiene una request en curso, la request actual usa los permisos viejos; la siguiente request usa los nuevos. Aceptable por diseño (política de drift declarada en 0001 "Auth0 → local RBAC mapping"). No hay revalidación dentro de una request.

### D4 — Guard chain order canónico

**Decisión**: el orden es

1. **`RequestContextInterceptor`** (global, owned by `audit`, ADR 0003 D8) — corre **antes** de cualquier guard; popula `RequestContextStorage.requestId`.
2. **`AuthGuard`** — registrado como `APP_GUARD` global. Valida JWT, invoca `UserSyncService`, popula `AuthContext` parcialmente (identidad + `isSuperadmin`).
3. **`TenantGuard`** — aplicado por controller o por módulo via `@UseGuards(TenantGuard)`. Lee `X-Organization-Id`, valida membership, popula `organizationId` + `permissions` en `AuthContext`.
4. **`ModuleEnabledGuard`** — aplicado con `@ModuleEnabled('okr')` (que internamente es `@UseGuards(ModuleEnabledGuard) + @SetMetadata('moduleKey', 'okr')`). Consulta `ModuleEnablementService.isEnabled(organizationId, moduleKey)` (de `core`). Superadmin bypass: **sí** (consistente con 0002 D6 "Superadmin bypass").
5. **`PermissionsGuard` / `SuperadminOnlyGuard`** — aplicados con `@Permissions('okr:write')` o `@SuperadminOnly()`. Evalúan contra `AuthContext`.

#### Mecanismo de enforcement en NestJS

NestJS ejecuta guards en este orden:

1. **Global guards** (via `APP_GUARD` provider o `app.useGlobalGuards()`) — antes de todos los demás.
2. **Controller-level guards** (via `@UseGuards(...)` en la clase del controller).
3. **Handler-level guards** (via `@UseGuards(...)` en el método).

Dentro de cada nivel, los guards corren en **el orden en que se declaran**.

**Elección**:

- `AuthGuard` se registra como **`APP_GUARD`** global en `AuthModule`. Todos los endpoints del sistema pasan por él. Los endpoints públicos (si alguna vez hubiera) se excluirían con un decorator `@Public()` que el `AuthGuard` respete (no hay endpoints públicos en MVP — el borde `(public)` de Next.js sigue requiriendo auth para leer datos de OKR; lo "público" es la UI del dashboard, no la API).
- `TenantGuard`, `ModuleEnabledGuard`, `PermissionsGuard`, `SuperadminOnlyGuard` se aplican **per-controller** o **per-handler** via `@UseGuards()` en el orden documentado.

**Ejemplo concreto** (controller OKR, consistente con ADR 0001):

```ts
// Ilustrativo, no código ejecutable.
@Controller('api/v1/okr/objectives')
@UseGuards(TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@ModuleEnabled('okr')
export class ObjectiveController {
  @Get()
  @Permissions('okr:read')
  list() { /* ... */ }

  @Post()
  @Permissions('okr:write')
  create() { /* ... */ }
}
```

Orden efectivo por request:

1. `RequestContextInterceptor` (global interceptor).
2. `AuthGuard` (`APP_GUARD`).
3. `TenantGuard` (controller-level, primer guard declarado).
4. `ModuleEnabledGuard` (controller-level, segundo).
5. `PermissionsGuard` (controller-level, tercero; lee `@Permissions` metadata del handler).

**Alternativa descartada — todos como `APP_GUARD`**: los guards globales corren para **todos** los endpoints. `TenantGuard` aplicado globalmente rompería `/me`, `/modules`, `/roles`, `/permissions`, los endpoints `@SuperadminOnly` cross-tenant, etc. Se necesitaría un decorator `@SkipTenant()` que el guard respete — agrega complejidad y opt-out default. Se prefiere el modelo aditivo: un `AuthGuard` global (ya que absolutamente todo requiere auth en MVP), y los demás opt-in por controller.

**Alternativa descartada — `@UseGuards()` encadenado en cada handler individualmente**: hace el código del controller ruidoso. `@UseGuards()` a nivel controller + decoradores (`@Permissions`, `@ModuleEnabled`, `@SuperadminOnly`) a nivel handler es el split ergonómico.

#### Decorador `@SuperadminOnly()`

Implementado como un atajo que aplica un guard específico:

```ts
// Ilustrativo
export const SuperadminOnly = () => applyDecorators(
  UseGuards(SuperadminOnlyGuard),
);
```

El `SuperadminOnlyGuard` lee `AuthContext.isSuperadmin` y rechaza con 403 si `false`. Puede convivir con `@Permissions(...)` (en cuyo caso ambos deben pasar — AND); típicamente los endpoints que usan `@SuperadminOnly()` no tienen `@Permissions(...)` porque el superadmin tiene `'*'`.

#### Decorador compuesto `@AuditReadAccess()` (ADR 0003)

ADR 0003 introdujo este decorator como un OR (`superadmin OR hasPermission('audit:read')`). Se implementa así:

```ts
// Ilustrativo, vive en apps/api/src/modules/audit/decorators/audit-read-access.decorator.ts
export const AuditReadAccess = () => applyDecorators(
  UseGuards(AuditReadAccessGuard),
);

class AuditReadAccessGuard {
  canActivate(ctx: ExecutionContext): boolean {
    const authContext = getAuthContext(ctx);
    return authContext.isSuperadmin || hasPermission(authContext, 'audit:read');
  }
}
```

`auth` **expone** el helper `hasPermission` y el acceso al `AuthContext` (via `TenantContextStorage.get()`) que `audit` consume para implementar `AuditReadAccessGuard`. `auth` no conoce de `audit`; el guard vive en `audit`.

**Incertidumbre**: baja. El patrón de guards en cascada es estándar en Nest.

### D5 — `UserSyncService` invocation

**Decisión**: `AuthGuard` invoca `UserSyncService.upsertFromJwt(jwtPayload)` **después** de validar la firma del JWT y **antes** de resolver permisos. El servicio `UserSyncService` vive en `core` (declarado en ADR 0002 "Módulo core — forma interna"); `auth` solo lo consume via `core/index.ts` (que debe exportarlo — ver §11 amendments).

**Secuencia dentro de `AuthGuard.canActivate()`**:

```
1. Extraer JWT del header Authorization: Bearer <token>.
2. Validar firma (via jwks-rsa + jsonwebtoken). Si falla → 401.
3. Invocar UserSyncService.upsertFromJwt(payload):
   a. Upsert en core.user por auth0_sub (unique). 
      - Si no existe: crea row con { auth0_sub, email, displayName, lastSeenAt: NOW() }.
          emite audit event `user.created` (ADR 0002 tabla de eventos; actor_id 
          es el propio user.id recién creado, organization_id = null).
      - Si existe y email/displayName cambiaron: update.
          emite `user.updated`.
      - Si existe y no cambió nada: update de lastSeenAt SIN emitir audit.
            (lastSeenAt cambia en cada request — auditarlo sería ruido).
   b. Check bootstrap superadmin: si NO existe ningún core.user con 
      is_superadmin=true Y el email del JWT === CORE_BOOTSTRAP_SUPERADMIN_EMAIL:
        - Update is_superadmin=true en el user recién upserted.
        - Emite audit event `user.superadmin_granted` con diff.reason='bootstrap'.
   c. Devuelve el core.user completo.
4. Poblar AuthContext parcialmente: userId, auth0Sub, email, displayName, isSuperadmin.
5. Copiar requestId desde RequestContextStorage a AuthContext (conveniencia).
6. TenantContextStorage.run(authContext, () => next.handle()).
```

**Qué NO hace `UserSyncService`**:

- **No infiere orgs desde Auth0 claims**. La membership vive en `core.user_organization_role`, y se consulta en `TenantGuard` (para un endpoint tenant-scoped) o en `MeService.getMe` (para `/me`).
- **No popula `AuthContext.organizationId`**. Ese campo queda `null` tras `AuthGuard`; lo setea `TenantGuard` si aplica.
- **No resuelve permisos**. Eso es responsabilidad de `TenantGuard` (via `PermissionResolverService`).

**Ownership recíproca**:

- La **clase** `UserSyncService` vive en `core` (owns la lógica de upsert + bootstrap).
- El **hook de invocación** vive en `auth` (owns el `AuthGuard`).
- `core/index.ts` debe exportar `UserSyncService` para que `AuthGuard` pueda inyectarlo. Ajuste pendiente — ver §11.

**Emisión de audit events**: los events `user.created`, `user.updated`, `user.superadmin_granted` se emiten desde `UserSyncService` via `AuditEventEmitter.emit(event)` (ADR 0003 D1). Corren dentro de la misma transacción del upsert; el wrapper `PrismaService.runInTransaction` debe envolver el upsert. `AuthGuard` invoca `userSyncService.upsertFromJwt(...)` que internamente wrap con `runInTransaction`.

**Edge case — falla de `UserSyncService`**:

- Si el upsert falla (p.ej. violación de unique de `email` por un `auth0_sub` distinto), la transacción rollback. El `AuthGuard` propaga el error y devuelve 500 al cliente. No es tolerable seguir con identidad en estado inconsistente.
- Si el audit event emit falla (ADR 0003 D7: no se atrapa), misma consecuencia.

**Performance**: `UserSyncService` se invoca en **cada request**. Overhead:

- Hot path: una consulta indexed por `auth0_sub` + un update de `lastSeenAt` + nada más (no hay emisión de audit event ni cambio de email/displayName).
- 1-2 ms por request en MVP. Aceptable.

Si la escala lo demanda, se puede agregar un cache de "user ya sincronizado en los últimos N segundos" con TTL corto. **No se anticipa**.

**Incertidumbre**: baja.

### D6 — `packages/prisma-tenant-extension` — implementation plan

**Decisión**: el paquete `packages/prisma-tenant-extension` (ubicación declarada en ADR 0001 "Module boundaries") se diseña con esta forma:

```
packages/prisma-tenant-extension/
├── src/
│   ├── index.ts                    # export tenantExtension, MissingTenantContextError
│   ├── extension.ts                # implementación de Prisma.defineExtension
│   ├── tenant-scoped-models.ts     # set de modelos scoped (declarativo)
│   ├── errors.ts                   # MissingTenantContextError, SuperadminBypassContextError
│   └── types.ts                    # TenantContextProvider type, OperationContext
├── test/
│   ├── extension.test.ts           # unit con mock PrismaClient
│   ├── als-concurrency.test.ts     # tests de interleaving con ALS.run()
│   └── integration/
│       └── tenant-isolation.test.ts  # testcontainers Postgres
├── package.json
└── README.md                       # NO creado — docs viven acá en este ADR
```

**Dependencias**:

- Runtime: ninguna. `@prisma/client` es `peerDependency`.
- Dev: `@prisma/client`, `vitest`, `testcontainers`.

#### Función exportada

```ts
// packages/prisma-tenant-extension/src/index.ts

import { Prisma } from '@prisma/client';
import { MissingTenantContextError } from './errors';
import { TENANT_SCOPED_MODELS } from './tenant-scoped-models';

export interface TenantContextProvider {
  getOrganizationId(): string | null;
  isSuperadmin(): boolean;
}

export function tenantExtension(provider: TenantContextProvider) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);
          if (provider.isSuperadmin()) return query(args); // bypass

          const orgId = provider.getOrganizationId();
          if (!orgId) throw new MissingTenantContextError(model, operation);

          // Inyección de organizationId según operación — idéntico al diseño 0001.
          // (Ver ADR 0001 "Tenant scoping" para la tabla exacta por operación.)
          // ...
          return query(args);
        },
      },
    },
  });
}

export { MissingTenantContextError };
export { TENANT_SCOPED_MODELS };
```

**Clave del diseño**: el `TenantContextProvider` es una **interfaz con dos métodos**, no un simple `getOrgId: () => string | null`. Razones:

- **Lazy por query**: cada invocación de `getOrganizationId()` y `isSuperadmin()` lee la ALS al momento de la query (no al momento de construir el extension). Esto es crítico: la extension se instancia **una vez** en el constructor de `PrismaService`, pero se usa en cientos de queries con ALS distintas.
- **Dos métodos separados**: `isSuperadmin()` permite bypass completo sin leer `organizationId` (optimización menor; también soporta "superadmin sin org activa" que llama `create`).

**Instanciación en `PrismaService`** (vive en `auth`):

```ts
// apps/api/src/modules/auth/prisma/prisma.service.ts
// Ilustrativo.

@Injectable()
export class PrismaService implements OnModuleInit {
  private _raw!: PrismaClient;
  private _scoped!: ReturnType<typeof tenantExtension> extends infer E 
    ? (E extends ReturnType<PrismaClient['$extends']> ? E : never)
    : never;

  async onModuleInit() {
    this._raw = new PrismaClient();
    this._scoped = this._raw.$extends(tenantExtension({
      getOrganizationId: () => tenantContextStorage.get()?.organizationId ?? null,
      isSuperadmin:       () => tenantContextStorage.get()?.isSuperadmin ?? false,
    }));
    await this._raw.$connect();
  }

  get scoped() { return this._scoped; }   // default. Usado por repositories de modulos de negocio.
  get raw()    { return this._raw; }      // sin extension. Uso restringido; ver debajo.

  async runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    // ADR 0003 D1. Usa this._scoped para que la tx herede la extension.
    return this._scoped.$transaction(async (tx) => {
      return transactionContextStorage.run(tx, () => fn(tx));
    });
  }
}
```

**API del `PrismaService`**:

- `prisma.scoped` — default. **El 95% de los services lo usa**. Lleva la tenant extension; respeta superadmin bypass automáticamente.
- `prisma.raw` — **restringido**. Solo se usa en:
  - `MeService.getMe()` (ADR 0002 D6): lista membresías cross-tenant del user autenticado.
  - `OrganizationService` métodos superadmin (`GET /orgs`, `POST /orgs`): operan sobre `core.organization` (fuera del set) y pueden tocar modelos scoped con `organizationId` explícito.
  - `PermissionResolverService.resolvePermissions()` (ver D3): lee `core.user_organization_role` con `(userId, organizationId)` explícito; conceptualmente es "meta-query" antes del scoping.

**Naming `scoped` vs `raw`**:

- **Elegido**: `scoped` (default, con la extension) y `raw` (sin).
- Alternativa considerada: `prisma` (default) y `prismaUnscoped`. Rechazado porque `prisma` como nombre es ambiguo (¿el client base o el extendido?); `scoped` es explícito.
- Alternativa considerada: `tenantScoped` y `global`. `tenantScoped` es verboso; `scoped` alcanza dado el contexto.

#### Qué modelos están bajo la extension

**Set consolidado** (union de lo declarado en 0001, 0002, 0003):

```ts
// packages/prisma-tenant-extension/src/tenant-scoped-models.ts
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  // Schema okr (ADR 0001):
  'Objective',
  'KeyResult',
  'Task',
  // Schema core (ADR 0002 D6):
  'Period',
  'UserOrganizationRole',
  'OrganizationModule',
  // Schema audit: NO incluido (ADR 0003 "Module boundaries" — organization_id NULLABLE).
  // Schema auth: NO incluido — Role, Permission, RolePermission son catálogo global.
]);
```

**Declarativo, no auto-detectado por DMMF**. Alternativa descartada: usar `Prisma.dmmf` en runtime para detectar qué modelos tienen columna `organization_id` y scoped-arlos automáticamente. Rechazada porque:

- Algunos modelos tienen `organization_id` **NULLABLE** por diseño (p.ej. `audit.event`), y el set detecta mal.
- La decisión de "scopearlo o no" es semántica, no sintáctica. Mejor explícita.

Cuando un módulo futuro agregue un modelo con `organization_id`, debe editar `TENANT_SCOPED_MODELS` explícitamente. Ajuste trivial en cada ADR nuevo.

#### Error de denegación

`MissingTenantContextError` — lanzado cuando:

- Modelo está en `TENANT_SCOPED_MODELS`.
- `isSuperadmin()` === `false`.
- `getOrganizationId()` === `null`.

Semántica: **bug de wiring, no de input**. El `TenantGuard` debería haber rechazado la request antes. Si llegamos al repository sin `organizationId`, es porque el controller olvidó `@UseGuards(TenantGuard)` o porque el caller invocó un service desde un contexto no-HTTP (p.ej. un test mal configurado). Por eso el error mapea a **HTTP 500**, no 4xx.

Naming: **`MissingTenantContextError`**. ADR 0001 line 462 y 766 ya lo menciona con este nombre. La brief pedía `NoTenantContextError` — se elige mantener `MissingTenantContextError` para preservar continuidad con 0001. La intención es clara: falta contexto de tenant. Si el brief prefiere otro nombre, es renombre local de impacto nulo.

**Consistencia con `NoActiveTransactionError`** (ADR 0003 D1, D10): el naming family es `<Problem>Error`. `NoActiveTransactionError` es el hermano para la ALS de transacción. Se documenta el registry de errores de ALS:

| Error | Causa | ALS afectada | HTTP mapping |
|---|---|---|---|
| `MissingTenantContextError` | Query sobre modelo scoped sin org en contexto (no-superadmin). | `TenantContextStorage` | 500 |
| `NoActiveTransactionError` | Emit de audit fuera de transacción. | `TransactionContextStorage` | 500 |
| `MissingRequestContextError` | Emit de audit sin request context. | `RequestContextStorage` | 500 |
| `MissingActorError` | Emit de audit sin user en AuthContext. | `TenantContextStorage` (subfase) | 500 |

Todos son bugs de wiring. Todos devuelven 500. La consistencia del sufijo `Error` es deliberada.

#### Test strategy

**Unit tests** (`packages/prisma-tenant-extension/test/extension.test.ts`):

- Mock `PrismaClient`; verificar que la extension:
  - Inyecta `organizationId` en `findMany` sobre un modelo scoped.
  - Inyecta `organizationId` en `create` (sobre `data`).
  - Inyecta `organizationId` en `update`/`delete`/`updateMany`/`deleteMany` (sobre `where`).
  - **No** toca modelos no-scoped (`Organization`, `User`, `Module`).
  - Bypassa cuando `isSuperadmin()` === `true`.
  - Lanza `MissingTenantContextError` cuando `getOrganizationId()` === `null` y no-superadmin.

**Concurrency tests** (`packages/prisma-tenant-extension/test/als-concurrency.test.ts`):

- Invocar `ALS.run({ orgId: 'A' }, async () => { await query(); })` y `ALS.run({ orgId: 'B' }, async () => { await query(); })` **interleavedly** (p.ej. con `Promise.all` y `setTimeout(0)` insertados).
- Verificar que cada query ve el `organizationId` correcto de su propia `ALS.run()`. **La propiedad clave** es que la extension lee la ALS de forma lazy por query, no eager al instanciar. Si el test pasa, el diseño es correcto para multi-request concurrency.
- Caso borde: una transacción que corre con `orgId='A'` no puede ser "hijackeada" por otra ALS con `orgId='B'` porque Prisma ejecuta cada call al tx client en el mismo frame del `tx => {}` body (mismo microtask si es secuencial). Los tests cubren los patterns `Promise.all` y `for await` dentro de un `runInTransaction`.

**Integration tests** (`packages/prisma-tenant-extension/test/integration/tenant-isolation.test.ts`):

- Testcontainers Postgres con el schema real.
- Crear 2 orgs (A, B), cada una con un Objective.
- Request autenticada de user con acceso solo a A: `prismaService.scoped.objective.findMany()` devuelve solo A.
- Mismo `findMany` en ALS con orgId=B: devuelve solo B.
- Superadmin: `findMany` sin filtro ALS devuelve A y B.
- **Anti-leak**: `prismaService.scoped.objective.findUnique({ where: { id: <id of B> } })` cuando ALS está seteada a orgId=A devuelve `null` (la extension agrega `AND organizationId='A'` al where).

**Incertidumbre**: media. El patron de Prisma extensions es estable pero pocas codebases lo usan a escala. Los tests de ALS concurrency son el seguro de calidad.

### D7 — Catálogo consolidado de permisos y roles

**Decisión**: el catálogo final, consolidando 0001 + 0002 + 0003, es:

#### Permisos (`auth.permission`)

| Permission key | Declarado en | Descripción |
|---|---|---|
| `okr:read` | 0001 | Lectura de Objetivos, KRs, Tareas, árbol de cascada. |
| `okr:write` | 0001 | Crear/editar/soft-delete Objetivos, KRs, Tareas; rebalance de pesos. |
| `okr:progress:write` | 0001 | Carga de avance en Tareas. |
| `okr:admin` | 0001 | Reservado (sin endpoints atados en MVP; para operaciones sensibles futuras). |
| `core:org:manage` | 0002 | Crear/editar/activar/desactivar organizaciones. MVP: solo superadmin lo usa. |
| `core:period:manage` | 0002 | Crear, editar (`future`), abrir y cerrar Periods. |
| `core:member:manage` | 0002 | Asignar/cambiar/quitar roles de usuarios en la org. |
| `core:module:manage` | 0002 | Habilitar/deshabilitar módulos. MVP: solo superadmin lo usa. |
| `core:user:read` | 0002 | Leer datos de usuarios (scoped a la org para org-admin; global para superadmin). |
| `audit:read` | 0003 | Leer eventos de la org corriente del caller. |
| `audit:read:all` | 0003 | Leer eventos cross-tenant, incluido `organization_id IS NULL`. |

#### Roles (`auth.role`)

| Role key | Tipo | Descripción |
|---|---|---|
| `org-reader` | Asignable | Solo lectura de OKR. |
| `org-user` | Asignable | Lectura de OKR + carga de avance en Tareas. |
| `org-admin` | Asignable | Operación completa sobre la org (OKR, periods, membresías, audit read). |
| `external-auditor` | **Declarado, NO asignado en MVP** | Reservado para un auditor externo con `audit:read:all` sin `is_superadmin`. Se seedea la row en `auth.role` pero sin entradas en `auth.role_permission` → permisos `[]` en MVP; un ADR futuro llenará la matriz. *Decisión alternativa válida: no seedear el rol en absoluto hasta que se use. Se prefiere seedear para tener el `key` reservado y que `role_permission` asignments futuros sean un ALTER mínimo.* |

**Superadmin es NO un rol — es un flag (`core.user.is_superadmin`)**. Reafirmado desde 0002 D7. El superadmin:

- No está en `auth.role`.
- No tiene entradas en `auth.user_organization_role` atadas a un rol especial.
- `AuthGuard` lee `is_superadmin` del upsert y setea `AuthContext.isSuperadmin=true`.
- `PermissionResolver` retorna `['*']` para superadmins sin hacer queries a `auth.*`.

#### Matriz rol → permisos (MVP seed)

| Role \ Permission | `okr:read` | `okr:write` | `okr:progress:write` | `okr:admin` | `core:org:manage` | `core:period:manage` | `core:member:manage` | `core:module:manage` | `core:user:read` | `audit:read` | `audit:read:all` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `org-reader` | Yes | — | — | — | — | — | — | — | — | — | — |
| `org-user` | Yes | — | Yes | — | — | — | — | — | — | — | — |
| `org-admin` | Yes | Yes | Yes | — | — | Yes | Yes | — | Yes | Yes | — |
| `external-auditor` *(reservado)* | — | — | — | — | — | — | — | — | — | — | — |
| *Superadmin (flag, no rol)* | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` | via `'*'` |

**Notas sobre la matriz**:

- `core:org:manage` no se asigna a ningún rol MVP — el permiso existe en el catálogo pero solo el superadmin lo ejerce (via sentinel `'*'`). Los endpoints `/api/v1/orgs/*` van gated con `@SuperadminOnly()` (no con `@Permissions('core:org:manage')`). Decisión ADR 0002 D5. El permiso queda disponible para refinamiento futuro (p.ej. un rol "org-owner" que pueda renombrar su propia org sin ser superadmin).
- `core:module:manage` idéntico al anterior: reservado a superadmin en MVP.
- `okr:admin` no tiene endpoints atados en MVP (reservado en 0001).
- `audit:read:all` no se asigna a `org-admin` (ADR 0003 D6): ese rol obtiene solo eventos scoped a su org. `audit:read:all` queda para `external-auditor` o superadmin.

#### Seed SQL (shape idempotente)

> Ilustrativo, no migración ejecutable. El seed vive en `apps/api/prisma/seed/auth.seed.ts` (o en una migración de datos dedicada).

```sql
-- Permisos
INSERT INTO auth.permission (key, description) VALUES
  ('okr:read',              'Read OKR entities (objectives, key results, tasks).'),
  ('okr:write',             'Create, edit, soft-delete OKR entities; rebalance weights.'),
  ('okr:progress:write',    'Set task progress (avance).'),
  ('okr:admin',             'Reserved for future sensitive OKR operations.'),
  ('core:org:manage',       'Create/edit/activate/deactivate organizations.'),
  ('core:period:manage',    'Manage periods (create, open, close).'),
  ('core:member:manage',    'Assign, change, remove user roles within an organization.'),
  ('core:module:manage',    'Enable/disable modules for an organization.'),
  ('core:user:read',        'Read user data.'),
  ('audit:read',            'Read audit events scoped to the caller current organization.'),
  ('audit:read:all',        'Read all audit events cross-tenant, including NULL organization_id.')
ON CONFLICT (key) DO NOTHING;

-- Roles
INSERT INTO auth.role (id, key, name, description) VALUES
  -- los IDs son cuids pre-generados fijos para idempotencia cross-env;
  -- alternativa: seed sin IDs pre-generados y lookup por key. El último enfoque es más portable.
  (gen_cuid(), 'org-reader',       'Organization Reader',   'Read-only access to OKR.'),
  (gen_cuid(), 'org-user',         'Organization User',     'Read OKR + upload task progress.'),
  (gen_cuid(), 'org-admin',        'Organization Admin',    'Full organization operations (OKR, periods, members, audit).'),
  (gen_cuid(), 'external-auditor', 'External Auditor',      'Reserved for future cross-tenant audit access.')
ON CONFLICT (key) DO NOTHING;

-- Role → Permission assignments (MVP)
-- org-reader
INSERT INTO auth.role_permission (role_id, permission_key)
  SELECT r.id, 'okr:read' FROM auth.role r WHERE r.key = 'org-reader'
  ON CONFLICT DO NOTHING;

-- org-user
INSERT INTO auth.role_permission (role_id, permission_key)
  SELECT r.id, p FROM auth.role r,
    (VALUES ('okr:read'), ('okr:progress:write')) AS v(p)
    WHERE r.key = 'org-user'
  ON CONFLICT DO NOTHING;

-- org-admin
INSERT INTO auth.role_permission (role_id, permission_key)
  SELECT r.id, p FROM auth.role r,
    (VALUES
      ('okr:read'),
      ('okr:write'),
      ('okr:progress:write'),
      ('core:period:manage'),
      ('core:member:manage'),
      ('core:user:read'),
      ('audit:read')
    ) AS v(p)
    WHERE r.key = 'org-admin'
  ON CONFLICT DO NOTHING;

-- external-auditor: NO permissions assigned in MVP. Reserved.
```

`ON CONFLICT DO NOTHING` en todas las INSERTs hace el seed idempotente: correr 1, 2, o N veces produce el mismo estado final. Operacionalmente, el seed corre en cada deploy como parte de las migraciones.

**Alternativa descartada — IDs pre-generados hardcoded para `auth.role`**: haría los seeds identicos cross-env pero compromete la capacidad de `POST /roles` (si se agregara) de generar cuids nuevos. Se prefiere generar en seed y lookup por `key` donde sea relevante.

#### Cross-check contra 0001/0002/0003

- 0001 tabla de permisos (`okr:*`): **cubierto**, matriz idéntica excepto que 0001 menciona un rol ficticio `org-superadmin` que tendría `okr:admin`. Ese rol **no existe** en este ADR (el superadmin es flag). `okr:admin` se mantiene en catálogo, sin asignar a ningún rol — coherente con 0001 "Reservado. Actualmente sin endpoints atados."
- 0002 tabla de permisos (`core:*`): **cubierto**. `core:org:manage` y `core:module:manage` quedan sin asignar a roles (solo superadmin) — consistente con 0002 D5.
- 0003 permisos (`audit:*`): **cubierto**. `audit:read` asignado a `org-admin`; `audit:read:all` sin asignación; superadmin cubre todo via `'*'`.

**Ningún permiso prometido quedó sin matriz.** Ningún spelling difiere entre ADRs:
- `core:org:manage` (0002, este ADR): **consistente**.
- `core:period:manage` (0002, este ADR): **consistente**.
- `core:member:manage` (0002, este ADR): **consistente**.
- `core:module:manage` (0002, este ADR): **consistente**.
- `core:user:read` (0002, este ADR): **consistente**.
- `audit:read` y `audit:read:all` (0003, este ADR): **consistente**.

**Incertidumbre**: baja.

### D8 — Admin endpoints for `auth` module

**Decisión**: solo read-only en MVP (ver tabla de endpoints arriba).

- `GET /api/v1/roles` → `@SuperadminOnly`. Listar roles del sistema es una operación cross-tenant (los roles son seed globales, no per-org en MVP).
- `GET /api/v1/roles/:key` → `@SuperadminOnly`.
- `GET /api/v1/roles/:key/permissions` → `@SuperadminOnly`.
- `GET /api/v1/permissions` → `@SuperadminOnly`.
- `GET /api/v1/permissions/:key` → `@SuperadminOnly`.

**Quién los usa**: el backoffice superadmin para debugging y auditoría interna ("¿qué permisos tiene el rol `org-admin` exactamente?"). No hay UI de gestión en MVP.

**Alternativa descartada — permitir a `org-admin` ver roles**: el org-admin ya ve los roles via `GET /orgs/:orgId/members` (ADR 0002 "Members"), que devuelve el rol de cada miembro en su org. No necesita el catálogo global; el catálogo global es más infra que operación.

**Alternativa descartada — mutations (`POST /roles`, `PATCH /roles/:key`, `POST /roles/:key/permissions`)**: fuera de MVP (decisión de diseño). Razones:

- El catálogo cerrado de 4 roles y 11 permisos cubre el espacio funcional de MVP.
- Permitir mutations abre preguntas: ¿puede un superadmin borrar `okr:read`? Si sí, ¿qué pasa con los decoradores en código que lo requieren? La respuesta correcta ("el sistema se rompe en runtime") es inaceptable.
- La solución de "roles custom per-org" es un submodelo entero. Un ADR dedicado se abrirá si aparece la demanda.

**Cuando aparezcan mutations**:
- `POST /api/v1/roles` con `@SuperadminOnly` (gated por un concepto de "roles system" vs "roles custom").
- Eventos de audit: `role.created`, `role.updated`, `role.deleted`, `role_permission.assigned`, `role_permission.revoked`.
- Validación: no se puede eliminar un permiso declarado como "required by module X" — requiere un registry de dependencias. Fuera de alcance.

**Incertidumbre**: baja.

### D9 — Frontend token flow

**Decisión**: `@auth0/nextjs-auth0` v3+ con session cookie para el frontend Next.js. `X-Organization-Id` se transporta en una **cookie httpOnly** (no localStorage).

#### SDK choice: `@auth0/nextjs-auth0`

**Justificación**:

- Soporte first-class de App Router (`v3+` introdujo `@auth0/nextjs-auth0/edge`, handlers compatibles con Route Handlers).
- Encapsula login / callback / logout / session encryption sin que cada dev tenga que implementar PKCE desde cero.
- Tipado TS sólido.
- Mantenido por Auth0 directamente.

**Alternativa descartada — NextAuth.js**: soporta Auth0 como provider genérico OIDC. Menos integrado con features Auth0 específicas (Rules, post-login actions, Management API). Preferimos SDK nativo.

**Alternativa descartada — implementación custom (solo JWT en memoria + refresh flow manual)**: mucho código de borde. Innecesario dado que el SDK oficial existe.

#### Login flow

```
1. Usuario visita /api/auth/login (handler del SDK).
2. Redirect a Auth0 Universal Login.
3. Usuario autentica; Auth0 redirige a /api/auth/callback con code.
4. El handler intercambia code por access_token + id_token + refresh_token.
5. Crea session cookie (encriptada con AUTH0_SECRET, httpOnly, Secure, SameSite=Lax).
6. Redirect al origin solicitado (ej. /admin).
```

#### Server components y Server Actions

- **Server Components** leen la sesión via `getSession()` del SDK. Tienen acceso al `accessToken` para adjuntar `Authorization: Bearer` en fetchs server-side a la API Nest.
- **Client Components** usan el hook `useUser()` del SDK para identidad básica (email, name); **no** acceden al token directamente — todas las mutaciones pasan por Server Actions que leen la sesión en el server.
- **Server Actions** construyen el fetch con `Authorization: Bearer <accessToken>` + `X-Organization-Id: <orgId>` (leído de la cookie `orgId` — ver abajo). Un helper `apiFetch(path, init)` centraliza ambos headers.

#### Token refresh

- El SDK maneja silent refresh cuando el `accessToken` está por expirar. Si el `refreshToken` ya no es válido (revocado, expirado), el siguiente `apiFetch` recibe 401, el SDK invalida la sesión, redirect a `/api/auth/login`.
- El cliente no ve la refresh dance; solo ve 401 si falla todo.

#### `X-Organization-Id`: cookie httpOnly

**Decisión**: cookie httpOnly.

- Nombre: `gp_active_org`.
- Atributos: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=30*86400` (30 días).
- Valor: el `organization.id` (cuid) de la org activa seleccionada por el usuario.

**Justificación del trade-off cookie vs localStorage**:

| Criterio | Cookie httpOnly | localStorage |
|---|---|---|
| Automáticamente enviada en fetch a la API misma origin | Sí | No (hay que leerla y adjuntar manualmente) |
| Exposición a XSS | **Baja** (httpOnly bloquea JS de leerla) | **Alta** (JS la lee trivialmente) |
| Exposición a CSRF | **Sí, mitigable** (SameSite=Lax + tokens CSRF en state-changing routes) | **No** (el atacante no puede leer el valor para adjuntarlo) |
| Requiere JS para setearla | No (desde Server Action con `cookies().set()`) | Sí |
| Persistencia entre tabs | Sí | Sí |

**Análisis**:

- **XSS** es el vector más probable en una app React con dependencias externas. Un payload XSS en localStorage puede exfiltrar el `orgId` + el access token (si también está ahí) a un atacante. Cookie httpOnly cierra esa puerta para el `orgId`.
- **CSRF** es mitigable con `SameSite=Lax` (bloquea cross-origin top-level navigations que no sean GET) + tokens CSRF en requests state-changing. Next.js App Router + Server Actions tienen mitigación CSRF built-in via encrypted action ids.
- **API misma origin**: la API Nest y el frontend Next.js corren bajo el mismo dominio (p.ej. `gestion-publica.ar` y `api.gestion-publica.ar` — o mismo origin con path-based routing). Si son **misma origin**, la cookie se envía automáticamente. Si son **sub-origins**, se configura `Domain=gestion-publica.ar` en la cookie. En MVP se asume misma origin.

**Elegido: cookie httpOnly**. Trade-off: hay que agregar Server Action para cambiar de org (no es solo un `setItem` en cliente), pero el ganado en seguridad justifica.

**Flujo de selección de org**:

1. Al login (o al cargar el dashboard), si `gp_active_org` no está seteada, el frontend hace `GET /api/v1/me`, obtiene `orgs[]`, y:
   - Si `orgs.length === 1`: auto-setea `gp_active_org = orgs[0].id` via Server Action (setCookie).
   - Si `orgs.length > 1`: muestra selector; al elegir, Server Action setea la cookie.
   - Si `orgs.length === 0`: redirige a `/no-org-access` (UX informativa).
2. El `apiFetch` helper siempre adjunta `X-Organization-Id: <valor de cookie>` (si existe).

**Cambio de org**: Server Action `setActiveOrg(orgId)` valida que el user tenga membership (via `/me` response previo o via un nuevo fetch) y reescribe la cookie. El frontend refresca el estado.

#### Logout

Handler `/api/auth/logout` del SDK limpia la session cookie + redirige a Auth0 logout endpoint. El frontend también limpia `gp_active_org` explícitamente (Server Action en el logout handler).

**Incertidumbre**: media. La decisión cookie vs localStorage es opinión informada; ambas son defendibles. Se documenta el razonamiento para que futuros ADRs puedan revisar si aparecen requisitos de seguridad más estrictos (p.ej. CSP sin `unsafe-inline` forzando otro modelo).

### D10 — Rate limiting

**Decisión**: `@nestjs/throttler` con defaults MVP.

- **Default global**: 100 requests por minuto por bucket.
- **Bucket key**:
  - Si `AuthContext` disponible: `auth0Sub` (identidad estable por usuario).
  - Si no (endpoints pre-auth, health checks, 401 tracking): **IP remota**.
- **Registro**: `APP_GUARD` provider, **antes** del resto de guards (`AuthGuard` incluido). Razón: rechazar burst de un atacante no autenticado sin gastar CPU en validar JWT.
- **Excepciones**: endpoints de health check (`/health`, `/ready`) quedan excluidos via `@SkipThrottle()`.

**Tunning diferido** a un ADR operacional cuando haya métricas reales. Las decisiones puntuales (diferentes buckets por endpoint, rate por permiso, fair-use para admins) se difieren.

**Alternativa descartada — limitación por IP solamente**: NAT agrupa a muchos usuarios bajo una IP (redes corporativas compartidas). Limitar por IP bloquearía usuarios legítimos. Por eso se bucketiza por `auth0Sub` cuando hay auth.

**Incertidumbre**: baja.

### D11 — Ajustes sobre ADRs previos (resumido; detalle en §11)

Ninguna amendment material; ajustes textuales menores de exportación y clarificación de firma. Ver §11.

---

## Module boundaries

### El módulo `auth` es dueño de

- Schema Postgres `auth` y tablas `auth.role`, `auth.permission`, `auth.role_permission`.
- Seeds de roles y permisos (D7).
- `AuthGuard`, `TenantGuard`, `ModuleEnabledGuard`, `PermissionsGuard`, `SuperadminOnlyGuard`.
- Decoradores `@Permissions(...)`, `@CurrentUser()`, `@SuperadminOnly()`, `@ModuleEnabled(...)`.
- Tipo `AuthContext` (shape D2).
- `TenantContextStorage` (AsyncLocalStorage) — ownership canónica acá.
- Helper `hasPermission(ctx, key)`.
- `PrismaService` con `.scoped` y `.raw` (D6). **Nota**: `PrismaService.runInTransaction` es owned by `audit` (ADR 0003 D1); `auth` provee la instancia base de `PrismaService`, `audit` extiende con el wrapper transaccional. Alternativa considerada: que `PrismaService` viva en un paquete común `packages/prisma-client` importado tanto por `auth` como por `audit`. Se descarta por simplicidad MVP: `PrismaService` vive en `auth` con el wrapper provisto por `audit` via composition. Si el acoplamiento molesta, se re-ubica en un ADR futuro.
- `PermissionResolverService` (D3).
- Endpoints `GET /api/v1/roles/*` y `GET /api/v1/permissions/*` (D8).
- Integración con `@auth0/nextjs-auth0` **no** — esa es cross-cutting del frontend y se documenta acá pero vive en `apps/web/src/lib/auth/`.

### `auth/index.ts` — superficie pública

```ts
// apps/api/src/modules/auth/index.ts
export { AuthModule } from './auth.module';

// Guards (registrables con @UseGuards o APP_GUARD):
export { AuthGuard } from './guards/auth.guard';
export { TenantGuard } from './guards/tenant.guard';
export { ModuleEnabledGuard } from './guards/module-enabled.guard';
export { PermissionsGuard } from './guards/permissions.guard';
export { SuperadminOnlyGuard } from './guards/superadmin-only.guard';

// Decoradores:
export { Permissions } from './decorators/permissions.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { SuperadminOnly } from './decorators/superadmin-only.decorator';
export { ModuleEnabled } from './decorators/module-enabled.decorator';

// Tipos y helpers:
export type { AuthContext } from '@gestion-publica/shared-types/auth';
export { hasPermission, ALL_PERMISSIONS } from './permissions/permission-helpers';

// ALS:
export { tenantContextStorage, TenantContextStorage } from './context/tenant-context-storage';

// Servicios públicos consumidos por otros módulos:
export { PermissionResolverService } from './services/permission-resolver.service';
export { PrismaService } from './prisma/prisma.service';
```

### `auth` consume de `core`

- `UserSyncService` — invocado desde `AuthGuard` (D5). Requiere export desde `core/index.ts` (ajuste menor, ver §11).
- `ModuleEnablementService.isEnabled(orgId, moduleKey)` — invocado desde `ModuleEnabledGuard`. Ya exportado por `core` (ADR 0002).
- Queries a `core.organization` (para validar status en `TenantGuard`) — via `PrismaService.raw` directamente, no via un service de `core`. **Justificación**: validar `organization.status` es infraestructura de seguridad, no lógica de negocio; queremos evitar un roundtrip a un service por cada request. Si `core` prefiere encapsular la lectura en un `OrganizationQueryService`, se migra; por defecto, lectura directa con `PrismaService.raw`.

### `auth` consume de `audit`

- `AuditEventEmitter.emit(event)` — emitido indirectamente (desde `UserSyncService` en `core`, no directo desde `auth`).
- `RequestContextStorage` — leído en `AuthGuard` para copiar `requestId` a `AuthContext`.
- `TransactionContextStorage` — no leído directamente, pero `PrismaService.runInTransaction` (provisto por `audit`) lo popula.

### `auth` no consume de `okr`

Dirección inversa. `auth` es upstream; `okr` depende de `auth`.

### Prohibiciones explícitas

- **Prohibido**: `import { X } from '../core/internal/...'` — solo via `core/index.ts`.
- **Prohibido**: `import { X } from '../audit/internal/...'` — solo via `audit/index.ts`.
- **Prohibido**: `import { X } from '../okr/...'` en cualquier forma. `auth` jamás depende de módulos de negocio.
- **Prohibido**: escribir directo en `audit.event` via Prisma. `UserSyncService` emite via `AuditEventEmitter`.
- **Prohibido**: leer `auth.permission` o `auth.role` desde módulos que no sean `auth`. Otros módulos consumen via `PermissionResolverService` o via `AuthContext.permissions` ya resuelto.

### `packages/prisma-tenant-extension`

- **Ubicación**: `packages/` (sibling de `okr-domain`, `shared-types`, `ui`).
- **Owned by**: conceptualmente `auth`. Físicamente vive como paquete independiente por reusabilidad (ver D6). `auth` es el principal consumer (instancia `PrismaService.scoped`).
- **Exports**: `tenantExtension(provider)`, `MissingTenantContextError`, `TENANT_SCOPED_MODELS`.
- **No exports**: ALS (vive en `auth`), `AuthContext` (vive en `shared-types`).

### `packages/shared-types/src/auth/`

- Contenido: `AuthContext` type, `PermissionKey` union, `RoleKey` union, `RoleDto`, `PermissionDto`, `ALL_PERMISSIONS` constante, helper type `hasPermission` si se type-only (runtime wrapper en `apps/api`).
- Consumido por `apps/api` y `apps/web`. Cero runtime dependency.

---

## Sequences

### Secuencia A — Request autenticada tenant-scoped (típica OKR)

```
Client → API: GET /api/v1/okr/objectives
  Headers: Authorization: Bearer <JWT>, X-Organization-Id: <orgId>
           X-Request-Id: <reqId> (optional)

1. RequestContextInterceptor:
     requestId = headers['X-Request-Id'] ?? cuid()
     RequestContextStorage.run({ requestId }, () => next())
     response header: X-Request-Id: <requestId>

2. AuthGuard (APP_GUARD, global):
     JWT = extract(headers.authorization)
     payload = jwksRsa + jsonwebtoken .verify(JWT, key, opts)
     // throws 401 on failure
     coreUser = UserSyncService.upsertFromJwt(payload)
     // upserts core.user, maybe emits user.created / user.updated
     // checks bootstrap superadmin
     // maybe emits user.superadmin_granted
     authContext = {
       userId: coreUser.id,
       auth0Sub: payload.sub,
       email: coreUser.email,
       displayName: coreUser.displayName,
       isSuperadmin: coreUser.isSuperadmin,
       organizationId: null,
       permissions: [],
       requestId: RequestContextStorage.get().requestId,
     }
     TenantContextStorage.run(authContext, () => next())

3. TenantGuard (controller-level):
     orgId = headers['X-Organization-Id']
     if (!orgId) → 400 MissingTenantHeader
     org = prisma.raw.organization.findUnique({ where: { id: orgId } })
     if (!org) → 404 OrganizationNotFound
     if (org.status === 'inactive' && !authContext.isSuperadmin) → 403 OrganizationInactive

     if (!authContext.isSuperadmin) {
       membership = prisma.raw.userOrganizationRole.findUnique(
         { where: { userId_organizationId: { userId: authContext.userId, organizationId: orgId } } }
       )
       if (!membership) → 403 NotAMember
     }

     authContext.organizationId = orgId
     if (authContext.isSuperadmin) {
       authContext.permissions = ['*']
     } else {
       authContext.permissions = PermissionResolverService.resolve(authContext.userId, orgId)
     }
     // authContext es re-freezado o mutado in-place; el storage ya lo tiene por ref.

4. ModuleEnabledGuard (controller-level, si @ModuleEnabled('okr')):
     if (authContext.isSuperadmin) → bypass, pass
     enabled = ModuleEnablementService.isEnabled(authContext.organizationId, 'okr')
     if (!enabled) → 403 ModuleNotEnabled

5. PermissionsGuard (handler-level, si @Permissions('okr:read')):
     required = Reflector.get('permissions', handler)  // ['okr:read']
     if (required.some(key => hasPermission(authContext, key))) → pass
     else → 403 PermissionDenied

6. Controller handler executes.
     Repositories use PrismaService.scoped → extension inyecta organizationId automáticamente.
     Services call okr-domain for pure math.
     Mutations wrapped in PrismaService.runInTransaction → AuditEventEmitter.emit(event).
     Response JSON devuelto.
```

> **Anti-leak scope clarification**: the anti-leak policy (not distinguishing "entity doesn't exist" from "you don't have access") applies to Objetivos, KRs, Tareas, and other per-tenant business entities. It does NOT apply to `Organization` itself, which is a top-level system entity for which a truthful 404 is correct when the id does not exist in the system. Once `Organization` existence is confirmed, subsequent checks (`inactive`, `not a member`) collapse to a uniform 403 so that a non-superadmin caller cannot distinguish "org is inactive" from "I am not a member of this org".

### Secuencia B — Request cross-tenant superadmin (`POST /api/v1/orgs`)

```
Client → API: POST /api/v1/orgs
  Headers: Authorization: Bearer <JWT> (no X-Organization-Id)
  Body: { slug: 'new-org', name: 'New Org' }

1. RequestContextInterceptor: populates requestId.
2. AuthGuard: validates JWT; UserSyncService.upsertFromJwt; populates AuthContext.
     authContext.isSuperadmin === true.
     authContext.organizationId === null (header not sent).
     authContext.permissions === ['*'] (sentinel — AuthGuard detecta superadmin y setea directo, sin esperar TenantGuard).
     TenantContextStorage.run(authContext, () => next())

3. SuperadminOnlyGuard (controller-level):
     if (!authContext.isSuperadmin) → 403
     pass.

     No TenantGuard (endpoint cross-tenant).

4. Controller handler:
     OrganizationService.create({ slug, name })
       PrismaService.runInTransaction(async (tx) => {
         org = tx.organization.create({ data: {...} })     // Organization no está en TENANT_SCOPED_MODELS, OK
         period = tx.period.create({ data: { organizationId: org.id, ... } })
           // Period SÍ está scoped, pero isSuperadmin() === true → extension bypassa
           // ^-- crítico: el extension-bypass depende de que authContext.isSuperadmin sea accesible desde la ALS
         AuditEventEmitter.emit(organizationCreatedEvent, { organizationId: org.id })
         AuditEventEmitter.emit(periodCreatedEvent, { organizationId: org.id })
       })
     return org
```

### Secuencia C — `/me` endpoint (cross-tenant, no superadmin)

```
Client → API: GET /api/v1/me
  Headers: Authorization: Bearer <JWT>

1. RequestContextInterceptor: populates requestId.
2. AuthGuard: validates, upserts, populates AuthContext with permissions=[], organizationId=null.
3. No TenantGuard.
4. Handler:
     MeService.getMe(authContext.userId)
       prisma.raw.userOrganizationRole.findMany({
         where: { userId: authContext.userId },
         include: { organization: true, role: { include: { rolePermissions: { include: { permission: true } } } } },
         // cross-tenant read OK porque usamos prisma.raw (sin extension)
       })
       for each membership:
         resolve enabledModules via ModuleEnablementService (or direct join)
         resolve permissions from role.rolePermissions
     return MeDto
```

---

## Cascade math placement

N/A. El módulo `auth` no tiene aritmética de cascada. Consistente con 0002/0003.

---

## Auth0 → local RBAC mapping

### Claims Auth0 consumidos

Ver D1. En resumen:

- Mandatorios: `iss`, `aud`, `exp`, `sub`, `email`.
- Opcionales: `nbf`.
- **No custom claims** de permisos ni de orgs en MVP.

### Resolución de permisos

Ver D3. En resumen:

- Permisos siempre resueltos en DB por request.
- Cache per-request en `AuthContext.permissions`.
- Superadmin representado con sentinel `'*'`.

### Política de claims drift

Consistente con 0001/0002/0003:

- Identidad (`sub`, `email`): confiamos en el JWT.
- Permisos: siempre DB. Un cambio de rol tiene efecto en la próxima request.
- Revocación: borrar row en `core.user_organization_role` → próxima request con esa org recibe 403.
- Para propagar cambios críticos (p.ej. revocar superadmin), no se necesita re-login.

### Seeds

Ver D7. Catálogo consolidado con idempotent seed SQL.

---

## Tenant scoping

### Flujo end-to-end (consolidación 0001 + 0002 + 0003 + este ADR)

```
JWT Auth0
  ↓
AuthGuard (APP_GUARD global)
  - Valida firma (jwks-rsa + jsonwebtoken)
  - Invoca UserSyncService.upsertFromJwt → core.user
  - Popula AuthContext: { userId, auth0Sub, email, displayName, isSuperadmin, 
                          organizationId: null, permissions: [], requestId }
  - Si isSuperadmin: permissions = ['*'] directo.
  - TenantContextStorage.run(authContext, () => next)
  ↓
TenantGuard (per-controller, cuando aplica)
  - Lee header X-Organization-Id (→ 400 si falta)
  - Valida org existe y status='active' (superadmin bypass)
  - Valida membership en core.user_organization_role (superadmin bypass)
  - authContext.organizationId = orgId
  - Si no-superadmin: authContext.permissions = PermissionResolverService.resolve(...)
  ↓
ModuleEnabledGuard (per-controller/handler, cuando @ModuleEnabled)
  - Pregunta ModuleEnablementService.isEnabled(orgId, moduleKey)
  - Superadmin bypass.
  ↓
PermissionsGuard (per-handler, cuando @Permissions)
  - Lee AuthContext.permissions
  - hasPermission() chequea '*' o key específica
  ↓
Handler ejecuta
  - Repositories usan PrismaService.scoped → extension inyecta organizationId
  - Superadmin bypass en la extension → queries ven todas las orgs
  - MeService, OrganizationService usan PrismaService.raw cuando cross-tenant
```

### Modelos bajo la extension (consolidado)

```
TENANT_SCOPED_MODELS = {
  // Schema okr (ADR 0001):
  'Objective', 'KeyResult', 'Task',
  // Schema core (ADR 0002 D6):
  'Period', 'UserOrganizationRole', 'OrganizationModule',
  // Schema audit: NO (ADR 0003) — organization_id NULLABLE.
  // Schema auth: NO — catálogo global (Role, Permission, RolePermission).
  // Schema core excluidos: Organization (raíz), User (cross-tenant), Module (global).
}
```

### Edge cases

- **Superadmin cross-tenant**: bypass en la extension + opcionalmente sin `X-Organization-Id`. AuthContext.organizationId puede ser null; queries con modelos scoped se ejecutan sin filter (responsabilidad del service de pasar `organizationId` explícito cuando corresponda).
- **`/me` endpoint**: usa `PrismaService.raw`. No aplica extension.
- **`GET /orgs` superadmin**: lee `core.organization` (fuera del set scoped); no requiere bypass especial.
- **`audit.event`**: no está scoped por extension; `AuditEventEmitter` escribe `organization_id` desde `TenantContextStorage` o desde override explícito (ADR 0003).

### Confirmación

Ningún endpoint tenant-scoped puede emitir queries sin `organizationId` salvo que el user sea superadmin. **Default deny** se cumple por construcción:

- `AuthGuard` global → toda request requiere JWT válido.
- `TenantGuard` per-controller tenant-scoped → validación explícita.
- Extension con `MissingTenantContextError` → bug safety net si el guard olvidó popular.
- `PermissionsGuard` → autorización fine-grained con sentinel superadmin.

---

## Audit events

### Eventos emitidos por `auth`

**Cero eventos emitidos directamente por `auth`**.

Los únicos eventos relacionados con identidad (`user.created`, `user.updated`, `user.superadmin_granted`, `user.superadmin_revoked`) los emite `UserSyncService`, que vive en **`core`** (ADR 0002 tabla de eventos). `auth` invoca ese servicio desde `AuthGuard` pero no es dueño de los eventos.

### Confirmación

- `auth` no INSERTa en `audit.event` desde su código.
- `auth` no UPDATEa ni DELETEa nada en `audit.event` (append-only enforced por trigger + REVOKE, ADR 0003 D2).
- `auth` sí **consume** `AuditEventEmitter.emit()` indirectamente via `UserSyncService` (que vive en `core`).

**Tabla de eventos consolidada** (referencia; eventos listados en ADR 0002):

| Mutación | Dueño del evento | Acción |
|---|---|---|
| Login Auth0 → primer upsert de `core.user` | `core` (UserSyncService) | `user.created` |
| Re-login con email/displayName cambiado | `core` (UserSyncService) | `user.updated` |
| Primer login que cumple bootstrap criteria | `core` (UserSyncService) | `user.superadmin_granted` (reason='bootstrap') |
| `POST /users/:id/superadmin` (manual, endpoint de `core`) | `core` (UserController/Service) | `user.superadmin_granted` (reason='manual') |
| `DELETE /users/:id/superadmin` | `core` | `user.superadmin_revoked` |

**Auditoría de lecturas**: **no** se auditan (consistente con 0001/0002/0003). `GET /roles`, `GET /permissions` no emiten eventos.

**Auditoría de JWT validation failures**: **no** en MVP. Un JWT expirado o malformado produce 401 sin trail en `audit.event`. Razones:

- Los 401 son ruido: bots, browsers con cookies stale, probing.
- El emit requiere `actor_id NOT NULL` (ADR 0003 D5), y un 401 por JWT inválido no tiene `actor_id`.
- Si un requisito de seguridad pide auditar intentos fallidos, un ADR futuro puede relajar `actor_id` o introducir una tabla `auth.login_attempt` separada del trail general.

---

## Prohibiciones

Enumeradas explícitamente para que no se reviertan en refactors:

1. **No** confiar en claims custom de permisos del JWT. Todo permission check resuelve contra DB.
2. **No** expandir el superadmin al catálogo completo de permisos. Se usa sentinel `'*'`. Cambiar esto requiere ADR.
3. **No** cachear permisos cross-request. El `AuthContext` dura la request; la siguiente re-resuelve.
4. **No** invocar el `PrismaService.raw` fuera de `MeService`, `OrganizationService` (superadmin), `PermissionResolverService`, y casos explícitamente aprobados via review. Todo otro acceso va por `.scoped`.
5. **No** exponer mutaciones de roles/permisos en MVP. Catálogo cerrado.
6. **No** permitir a `org-admin` o inferior listar el catálogo global de roles/permisos. Endpoints gated con `@SuperadminOnly()`.
7. **No** loggear el JWT completo en stdout/logs. El `sub` y `email` son suficientes para correlación; el resto es información sensible.
8. **No** loggear el `accessToken` desde Next.js. El SDK lo encripta en la session cookie; nunca se imprime.
9. **No** saltar el `AuthGuard` ni siquiera en endpoints "públicos" (no hay en MVP). Si aparece un endpoint auténticamente público, se introduce un `@Public()` decorator via ADR.
10. **No** hacer merge de usuarios automático (Auth0 puede retornar dos `sub` distintos por mismo `email`). `user.email UNIQUE` produce violación → 500; operador resuelve a mano (ADR 0002 "Limitaciones conocidas").

---

## Alternatives considered

Además de las alternativas internas a cada decisión D1–D11, se evaluaron:

### A1. Passport.js como capa de autenticación

**Descartada**. Passport es útil cuando hay N strategies (session, OAuth, SAML, local). MVP tiene una sola: Auth0 JWT. La indirección de Passport agrega boilerplate y esconde el `jwksRsa.verify` que queremos inspeccionar. `jwks-rsa` + `jsonwebtoken` directo es más simple.

### A2. Resolver permisos una vez por login (no por request)

**Descartada**. Cachear permisos en la session cookie del SDK tras el login significa:

- Invalidar el cache al cambiar un rol (requiere mecanismo de invalidación distribuido).
- Drift: el user sigue con permisos viejos hasta que se loguee otra vez.

La opción simple (DB por request) es O(1 JOIN indexado) y está libre de drift. Se queda con eso. Si aparece evidencia de que el JOIN es el bottleneck (muy improbable), se agrega un cache con TTL corto + busting on role change.

### A3. JWT con permisos embebidos (Auth0 Rules/Actions populando claims)

**Descartada**. Drift es la razón principal; ver ADR 0001 "Por qué resolver en DB y no confiar en claims custom". Adicionalmente:

- Auth0 Rules/Actions acoplan lógica de autorización al dashboard Auth0. Preferimos que viva en la DB con el resto del sistema.
- Los tokens JWT tendrían tamaño variable grande (listar todos los permisos de todas las orgs del user).

### A4. `permissions` como `Set<string>` en vez de `readonly string[]`

**Descartada por ergonomía**. `Set` no es trivial de serializar en JSON (el frontend lo recibiría como objeto vacío si no se convierte). Mantener `readonly string[]` permite `JSON.stringify(authContext)` trivial para debugging y serialization al frontend via `MeDto`.

### A5. Delegar el scoping a la DB (RLS — Row Level Security)

**Descartada**. Postgres Row Level Security puede enforzar `organization_id = current_setting('app.org_id')` en cada query sin que la app lo pida.

- Pro: defensa en profundidad ultimate. Un bug en la extension no leak data.
- Contra: requiere setear `SET LOCAL app.org_id = '...'` en cada transacción desde Nest, lo cual es equivalente al trabajo de la extension, solo que en SQL en vez de TS.
- Contra: testear RLS requiere conectar a Postgres; la extension se testea con mock de Prisma.
- Contra: RLS complica las queries cross-tenant del superadmin (requiere `SET LOCAL app.is_superadmin = true` y políticas que lo contemplen).

**Se deja como opción futura** si aparece evidencia de leak en la extension. Por ahora, la extension + tests de integración cubren el caso.

### A6. Roles custom por organización (multi-tenant role model)

**Descartada para MVP**. Cada org podría definir sus propios roles (`org:123:custom-role`). Complica el seed, la resolución, la UI de gestión y el razonamiento sobre autorización.

- La spec MVP no pide roles custom.
- Si aparece, se abre un ADR dedicado con namespace de roles (`system:<key>` vs `org:<orgId>:<key>`), CRUD endpoints, auditoría y UI.

### A7. Guards declarativos via decorators exclusivamente (evitar `APP_GUARD`)

**Descartada**. Declarar `@UseGuards(AuthGuard)` en cada controller es ruidoso y propenso a error (olvidar `AuthGuard` en un controller nuevo = endpoint público accidental). `APP_GUARD` global elimina la categoría de bug.

### A8. Token via Bearer en Authorization vs cookie session

**Descartada — cookie session para API calls**. Los fetchs desde Next.js Server Actions a la API Nest usan `Authorization: Bearer <accessToken>`. No se envía session cookie a la API. Razones:

- La API Nest es stateless por diseño; recibe tokens bearer.
- La session cookie es cosa del SDK Next.js para la UI, no cruza al backend Nest.
- Mantener el access token en `Authorization` header desacopla API-tests (Postman/curl) del SDK frontend.

---

## Impact

### Migraciones requeridas

1. Crear schema Postgres `auth` si no existe.
2. Crear tablas `auth.role`, `auth.permission`, `auth.role_permission` con columnas, FKs, CHECKs e índices (ver "Data model").
3. Seeds idempotentes de permisos (11 rows) y roles (4 rows) con los CONFLICT DO NOTHING (D7).
4. Seeds idempotentes de `auth.role_permission` (MVP: 12 assignments; ver D7 matriz).
5. Orden de migraciones consolidado:
   - `auth.role` + `auth.permission` + `auth.role_permission` primero (este ADR).
   - `core.*` después, ya que `core.user_organization_role.role_id` tiene FK cross-schema a `auth.role.id` (ADR 0002 "Impact" ya lo anota).
   - `audit.event` después de `core` (FKs a `core.user`, `core.organization`; ADR 0003).
   - `okr.*` último (depende de `core`).

### Tests nuevos

- **Unit (`apps/api/src/modules/auth/__tests__/`)**:
  - `AuthGuard`: valida JWT correcto, rechaza expirado, rechaza issuer incorrecto, invoca UserSyncService, popula AuthContext, setea `permissions=['*']` si superadmin.
  - `TenantGuard`: rechaza sin header, rechaza sin membership, bypass superadmin, valida `organization.status='active'`.
  - `PermissionsGuard`: permite con `'*'`, permite con key exacta, rechaza sin permiso.
  - `SuperadminOnlyGuard`: rechaza no-superadmin.
  - `ModuleEnabledGuard`: rechaza si deshabilitado, bypass superadmin.
  - `PermissionResolverService.resolve`: JOIN correcto, dedupe de permisos, freeze del array.
  - `hasPermission(ctx, key)`: maneja `'*'` + key específica.
  - `PrismaService`: `.scoped` y `.raw` devuelven clients distintos; `runInTransaction` (provisto por `audit`) envuelve correctamente.

- **Unit (`packages/prisma-tenant-extension/test/`)**:
  - Ver D6 test strategy.

- **Integration (`apps/api/test/`, testcontainers Postgres)**:
  - End-to-end de login: JWT válido → `UserSyncService` upsert → `AuthContext` populado → request a `/api/v1/me` devuelve shape correcto.
  - Bootstrap superadmin: env var + primer login con email match → `is_superadmin=true` + audit event.
  - Subsiguientes logins (email match pero ya hay superadmin) → no re-promueven.
  - Tenant isolation: org-admin de Org A, request a endpoint de Org B → 403.
  - Superadmin cross-tenant: request a `POST /orgs` sin `X-Organization-Id` → pasa.
  - `@ModuleEnabled('okr')` + org con OKR deshabilitado → 403.
  - Matriz RBAC: cada rol seedeado → permisos esperados resueltos.
  - Extension + ALS: múltiples ALS.run() concurrentes → aislamiento correcto.

- **E2E (`apps/web`, Playwright)**:
  - Login flow completo: click "Iniciar sesión" → Auth0 Universal Login → redirect → dashboard con `MeDto` cargado.
  - Selector de organización: user con 2+ orgs → selector → cambio de `gp_active_org` cookie → fetches subsiguientes llevan nuevo `X-Organization-Id`.
  - Logout: cleanup de session cookie + `gp_active_org` cookie → redirect Auth0 logout → login page.
  - Rate limiting: 101 requests en 60s → última recibe 429.

### Otros módulos afectados

- **`core`**: debe exportar `UserSyncService` desde `core/index.ts` (ajuste pendiente, §11). Ninguna otra cambio funcional; los contratos ya definidos en ADR 0002 se mantienen.
- **`audit`**: proveer `PrismaService.runInTransaction` (ADR 0003 D1 lo define; este ADR lo consume). Ninguna otra cambio funcional.
- **`okr`**: consume `AuthGuard`, `TenantGuard`, `ModuleEnabledGuard`, `PermissionsGuard`, `@Permissions`, `@CurrentUser` desde `auth/index.ts`. Ya previsto en ADR 0001.
- **`apps/api/src/main.ts`**: registrar `AuthGuard` como `APP_GUARD` global; registrar `RequestContextInterceptor` como `APP_INTERCEPTOR` global (ya previsto en ADR 0003 D8); registrar `ThrottlerGuard` como `APP_GUARD` global.
- **`apps/web`**:
  - Instalar `@auth0/nextjs-auth0` v3+.
  - Crear `apps/web/src/lib/auth/` con helpers (Server Actions para login, logout, setActiveOrg; `apiFetch` helper que adjunta `Authorization` + `X-Organization-Id`).
  - Configurar `middleware.ts` del Auth0 SDK para Route Handlers.
- **`packages/prisma-tenant-extension`**: crear el paquete (ya previsto en 0001/0002).
- **`packages/shared-types/src/auth/`**: crear el namespace con tipos y enums (ya previsto en 0001/0002/0003).

### Variables de entorno nuevas

```
# Auth0 (API Nest)
AUTH0_ISSUER_BASE_URL=https://gestion-publica.auth0.com/
AUTH0_AUDIENCE=https://api.gestion-publica.ar
AUTH0_JWKS_URI=                      # derivable de ISSUER si vacío

# Auth0 (Next.js frontend)
AUTH0_SECRET=                         # randomly generated; encripta session cookie
AUTH0_BASE_URL=https://gestion-publica.ar
AUTH0_ISSUER_BASE_URL=                # mismo valor que en API
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Bootstrap superadmin (ADR 0002 D5, consumida acá)
CORE_BOOTSTRAP_SUPERADMIN_EMAIL=

# Rate limiting
AUTH_THROTTLE_TTL_SECONDS=60
AUTH_THROTTLE_LIMIT=100
```

---

## Consequences

### Trade-offs aceptados

- **Permission resolution por request**: 1 JOIN indexado por request autenticada. ~1 ms. Aceptable a escala MVP; cacheable si aparece evidencia.
- **`UserSyncService` invocado en cada request**: 1 upsert indexado por `auth0_sub`. ~1 ms. Mismo razonamiento.
- **Superadmin sentinel `'*'`**: mágico pero bien documentado. Trade vs expansión de catálogo o `null`; sentinel gana en ergonomía y robustez.
- **JWKS cache en memoria por instancia**: cache-miss inicial tras deploy. Tolerable.
- **Roles y permisos sin mutations en MVP**: agregar un rol requiere migración. Decisión consciente.
- **Cookie httpOnly para `X-Organization-Id`**: requiere Server Action para cambiar de org. Trade vs localStorage; seguridad gana.
- **Sin auditoría de JWT failures**: 401 son ruido; auditarlos cuesta y aporta poco en MVP.
- **`auth.permission.key` como PK string (no cuid)**: legibilidad en logs y decoradores. Trade vs rigidez del key.

### Limitaciones conocidas

- **No hay "invitar user antes de su primer login"**: documentado en ADR 0002 "Consequences". Aplica a `auth` como consumer.
- **Si Auth0 cambia el `sub` de un user** (merge de identidades, deletion + recreation en Auth0 dashboard): el upsert por `auth0_sub` crea una nueva row en `core.user`. El user pierde su estado (membresías, superadmin flag) de la identidad anterior. **Mitigación**: no hacer merge de identidades en Auth0 dashboard. Si se necesita, requiere operación manual en DB.
- **JWT rotation policy (tokens de larga vida)**: no controlada por `auth`. Se setea en Auth0 dashboard. Recomendación: `accessToken` TTL de 1 hora, `refreshToken` TTL de 30 días con rotación.
- **No hay MFA enforcement a nivel app**: gated en Auth0. Si se requiere MFA para operaciones sensibles específicas (ej. promoción a superadmin), se implementa con Auth0 step-up auth en un ADR dedicado.
- **No hay rate limit per-endpoint**: 100 req/min global por user. Endpoints caros (p.ej. `/cascade` de OKR) tienen el mismo bucket que `/me`. Tunning diferido.
- **Rate limit per-instance (no distributed)**: `@nestjs/throttler` por default usa storage en memoria. Si hay N réplicas, el límite efectivo es `N × 100 req/min`. Aceptable en MVP monoprocess; para producción multi-instance, se migra a `ThrottlerStorage` con Redis.
- **Sin password auth**: todas las identidades vienen por Auth0. Si Auth0 está caído, login está caído. Aceptable dado el contrato SLA de Auth0; se mitiga con contingency manual (operador setea `is_superadmin=true` via psql durante outage).
- **No hay impersonation superadmin → user**: un superadmin no puede "ver la UI como lo ve el user X". Fuera de alcance MVP; se agrega en ADR de tooling si aparece.
- **El `accessToken` expira**: si el SDK falla silent refresh, el user ve un 401 y redirect a login. Frustración UX mitigada con refresh-retry lógico en `apiFetch`.
- **`is_superadmin` cache en JWT indirectamente**: si un superadmin se revoca a sí mismo, el `AuthContext` de su siguiente request se re-populará (nuevo upsert). Si el request está in-flight, el request corriente aún ve `isSuperadmin=true`. Ventana de race de ~1 request. Aceptable; el fix es trivial (la revocación es idempotente).

### Decisiones diferidas

- **Roles custom per-org**: ADR dedicado si aparece demanda.
- **Mutations de roles/permisos**: misma condición.
- **MFA enforcement por endpoint**: ADR dedicado si requisito.
- **Auditoría de JWT failures**: ADR dedicado si requisito forense.
- **Distributed rate limiting con Redis**: cuando la app se escale horizontalmente.
- **Claim custom para orgs (pre-popular `MeDto` sin DB roundtrip)**: optimización diferida hasta que haya evidencia.
- **Step-up auth (MFA para operaciones sensibles específicas)**: ADR dedicado.
- **Impersonation superadmin**: ADR de tooling interno si aparece.
- **Rol `external-auditor` asignado a permisos (`audit:read:all`)**: ADR 0003 lo declaró reservado; este ADR lo seedea sin assignments. Cuando se active, ADR dedicado que defina:
  - A qué orgs tiene visibilidad (todas o subset).
  - Si se le aplica `TenantGuard` o es cross-tenant puro.
  - Cómo se asigna (via `POST /users/:id/external-auditor` endpoint nuevo, via config, etc.).

---

## Open questions

Temas que este ADR explícitamente **no** resuelve y que requieren feedback del dueño de producto o ADR dedicado:

1. **¿El MVP necesita el rol `external-auditor` seedeado?** Este ADR lo seedea sin assignments por higiene. Si se prefiere no seedearlo hasta que se use, es un one-liner menos en el seed.
2. **¿Cookie `gp_active_org` con `SameSite=Lax` es suficiente, o se prefiere `Strict`?** `Lax` permite que el cookie se envíe en top-level GET navigations (bookmarks, enlaces desde email). `Strict` solo en same-site. Elegido `Lax` por UX; si el dueño prioriza seguridad estricta, se cambia a `Strict` (trade-off: un link de email que apunte al dashboard abre sin org seleccionada).
3. **¿TTL del `accessToken` Auth0 de 1 hora es apropiado?** Se deja a criterio del operador en el dashboard Auth0. Recomendación del ADR.
4. **¿Qué hacer si `UserSyncService` falla a mitad del upsert (p.ej. crash entre insert de `core.user` y check bootstrap superadmin)?** La transacción rollback deja estado coherente (o todo o nada). Pero el siguiente intento retry automáticamente en el próximo request — el user nunca ve el fallo.
5. **¿El operador quiere configurar `AUTH_THROTTLE_LIMIT` por tipo de endpoint?** MVP: no. Diferido.

---

## Conflicts with frozen rules

None detected.

Verificación punto por punto:

- **Stack cerrado (NestJS + Prisma + Postgres + Next.js + Auth0)**: cumplido. Todas las decisiones se apegan al stack.
- **Module boundaries**: `auth/index.ts` exporta superficie limitada; `auth` consume `core/index.ts` y `audit/index.ts` solamente; prohibiciones explícitas enumeradas.
- **Multi-tenant**: `auth` no tiene entidades de negocio con `organization_id` — `auth.role`, `auth.permission`, `auth.role_permission` son catálogo global. Justificación explícita en D7.
- **Audit log append-only**: `auth` no emite eventos directos; los que dependen de `UserSyncService` viven en `core`; son todos INSERT.
- **Decimales en `Float` prohibidos**: no aplica (`auth` no maneja decimales).
- **OKR frozen rules**: no aplica directamente (`auth` no toca dominio OKR).
- **Default deny**: `AuthGuard` global + guards per-controller. Cero endpoints públicos en MVP.
- **TypeScript estricto**: shape de `AuthContext` es `readonly`; `PermissionKey` es union string literal; sin `any`.
- **No commitear credenciales**: variables de entorno documentadas, no hardcoded. `AUTH0_SECRET`, `AUTH0_CLIENT_SECRET`, `CORE_BOOTSTRAP_SUPERADMIN_EMAIL` viven en `.env`, nunca en repo.
- **Naming**: archivos kebab-case (`permission-resolver.service.ts`), clases PascalCase (`AuthGuard`, `PermissionsGuard`), DTOs con sufijo explícito, enums PascalCase singular. Cumplido.
- **Permisos resueltos en DB por request**: D3 lo enforza.
- **Sin mock de Prisma en tests de cascada**: no aplica (`auth` no tiene cascada); pero los tests de la extension usan mock + testcontainers para integration.
- **Sin `UPDATE`/`DELETE` sobre `audit.event`**: `auth` nunca las emite.
- **Sin lógica de negocio en controllers ni en React components**: decoradores y guards son infra; `PermissionResolverService` es un service; controllers de `auth` son thin (solo listar roles/permisos).
- **Sin endpoints sin guard**: todos los endpoints listados llevan `@AuthGuard` + `@SuperadminOnly`.

---

## Amendments to prior ADRs

Ajustes textuales menores para coherencia. **Ninguna amendment material**: todas las decisiones previas se respetan; solo se documenta el cumplimiento y se aclaran puntos ambiguos.

### Sobre ADR 0001 (OKR)

1. **Naming del error de tenant extension**: ADR 0001 line 462 y 766 usa `MissingTenantContextError`. Este ADR lo **confirma** (no lo renombra). Ninguna edición necesaria.

2. **Firma del emitter (`emit(event)` sin `tx`)**: ya enmendada por ADR 0003 D1. Este ADR no introduce cambio adicional.

3. **`@SuperadminOnly()` decorator**: ADR 0001 line 834 lo menciona como propuesta diferida ("se propone un decorator `@SuperadminOnly()` que ... En MVP del módulo OKR: **no hay** endpoints superadmin."). Este ADR lo **entrega** y confirma que `okr` en MVP no lo usa — consistente con 0001.

4. **`AuthContext` shape**: 0001 line 721 dice `AuthContext: { userId, organizationId, permissions[] }`. Este ADR **extiende** a `{ userId, auth0Sub, email, displayName, isSuperadmin, organizationId, permissions, requestId }`. Extensión aditiva, no breaking — los campos originales quedan. 0001 no necesita edición textual; el shape más rico queda documentado acá.

### Sobre ADR 0002 (Core)

1. **Export de `UserSyncService` desde `core/index.ts`**: ADR 0002 line 665-679 enumera los exports públicos de `core/index.ts` y **no incluye `UserSyncService`**. `auth` lo necesita para el hook del `AuthGuard` (D5 de este ADR). 
   - **Edición sugerida**: `docs/adr/0002-core-module-foundation.md` líneas ~665-679, sección "`core/index.ts` — superficie pública", agregar:
     ```ts
     export { UserSyncService } from './services/user-sync.service';
     ```
   - Alternativa: mantener `UserSyncService` internal de `core` y exponer solo un `UserSyncPort` interface pequeño. Se prefiere export directo por simplicidad MVP; si las firmas internas cambian, el contrato se refina en un ADR futuro.

2. **`AuthContext` shape**: 0002 referencia implícitamente un shape consistente con 0001. Este ADR explicita que el shape es `{ userId, auth0Sub, email, displayName, isSuperadmin, organizationId, permissions, requestId }`. Ningún campo que 0002 use es omitido. Sin edición textual necesaria.

3. **`MissingTenantContextError`**: 0002 line 933 lo menciona como error que `OrganizationContextService` lanza si ALS vacío. Consistente con el naming de este ADR. Sin edición.

4. **`PrismaService.raw`**: 0002 D6 introduce "Opción 2: `PrismaService.raw` como propiedad explícita sin extension". Este ADR **confirma y cristaliza**: `PrismaService` expone `.scoped` (default, con extension) y `.raw` (sin extension). Naming `scoped` reemplaza cualquier mención de "opción 2" como propiedad sin nombre. 0002 puede opcionalmente enmendarse para citar el naming final, pero no es crítico:
   - **Edición opcional**: `docs/adr/0002-core-module-foundation.md` sección D6, clarificar que el `PrismaService` expone `scoped` y `raw` como nombres de propiedades (queda a criterio del autor; este ADR ya lo documenta).

### Sobre ADR 0003 (Audit)

1. **Ownership de `TenantContextStorage`**: 0003 D10 tabla dice "Módulo `auth` (ADR 0004)". Este ADR **confirma**. Sin edición.

2. **`hasPermission(ctx, key)` helper**: 0003 line 878 lo solicita. Este ADR lo **entrega** en D3. Sin edición a 0003.

3. **`@AuditReadAccess()` decorator**: 0003 D6 lo declara. Este ADR **entrega** el mecanismo (guard composition en D4) para que `audit` lo implemente. Sin edición a 0003 — el decorator sigue siendo owned por `audit`.

4. **Orden de ADRs en "Impact → Faltantes para ADR 0004"** (0003 líneas 870-884): este ADR responde todos los faltantes listados. 0003 queda con el texto histórico "pendiente" que no es incorrecto (al momento de escribir 0003, este ADR no existía). Puede opcionalmente enmendarse a "resuelto por ADR 0004"; no es crítico.

### Resumen de edits sugeridos (minimal)

- **`docs/adr/0002-core-module-foundation.md` líneas ~665-679**: agregar `export { UserSyncService }` a la lista de exports de `core/index.ts`.
- **(opcional) `docs/adr/0002-core-module-foundation.md` D6**: clarificar naming `scoped` / `raw` de `PrismaService`.
- **(opcional) `docs/adr/0003-audit-module-foundation.md` "Faltantes para ADR 0004"**: marcar como resuelto con referencia a este ADR.

Ningún cambio altera invariantes, contratos ni decisiones de diseño de ADRs previos. Son ajustes de continuidad textual.
