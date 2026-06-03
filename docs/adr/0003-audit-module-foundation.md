# 0003 — Fundación del módulo Audit

**Status**: Proposed
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-20
**Author**: architect subagent
**Spec**: N/A — derivado de los contratos que ADR 0001 (OKR) y ADR 0002 (Core) asumen hacia `audit`, y de las reglas transversales de `CLAUDE.md` / `AGENTS.md`.

---

## Context and problem

El módulo `audit` es el **trail append-only** de `gestion-publica`. La trazabilidad es un requisito central: cada mutación sobre Objetivos, KRs, Tareas, periods, orgs, membresías, habilitación de módulos y privilegios de superadmin deja un evento inmutable. El log es el **system of record** de auditoría; no es logging de aplicación best-effort.

ADR 0001 (OKR) y ADR 0002 (Core) asumieron — y este ADR tiene que entregar — los siguientes contratos:

1. `AuditEventEmitter.emit(event, tx?)` que inserta en `audit.event` **dentro de la transacción Prisma del caller**.
2. Shape del evento: `id`, `occurred_at`, `actor_id`, `organization_id` (**NULLABLE**), `entity_type`, `entity_id`, `action`, `diff` (JSONB), `request_id`.
3. `audit.event` **append-only**: prohibido `UPDATE` y `DELETE`, enforzado a nivel DB.
4. Correcciones como **eventos compensatorios** (INSERT nuevo), no mutaciones.
5. Lecturas (`GET`) **no se auditan**.
6. El módulo `audit` **consume** `AuthGuard`, `SuperadminOnly`, `Permissions`, `CurrentUser`, `AuthContext` y `TenantContextStorage` de `auth`; **no** los diseña (lo hará ADR 0004).
7. `audit` declara pero **no implementa** los permission keys `audit:read` y `audit:read:all` (los seedea ADR 0004).

Adicionalmente, este ADR cierra decisiones que 0001 y 0002 dejaron explícitamente deferred:

- Mecanismo concreto de propagación de la transacción al emitter.
- Enforcement a nivel DB del append-only (solo insinuado en 0001/0002).
- Ubicación del `RequestContextInterceptor` y la ALS de `request_id`.
- Semántica exacta ante fallo del INSERT de audit vs rollback del caller.
- Endpoints de lectura (filtros, paginación, matriz de autorización).

### Preguntas a responder

1. ¿Cómo viaja el `PrismaClient` transaccional hasta `emit()`: argumento explícito o `AsyncLocalStorage`?
2. ¿Cómo se bloquean `UPDATE`/`DELETE` sobre `audit.event` a nivel DB?
3. ¿Qué shape TypeScript tienen los eventos y cómo son type-safe?
4. ¿Cómo crece la tabla en el tiempo y cuándo re-evaluar?
5. ¿Qué índices y FKs lleva `audit.event`?
6. ¿Qué endpoints `GET` expone el módulo, con qué filtros y qué matriz de autorización?
7. ¿Qué pasa si el INSERT de audit falla mientras la mutación de negocio ya aplicó?
8. ¿Cómo se popula `request_id` y dónde vive el interceptor?
9. ¿De dónde viene `actor_id` — caller explícito o ALS?
10. ¿Cómo conviven las tres ALS (tenant, tx, request) en el ciclo de una request?

### Asunciones declaradas

- El locale del proyecto es `es-AR` y la timezone operativa es `America/Argentina/Buenos_Aires`. `occurred_at` se persiste en UTC (`TIMESTAMPTZ`) y la UI lo convierte al render.
- Todos los eventos de MVP ocurren dentro de una request HTTP; no hay jobs / crons autónomos emitiendo eventos. Esto se relaja en un ADR futuro.
- `auth` (ADR 0004) expondrá `TenantContextStorage` como `AsyncLocalStorage` de `AuthContext` con shape `{ userId, organizationId, permissions[], isSuperadmin }` (coherente con lo asumido en 0001 y 0002).

## Decision

Vamos a implementar `audit` como un módulo NestJS autocontenido que posee el schema Postgres `audit` con una tabla `audit.event` (append-only enforzado por **trigger** + `REVOKE UPDATE, DELETE` al rol de aplicación), expone un servicio público `AuditEventEmitter` con firma `emit(event)` que **lee la transacción activa desde una `TransactionContextStorage` (AsyncLocalStorage)** (D1-b), **no atrapa excepciones** del INSERT de audit para garantizar rollback transaccional del caller (D7), popula `request_id` vía un **`RequestContextInterceptor` global** ubicado en `apps/api/src/common/` y **owned by `audit`** (D8), resuelve `actor_id` y `organization_id` desde `TenantContextStorage` provisto por `auth` (D9), mantiene **tres ALS separadas** con ownership clara (tenant/auth, request, tx) (D10), publica endpoints `GET /api/v1/audit/events` y `GET /api/v1/audit/events/:id` con filtros básicos, paginación cursor-based y matriz de autorización **superadmin ve todo / org-admin ve su org** (D6), y declara los permission keys `audit:read` y `audit:read:all` para que ADR 0004 los seed.

`audit.event` **no** emite audit events propios (el módulo es write-by-others / read-by-admins).

---

## Data model

### Ubicación

Schema Postgres: **`audit`**. Una tabla: `audit.event`.

FKs cross-schema:

- `audit.event.actor_id` → `core.user(id)` `ON DELETE RESTRICT`.
- `audit.event.organization_id` → `core.organization(id)` `ON DELETE RESTRICT` (NULLABLE — ver abajo).

Toda FK es `ON DELETE RESTRICT` por consistencia con 0001 y 0002. En MVP no se borran `core.user` ni `core.organization` (status `inactive` en lugar de delete, per ADR 0002 D1); si alguna vez se agrega baja física, el trail bloquea el borrado antes que se pierda referencia.

### Tipos comunes

- IDs: `cuid` (string), consistente con 0001 y 0002.
- Timestamps: `TIMESTAMPTZ` (Postgres) / `DateTime` (Prisma), persistidos en UTC.
- `diff`: `JSONB` (flexible, indexable por GIN si emergen patrones de query).
- `entity_type`, `action`: `VARCHAR` con convención de naming (ver D5), no enums DB.

### Shape ilustrativo (Prisma)

> Ilustrativo, no migración ejecutable.

```prisma
// apps/api/prisma/schema.prisma (extracto — schema "audit")

model AuditEvent {
  id              String   @id @default(cuid())
  occurredAt      DateTime @default(now()) @map("occurred_at")
  actorId         String   @map("actor_id")                 // FK a core.user(id)
  organizationId  String?  @map("organization_id")          // NULLABLE, FK a core.organization(id)
  entityType      String   @db.VarChar(80) @map("entity_type")
  entityId        String   @db.VarChar(120) @map("entity_id")
  action          String   @db.VarChar(80)
  diff            Json     @db.JsonB
  requestId       String   @db.VarChar(40) @map("request_id")

  @@index([entityType, entityId, occurredAt(sort: Desc)], map: "idx_event_entity_history")
  @@index([actorId, occurredAt(sort: Desc)],              map: "idx_event_actor_history")
  @@index([organizationId, occurredAt(sort: Desc)],       map: "idx_event_org_history")
  @@index([occurredAt(sort: Desc)],                        map: "idx_event_occurred_at")

  @@schema("audit")
  @@map("event")
}
```

### DDL complementario (declarado en la migración, no en Prisma)

```sql
-- FKs cross-schema
ALTER TABLE audit.event
  ADD CONSTRAINT fk_event_actor
    FOREIGN KEY (actor_id) REFERENCES core."user"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_event_organization
    FOREIGN KEY (organization_id) REFERENCES core.organization(id) ON DELETE RESTRICT;

-- Enforcement append-only: TRIGGER que bloquea UPDATE/DELETE.
CREATE OR REPLACE FUNCTION audit.reject_event_mutation()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.event is append-only; UPDATE/DELETE not allowed (op=%)', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_event_no_update
  BEFORE UPDATE ON audit.event
  FOR EACH ROW EXECUTE FUNCTION audit.reject_event_mutation();

CREATE TRIGGER trg_event_no_delete
  BEFORE DELETE ON audit.event
  FOR EACH ROW EXECUTE FUNCTION audit.reject_event_mutation();

-- Defense in depth: REVOKE a nivel privilegio sobre el rol de aplicación.
-- El rol <app_role> es el que usa la instancia Nest en runtime.
-- El rol <migration_role> (superuser o equivalente) retiene permisos para DDL.
REVOKE UPDATE, DELETE, TRUNCATE ON audit.event FROM <app_role>;
```

**Nota sobre Prisma migrate**: una vez creada la tabla, Prisma **no debe** generar `UPDATE`/`DELETE` sobre `audit.event` (nunca se mutan filas). Las migraciones futuras pueden `ALTER` (agregar columnas, índices) — el trigger solo bloquea DML sobre filas, no DDL de schema. El `REVOKE` se aplica al `<app_role>`, no al `<migration_role>`, así que las migraciones siguen funcionando.

### Elección de tipo de columna y convenciones

- `entity_type`: `VARCHAR` con convención `<schema>.<entity>` — ej. `okr.objective`, `okr.key_result`, `okr.task`, `core.organization`, `core.period`, `core.user`, `core.user_organization_role`, `core.organization_module`. **No** es un enum DB: agregar nuevos tipos no debe requerir `ALTER TYPE` (pesado y poco transaccional en Postgres, mismo razonamiento que 0002 D para `status`). La type-safety se consigue a nivel TypeScript en `shared-types` (ver D3).
- `action`: `VARCHAR` con convención `<entity>.<verb>` o `<entity>.<sub>.<verb>` — ej. `objective.created`, `task.progress.updated`, `user.superadmin_granted`.
- `entity_id`: `VARCHAR(120)` — la mayoría son cuids (25 chars) pero algunos eventos refieren a PKs compuestas de `core` (p.ej. `user_organization_role` con `${userId}:${orgId}`, o `organization_module` con `${orgId}:${moduleKey}`). 120 chars cubre ese caso con margen.
- `diff`: `JSONB` con forma `{ before, after }` (y campos extra como `reason` cuando el evento lo requiere, p.ej. `organization.deactivated`). **No** se indexa con GIN por default: las búsquedas por contenido del diff no son caso de uso MVP. Si emergen, se agrega un GIN dedicado en ADR futuro.
- `request_id`: `VARCHAR(40)` — cubre cuid (25) y también UUID v4 formateado (36) si viene de un header `X-Request-Id` generado por un gateway upstream.

### Índices — justificación

| Índice | Propósito |
|---|---|
| `idx_event_entity_history` `(entity_type, entity_id, occurred_at DESC)` | "Historial completo de la entidad X" — endpoint principal del backoffice. |
| `idx_event_actor_history` `(actor_id, occurred_at DESC)` | "Qué hizo el usuario X en el sistema" — vista de accountability. |
| `idx_event_org_history` `(organization_id, occurred_at DESC)` | "Qué pasó en la org corriente" — vista scoped del org-admin. |
| `idx_event_occurred_at` `(occurred_at DESC)` | Consultas globales cross-tenant del superadmin + soporte al futuro partitioning por rango. |

**Consistencia con 0001 y 0002**: la columna de scoping (aquí `organization_id`) aparece primero o con alta prioridad en los índices relevantes; `occurred_at DESC` es el orden de consulta natural. No existen índices compuestos con `entity_type` + `organization_id` porque el filtro primario de lectura siempre pasa por **una** de las dos dimensiones (o por entidad o por org), no ambas a la vez; si la UI empieza a ofrecer combinaciones, se agrega un índice dedicado.

### `actor_id` NOT NULL (decisión explícita)

En MVP **todos los eventos vienen de una request HTTP autenticada** — incluso el bootstrap del primer superadmin (ADR 0002 D5) ocurre durante el primer login del user que se auto-promueve, así que hay `AuthContext` con `userId`. `actor_id` queda `NOT NULL` para endurecer la invariante: **nunca** hay un evento huérfano de actor.

Cuando aparezcan jobs background (cron de auto-close de periods, imports batch, workers async), un ADR futuro decide si:
- (a) se crea un `core.user` "system" con `auth0_sub = 'system'` y los jobs se identifican con él, o
- (b) se relaja `actor_id` a NULLABLE.

Ambas opciones se evalúan ahí — no se anticipa acá.

### `organization_id` NULLABLE (confirma 0002)

Confirmado desde 0002 "Edge cases": eventos de sistema que no pertenecen a una org (`user.created`, `user.updated`, `user.superadmin_granted`, `user.superadmin_revoked`) llevan `organization_id = NULL`. Por diseño, estos eventos son **visibles solo para superadmin** (ver D6).

### Volumen estimado y umbral de re-evaluación

Estimación informal para MVP (una organización mediana, ~20 usuarios activos, ~500 tareas):

- Mutaciones por día: ~50 (avances de tareas, ediciones de KRs, gestión de membresías).
- INSERTs anuales: ~18.000.
- Tamaño promedio por row (con `diff` JSONB típico ~200 bytes): ~400 bytes.
- Proyección anual: ~7 MB.

A esa tasa, el umbral "10M filas o 1 GB" de D4 está **>100 años** de distancia. La revaluación se dispara por:

- Crecimiento de orgs (si llegan a 50+, el tráfico se multiplica).
- Módulos nuevos con mutaciones de alta frecuencia (cualquier módulo "operativo" con actividad minuto-a-minuto).
- Auditoría de lecturas (si se activa en un ADR futuro, crece 10-100x).

Hasta entonces: una sola tabla, sin particionamiento. Ver D4.

---

## API contract

Todos los endpoints bajo `/api/v1/audit/...`. Los DTOs viven en `packages/shared-types/src/audit/` y se importan tanto desde `apps/api` como desde `apps/web`.

**Guards aplicados a todos los endpoints del módulo**:

- `@AuthGuard()` — valida JWT Auth0 y resuelve `core.user` (provisto por `auth`).
- `@Permissions(...)` o `@SuperadminOnly()` según endpoint — ver matriz en D6.
- **No** se aplica `@TenantGuard()` global al módulo `audit`: la lógica de scoping es *dual* (superadmin cross-tenant vs org-admin single-tenant) y se resuelve dentro del handler. Ver "Tenant scoping".
- **No** se aplica `@ModuleEnabled(...)` — `audit` no es un módulo de negocio habilitable por organización; es infraestructura siempre-activa.

Códigos HTTP comunes:

- **400**: error de validación de query params (formato de cursor, timestamps inválidos, combinaciones imposibles).
- **401**: JWT ausente o inválido.
- **403**: auth válida pero sin permiso (o intento de org-admin leyendo eventos de otra org / `organization_id IS NULL`).
- **404**: evento inexistente **o fuera de scope** (para `GET /events/:id`, no se diferencia — evita leak de existencia).

### Endpoints

| Método + Path | Propósito | Guards | Request | Response | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/audit/events` | Lista eventos con filtros y paginación cursor-based. Default: orden `occurred_at DESC`. | `@AuthGuard`, **OR** `@SuperadminOnly` **OR** `@Permissions('audit:read')` | query: `ListAuditEventsQueryDto` | `AuditEventListDto` | 200, 400, 403 |
| `GET /api/v1/audit/events/:id` | Detalle de un evento. Útil para deep-link desde la UI. | `@AuthGuard`, **OR** `@SuperadminOnly` **OR** `@Permissions('audit:read')` | — | `AuditEventDto` | 200, 403, 404 |

**Nota sobre la expresión del guard "OR"**: se implementa como un guard compuesto `@AuditReadAccess()` que el módulo `audit` expone. Internamente hace `isSuperadmin(ctx) || hasPermission(ctx, 'audit:read')`. No se apila `@SuperadminOnly` con `@Permissions` porque el apilamiento default es AND (per 0002). Esto es un patrón nuevo; el ADR lo declara y `audit` provee el decorator (ya que es el único módulo que lo necesita).

### Query filters: `ListAuditEventsQueryDto`

```ts
// shared-types/src/audit/list-audit-events.query.ts
export interface ListAuditEventsQueryDto {
  // Filtros de entidad
  entityType?: string;              // ej. 'okr.task'
  entityId?: string;
  actorId?: string;
  organizationId?: string;          // IGNORADO si el caller es org-admin (se fuerza a su org)
  action?: string;                  // ej. 'task.progress.updated'

  // Filtros temporales (ISO-8601, UTC)
  occurredAfter?: string;
  occurredBefore?: string;

  // Paginación cursor-based
  limit?: number;                   // default 50, max 200
  cursor?: string;                  // opaque; encoded `${occurredAt}|${id}` base64
}
```

- Paginación: **cursor-based** sobre `(occurred_at DESC, id DESC)`. Preferida sobre offset porque `audit.event` es append-only y crece indefinidamente — offset grande degrada; cursor es estable O(log n) con el índice.
- `limit` default 50, max 200. Mayor que eso requiere request separado (UI paginada).
- El cursor es **opaco** para el cliente (base64 de `${occurredAt_iso}|${id}`). Esto desacopla el contrato de la implementación; si más adelante se cambia el orden a `occurred_at ASC` para algún caso, el encoding cambia sin romper la DTO pública.

### Response shape: `AuditEventDto` y `AuditEventListDto`

```ts
// shared-types/src/audit/audit-event.dto.ts
export interface AuditEventDto {
  id: string;
  occurredAt: string;               // ISO-8601 UTC
  actorId: string;
  actorEmail: string;               // denormalizado para UI — ver nota abajo
  organizationId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  diff: Record<string, unknown>;    // JSONB libre; la UI interpreta según entity_type
  requestId: string;
}

export interface AuditEventListDto {
  items: AuditEventDto[];
  nextCursor: string | null;        // null cuando no hay más páginas
}
```

**Decisión sobre `actorEmail` denormalizado en la DTO**: se incluye. Trade-off evaluado:

- **Incluirlo (elegido)**: un `LEFT JOIN core.user` en el query del endpoint. 1 join por page de 50 items, indexado por PK. Costo: ~1 ms extra. Beneficio: la UI muestra el email directo sin hacer N llamadas `/users/:id` (o 1 `/users?ids=...`).
- **No incluirlo**: DTO más pura (solo IDs). Trade-off desfavorable dado que el caso de uso primario es una tabla en backoffice que muestra "quién hizo qué".

`actorEmail` **no** se persiste en `audit.event`. Se resuelve por JOIN en el endpoint. Si un usuario cambia su email entre el evento y la lectura, la tabla muestra el email actual (no el histórico). Esto es consistente con cómo se muestra el display name en otros lugares de la UI; el `actor_id` sigue siendo la fuente de verdad inmutable.

### Nuevos permission keys declarados por este ADR

| Permiso | Capacidad |
|---|---|
| `audit:read` | Leer eventos de la organización corriente (solo aquellos con `organization_id = AuthContext.organizationId`). Default del rol `org-admin`. |
| `audit:read:all` | Leer **todos** los eventos cross-tenant, incluidos los de `organization_id IS NULL`. Implícito en `is_superadmin = true`. Reservado para un rol "auditor externo" futuro sin necesidad de `is_superadmin`. |

**Ubicación del seed**: `auth.permission` (tabla seedeada por ADR 0004). Este ADR **declara** que los permisos existen; el ADR 0004 los **seedea** junto con el resto. Ver "Auth0 → local RBAC mapping".

---

## Decisiones de diseño

### D1 — Propagación de transacción: **AsyncLocalStorage** (opción b)

**Decisión**: `AuditEventEmitter.emit(event)` — **sin** argumento `tx` — lee el `PrismaClient` transaccional activo desde una `TransactionContextStorage` (AsyncLocalStorage). Un wrapper sobre `prisma.$transaction` popula la ALS al entrar y la limpia al salir.

Shape del wrapper:

```ts
// Ilustrativo
class PrismaService {
  async runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return transactionContextStorage.run(tx, () => fn(tx));
    });
  }
}
```

Los callers usan `prismaService.runInTransaction(async (tx) => { ... })` en lugar de `prisma.$transaction`. El `tx` sigue disponible como parámetro para queries explícitas; el emitter simplemente no lo necesita como argumento.

**Alternativa A (descartada) — Explicit tx argument (`emit(event, tx)`)**:

- Pro: acoplamiento visible en cada call site.
- Contra: cada caller tiene que cablear el `tx` manualmente a través de posibles capas (service → event-adapter → emitter). En `okr`, la secuencia canónica (0001, paso 5) es `AuditEventEmitter.emit(..., tx)` — funcionaría, pero multiplica el ceremonial.
- Contra: obliga a servicios de negocio a "conocer" Prisma para poder pasar el tx — mezcla niveles de abstracción.

**Alternativa B (elegida) — ALS**:

- Pro: `emit(event)` queda limpio en todos los call sites; el contexto transaccional fluye implícitamente por el mismo mecanismo que ya gobierna `AuthContext` (TenantContextStorage). **Homogeneidad con el patrón establecido en 0001** (ALS para tenant).
- Pro: si un día aparece un outbox o un segundo consumer transaccional, la ALS ya lleva el tx — no hay que tocar call sites.
- Contra: "magia" implícita. Se mitiga documentando que `emit()` **falla fuerte** si la ALS no tiene tx (lanza `NoActiveTransactionError`, no hace fallback a non-tx).

**Consistencia con ALS de tenant de 0001**: 0001 ya introdujo una ALS para `AuthContext` y 0002 confirmó `TenantContextStorage` como artefacto público owned por `auth`. Este ADR **formaliza** que el sistema tiene tres ALS separadas (ver D10) y que añadir una para tx es la evolución natural del patrón.

**Incertidumbre**: media. Si aparece un caller que deliberadamente quiere emitir un evento **fuera** de una transacción (imposible en MVP, pero teorizable en un job async), este diseño lo rechaza. Aceptable por diseño — el evento fuera de tx sería un anti-patrón ante el contrato "audit es el system of record".

### D2 — Enforcement del append-only: **trigger + REVOKE** (defense in depth)

**Decisión**: ambos.

- **Trigger** `BEFORE UPDATE OR DELETE ON audit.event` que hace `RAISE EXCEPTION` con código `42501` (insufficient_privilege). Funciona **independientemente del rol** que conecte a la DB.
- **`REVOKE UPDATE, DELETE, TRUNCATE ON audit.event FROM <app_role>`** — el rol que la instancia Nest usa en runtime pierde el privilegio. Cualquier intento de `UPDATE`/`DELETE` falla en el planner antes de llegar al trigger.

**Alternativa A (descartada) — Solo trigger**: suficiente funcionalmente; sin embargo, deja la ventana de que un `TRUNCATE` del DBA en una window de mantenimiento destruya el trail. El `REVOKE` de `TRUNCATE` cierra esa puerta para el `<app_role>` (el DBA puede elevar privilegios explícitamente si realmente lo necesita).

**Alternativa B (descartada) — Solo `REVOKE`**: depende del rol con que se conecte; si accidentalmente un operador conecta con superuser (ej. psql interactivo), el `REVOKE` no protege. El trigger sí.

**Alternativa C (descartada) — Solo check app-layer** (p.ej. un Prisma middleware que bloquee UPDATE sobre `audit.event`): insuficiente, documentado como tal. Cualquier bug en repos, una migración que accidentalmente use `prisma.auditEvent.updateMany`, un psql adhoc o un path de código que burle el middleware, rompe la invariante. El punto del append-only es que **no depende del código de aplicación**.

**Nota sobre migraciones ordinarias**: una vez creada la tabla, Prisma Migrate **no genera** `UPDATE`/`DELETE` sobre `audit.event` automáticamente (no hay columnas "computadas" que Prisma recalcule; los cambios de schema de Prisma son DDL, no DML). Si una migración futura necesita backfill de una columna nueva, requiere un script explícito ejecutado con el `<migration_role>` — y ahí, si realmente hay que "corregir" data histórica, se hace emitiendo un evento compensatorio, **no** mutando filas antiguas.

**Incertidumbre**: baja. El patrón trigger + REVOKE es estándar para tablas "cold append" en Postgres.

### D3 — Schema TypeScript de `DomainEvent`: **discriminated union por `action`**

**Decisión**: el tipo `DomainEvent` es una **discriminated union por `action`** (string literal). `entity_type` es redundante respecto a `action` (cada `action` implica un único `entity_type`), pero se incluye en el payload para que el índice DB `(entity_type, entity_id, ...)` sea útil sin parsear el `action`.

Shape mínima:

```ts
// shared-types/src/audit/domain-event.ts

// Common fields
interface BaseEvent<TAction extends string, TEntityType extends string, TDiff> {
  action: TAction;
  entityType: TEntityType;
  entityId: string;
  diff: TDiff;
  // actor_id, organization_id, request_id, occurred_at: inyectados por el emitter,
  // NO los provee el caller.
}

// OKR events (ADR 0001)
type TaskProgressUpdatedEvent = BaseEvent<
  'task.progress.updated',
  'okr.task',
  { before: { progressBp: number }; after: { progressBp: number } }
>;

type ObjectiveCreatedEvent = BaseEvent<
  'objective.created',
  'okr.objective',
  { before: null; after: { title: string; description: string | null; periodId: string } }
>;

// Core events (ADR 0002)
type OrganizationCreatedEvent = BaseEvent<
  'organization.created',
  'core.organization',
  { before: null; after: { slug: string; name: string; status: 'active' } }
>;

type UserSuperadminGrantedEvent = BaseEvent<
  'user.superadmin_granted',
  'core.user',
  {
    before: { isSuperadmin: false };
    after: { isSuperadmin: true };
    reason: 'bootstrap' | 'manual';
  }
>;

export type DomainEvent =
  | TaskProgressUpdatedEvent
  | ObjectiveCreatedEvent
  // ... todos los del catálogo 0001 + 0002
  | OrganizationCreatedEvent
  | UserSuperadminGrantedEvent;
```

**Discriminador: `action`** (no `entityType + action`):

- Pro: un solo campo de switch en los consumers (listeners, UI). Type-narrowing en TS es más limpio con un único discriminador.
- Pro: el espacio de `action` ya es globalmente único por convención (`<entity>.<verb>`); `entity_type` no agrega información discriminadora.
- Contra: si dos entidades tuvieran la misma `action` (no es el caso del catálogo actual, pero teorizable), habría que prefijar. La convención actual lo previene.

**Ubicación del tipo**: `packages/shared-types/src/audit/`. Consumido por:

- `apps/api/src/modules/audit/*` para tipar `AuditEventEmitter.emit(event: DomainEvent)`.
- `apps/api/src/modules/okr/events/*` y `apps/api/src/modules/core/events/*` para construir los payloads type-safe.
- `apps/web` para tipar el render del `diff` en el backoffice (`switch (event.action)` narrows el tipo del `diff`).

**El emitter agrega los campos de contexto** (`actorId`, `organizationId`, `requestId`, `occurredAt`, `id`) leyendo de las tres ALS. El caller solo construye la parte "qué pasó" (`action`, `entityType`, `entityId`, `diff`). Esto hace la firma `emit` ergonómica y evita que los callers se equivoquen al pasar contexto.

**Incertidumbre**: baja. El patrón discriminated-union + "service fills context" es estándar.

### D4 — Retención y partitioning: **una sola tabla en MVP; re-evaluar a 10M filas o 1 GB**

**Decisión**: MVP una sola tabla `audit.event`. Sin archival, sin partitioning, sin retention policy.

Trade-off aceptado:

- La tabla crece indefinidamente. Estimación (ver "Volumen estimado"): ~7 MB/año en perfil MVP; décadas hasta umbral.
- No hay archival automático de eventos viejos a cold storage.
- Sin retention policy, cualquier evento queda para siempre. Consistente con el principio append-only.

**Umbral de re-evaluación**: cuando cualquiera de los siguientes se cumpla, se abre un ADR dedicado:

- **10M filas** en `audit.event`.
- **1 GB** de tamaño físico.
- Degradación observable de queries `GET /audit/events` (p95 > 500 ms).

**Solución futura más probable (no se adopta ahora)**: PostgreSQL **partitioning por rango sobre `occurred_at`**, mensual o trimestral, usando `PARTITION BY RANGE (occurred_at)` declarativo de PG 10+.

- Ventajas: queries por rango temporal pegan solo las particiones relevantes; partition pruning es automático con el índice `idx_event_occurred_at`; drop de particiones viejas es cheap.
- Desventajas: las FKs cross-schema a `core.user` y `core.organization` en tablas particionadas tienen restricciones conocidas en PG (requieren que la FK incluya la columna de partición, o se usa `FOREIGN KEY` por partición individual). Complica la migración.
- Infra adicional: mantenimiento de particiones (crear la del trimestre siguiente). Se puede automatizar con `pg_partman` (extensión externa) o con un job interno. Ambos son complejidad que MVP no necesita.

**Alternativa descartada — archival a object storage (S3 / blob)**: eventos viejos exportados como Parquet a S3, con índice local solo de los últimos N meses. Atractivo pero prematuro: el flujo de auditoría puede requerir acceso inmediato a eventos de 5-10 años atrás; un archival con latencia de carga contraría ese requisito. Volver a él solo si el volumen empuja al punto de quiebre.

**Alternativa descartada — delete físico de eventos "viejos"**: incompatible con append-only. El sistema no ofrece borrado lógico ni físico de filas de `audit.event`.

**Incertidumbre**: alta — no por la decisión en sí (MVP no necesita partitioning), sino por **cuándo** se cruza el umbral. Depende de cuántas orgs y cuánto tráfico operativo real haya. La instrumentación mínima del ADR incluye monitoreo del tamaño de tabla (trivial con `pg_total_relation_size`); si crece más rápido que lo estimado, se adelanta el ADR de partitioning.

### D5 — Data model: ver sección "Data model" arriba.

Resumen de elecciones finales (consolidadas):

- Schema `audit`, tabla `event`, PK `id` cuid.
- `actor_id` NOT NULL, FK a `core.user(id)` ON DELETE RESTRICT.
- `organization_id` NULLABLE, FK a `core.organization(id)` ON DELETE RESTRICT.
- `entity_type` `VARCHAR(80)` con convención `<schema>.<entity>` — string libre, type-safety en TS.
- `entity_id` `VARCHAR(120)` — cubre cuids (25) y PKs compuestas de `core` (ej. `${userId}:${orgId}`).
- `action` `VARCHAR(80)` con convención `<entity>.<verb>`.
- `diff` `JSONB`, sin GIN index por default.
- `request_id` `VARCHAR(40)`.
- `occurred_at` `TIMESTAMPTZ` default `NOW()`.
- Cuatro índices (entity, actor, org, occurred_at).

### D6 — API de lectura: dos endpoints GET + matriz dual de autorización

**Decisión**: dos endpoints (`GET /events` con filtros + paginación, `GET /events/:id` para detalle). Matriz de autorización dual:

| Caller | Qué ve | Cómo se implementa |
|---|---|---|
| Superadmin (`AuthContext.isSuperadmin === true`) | **Todos** los eventos, cross-tenant, incluyendo `organization_id IS NULL`. | El handler **no** aplica filtro por `organization_id`. Respeta el filtro explícito del caller si viene en query params. |
| Caller con `audit:read` (rol `org-admin`) | **Solo** eventos con `organization_id = AuthContext.organizationId`. **No ve** eventos con `organization_id IS NULL`. | El handler **fuerza** `WHERE organization_id = :orgId` ignorando cualquier valor de `organizationId` en query params. |
| Todo lo demás | 403. | El decorator compuesto `@AuditReadAccess` rechaza antes de entrar al handler. |

**Endpoint `GET /events/:id`**: misma matriz. Si el evento existe pero su `organization_id` ≠ al del caller (o es `NULL` y el caller no es superadmin), se responde **404**, no 403 — evita leak de existencia (consistente con 0001/0002 edge case de leak: "no filtrar información").

**Paginación cursor-based**: preferida sobre offset porque:

- `audit.event` es append-only; offset grande escalea O(n) mientras el cursor (con el índice) es O(log n).
- Consistencia: si el cliente pagina y mientras tanto se insertan nuevos eventos, offset puede duplicar o saltear; cursor basado en `(occurred_at, id)` es estable.

**Por qué no hay un endpoint `POST /events`**: el módulo es write-by-others. La única vía de inserción es `AuditEventEmitter.emit()` llamado por `okr`, `core` (y futuros módulos). Exponer un POST público sería un vector de inyección de eventos arbitrarios — anti-patrón grave.

**Por qué no hay filtros más sofisticados (agregaciones, búsqueda full-text)**: fuera de alcance MVP. Si el equipo legal pide forensics sofisticado (búsqueda por contenido de `diff`, reportes agregados), se agrega en ADR dedicado con índices GIN sobre `diff` y/o una vista materializada.

**Lecturas no se auditan**: el `GET /audit/events*` **no** emite eventos. Consistente con la regla general (0001, 0002: "no auditado: lecturas (`GET`)"). Si aparece requisito de "forensics de quién leyó el audit log", se diseña en un ADR dedicado; en MVP se deja explícitamente fuera.

**Incertidumbre**: media sobre si el org-admin realmente necesita acceso al audit log en MVP. Si el dueño del producto lo rechaza, el endpoint queda solo para superadmin (`@SuperadminOnly`) y `audit:read` se seedea pero sin ser asignado a ningún rol. El shape del ADR no cambia.

### D7 — Garantía de atomicidad: **el emitter NO atrapa excepciones**

**Decisión**: si el INSERT sobre `audit.event` falla, el `AuditEventEmitter.emit()` **propaga** la excepción sin atraparla. El `$transaction` del caller hace rollback completo de **toda** la operación (mutación de negocio + audit event).

**Razón**: `audit` es el **system of record**. La invariante es "si hay mutación, hay trail". Atrapar el error del audit y seguir como si nada contradiría esa invariante — quedaría data mutada sin audit. Es preferible devolver 5xx al cliente y que el operador re-ejecute, que persistir data sin trail.

**Esto es opuesto al patrón de logging de aplicación** (best-effort, fail-silent). El ADR lo declara explícitamente:

> El emitter no atrapa excepciones del INSERT sobre `audit.event`. Cualquier error propaga al `$transaction` del caller y dispara rollback completo de la operación. Esto es **opuesto** al patrón de logging de aplicación (best-effort) porque el audit log **es el system of record**: sin audit, no hay mutación; es preferible devolver 5xx que persistir data sin trail.

**Tipos de error esperados que podrían hacer fallar el INSERT**:

1. **Violación de NOT NULL**: el caller omitió un campo requerido del `DomainEvent`. Indica bug del caller; TS debería prevenirlo (D3), pero DB lo corta en runtime.
2. **Violación del trigger append-only**: imposible en flujo normal (el emitter hace INSERT). Si ocurre, indica corrupción o abuso severo.
3. **FK violation**: `actor_id` no existe en `core.user`, o `organization_id` no existe en `core.organization`. Indicaría bug en `AuthContext` (user sintético) — extremadamente improbable si `auth` funciona bien.
4. **Falla de conexión a DB / timeout**: el caller ya habría fallado antes del emit.

**Logging estructurado**: cuando el emit falla, el módulo `audit` (via un interceptor de excepción específico o via el logger global de Nest) emite un **log estructurado** con al menos:

- `requestId` (correlación con el cliente).
- `action` intentado.
- `entityType` + `entityId`.
- `errorCode` y stack.

Este log va al stdout / logging stack (NO a `audit.event` — porque el INSERT ahí es justo lo que falló). Sirve para que operaciones pueda diagnosticar. Queda documentado que `audit` **no** se autoaudita ante errores (la falla del trail de auditoría va al log de aplicación general, no al trail de auditoría).

**Impacto sobre el caller**: el exception filter global del módulo `okr` (y `core`) mapea el error a HTTP 500 con payload `{ error: 'AuditEmitFailed', requestId }`. El cliente retentar con idempotency si la operación lo soporta, o eleva al operador. **Lo que NO pasa**: nunca se devuelve 200 con data mutada y sin trail.

**Incertidumbre**: baja. La decisión es una consecuencia directa del "audit append-only is system of record".

### D8 — Correlación de requests (`request_id`): **interceptor global en `apps/api/src/common/`, owned by `audit`**

**Decisión**: un NestJS **interceptor global** `RequestContextInterceptor` que al inicio de cada HTTP request:

1. Lee el header `X-Request-Id`. Si viene con valor válido (1..40 chars, alfanumérico + `-`), lo usa.
2. Si no viene, **genera un `cuid`** y lo publica en el header de respuesta `X-Request-Id: <value>` (útil para que el cliente lo cite en tickets de soporte).
3. Popula `RequestContextStorage` (AsyncLocalStorage propia) con `{ requestId }`.

`AuditEventEmitter.emit()` lee el `request_id` de `RequestContextStorage`, no del caller. Mismo patrón que la resolución de `actor_id` desde `TenantContextStorage` (D9).

**Ubicación del interceptor**: `apps/api/src/common/interceptors/request-context.interceptor.ts`. **Ownership**: el módulo `audit`.

**Justificación de la ubicación**:

- **Físicamente en `apps/api/src/common/`**: es infraestructura transversal, no de un módulo de dominio. Necesita estar disponible globalmente para todos los controllers (no solo los que emiten audit). `common/` es el lugar canónico para guards/interceptors/filters globales per CLAUDE.md.
- **Ownership de `audit`**: el concepto de "request correlation para el audit trail" es propiedad semántica de `audit`. `audit.event.request_id` es el campo que el interceptor sirve; si cambia el shape del `request_id` o la política de generación, el cambio es local a `audit`. El interceptor se **registra** en `main.ts` (o en un module global), pero la **clase** vive bajo el control de `audit`.

Concretamente: `apps/api/src/modules/audit/request-context/request-context.interceptor.ts` es el archivo owned por `audit`. `apps/api/src/common/` puede re-exportarlo si conviene estilísticamente, pero la source of truth está en `audit`. `AuditModule` lo expone en su `index.ts` para que `main.ts` lo registre como global.

**Alternativa descartada — interceptor owned by `apps/api/src/common/` sin ownership de módulo**: deja el código "flotando" sin dueño. Si un día alguien quiere cambiar el formato del `request_id` o agregar un trace_id de OpenTelemetry, no hay ADR que diga dónde; queda disperso.

**Alternativa descartada — middleware en lugar de interceptor**: middleware corre **antes** que los guards; interceptor corre **alrededor** del handler. Para popular una ALS que solo necesita estar viva durante el handler, cualquiera de los dos funciona. Se elige **interceptor** por consistencia con NestJS idioms y para facilitar testeo (los interceptors de Nest se testean con el mismo framework que los guards).

**Incertidumbre**: baja. El patrón es estándar en Nest.

### D9 — Resolución de `actor_id`: **desde `TenantContextStorage` (ALS)**

**Decisión**: `AuditEventEmitter.emit()` lee `actor_id` desde `TenantContextStorage.get().userId` (ALS owned por `auth`, populada en `AuthGuard`).

**Justificación**: `TenantContextStorage` ya existe (asumido en 0001, confirmado en 0002) y ya vive poblada durante toda la request autenticada. Pasarle `actor_id` explícito al emit sería redundante y propenso a error (un caller que pase el `actor_id` equivocado contamina el trail). Resolverlo desde ALS cierra la puerta a esa categoría de bug.

**Alternativa descartada — caller pasa `actor_id` explícito**: más ceremonia, sin ganancia. Mezcla concerns (el servicio de negocio no debería saber "qué usuario emitió"; eso es infraestructura).

**Edge case: operaciones sin request HTTP autenticada**

En MVP, **todos** los eventos se emiten dentro de una request HTTP autenticada. Incluye:

- **Bootstrap del primer superadmin** (ADR 0002 D5): ocurre dentro del **primer login** del user que cumple el criterio (env `CORE_BOOTSTRAP_SUPERADMIN_EMAIL`). Ese login **es** una request HTTP autenticada, el `AuthGuard` popula `TenantContextStorage` con el `userId` del propio user que se auto-promueve. El evento `user.superadmin_granted` tiene `actor_id = user.id` (el mismo), con `diff.reason = 'bootstrap'`.
- Todas las mutaciones de OKR y Core: por construcción dentro de controllers autenticados.

**Fuera de alcance MVP** (decisión diferida):

- Jobs background / crons (ej. auto-close de periods cuando se implemente).
- Import batch sin usuario humano detrás.
- Workers async reaccionando a eventos externos.

Cuando aparezcan, un ADR futuro decide entre:

- Crear un `core.user` "system" (`auth0_sub = 'system'`, `is_superadmin = false` o una flag específica) y poblar `TenantContextStorage` manualmente en el entry-point del job.
- Relajar `actor_id` a NULLABLE — requiere cambiar el schema.

**Hoy**: `actor_id NOT NULL` (D5) cierra esa puerta deliberadamente. Si alguien intenta emitir un evento sin `AuthContext` en la ALS, el emitter lanza `MissingActorError` antes del INSERT.

**Incertidumbre**: baja en MVP, media para futuro (depende de qué jobs aparezcan).

### D10 — Asimetrías entre los tres ALS contexts: **tres ALS separadas, con ownership clara**

**Decisión**: tres `AsyncLocalStorage` instancias separadas:

| ALS | Shape | Lifecycle | Ownership | Se popula en |
|---|---|---|---|---|
| `TenantContextStorage` | `{ userId, organizationId, permissions[], isSuperadmin }` | Request-scoped | Módulo `auth` (ADR 0004) | `AuthGuard` + `TenantGuard` |
| `RequestContextStorage` | `{ requestId }` | Request-scoped | Módulo `audit` (este ADR, D8) | `RequestContextInterceptor` (global) |
| `TransactionContextStorage` | `{ tx: TxClient }` | Transaction-scoped (más corto que request) | Módulo `audit` (este ADR, D1) | Wrapper `PrismaService.runInTransaction` |

**Alternativa descartada — ALS compuesta (una sola)**:

Shape: `RequestContext = { auth, tenant, tx, requestId }`, todo en una ALS.

- Pro: un solo storage, menos boilerplate, menos imports.
- Contra: **mezcla lifecycles**. `auth` y `requestId` son request-scoped (populados una vez al inicio, viven hasta el final de la request). `tx` es transaction-scoped (más corto — múltiples txs pueden existir secuencialmente dentro de una request). Meter ambos en la misma ALS obliga a razonar sobre "¿el tx actual sigue siendo el que creí?" en cada emit. Con ALS separadas, cada una tiene su propio lifecycle y se pisa solo cuando semánticamente corresponde.
- Contra: **mezcla ownership**. `auth` es dueño del contexto de identidad; `audit` es dueño del contexto de request y tx. Forzar a ambos a vivir en el mismo storage acopla los módulos.

**Se prefieren tres ALS separadas**. El costo de boilerplate es marginal: `emit()` hace tres lecturas de ALS al construir el evento, todas en memoria local del thread, costo O(1).

**Orden de inicialización en el ciclo de una request**:

1. **Interceptor global `RequestContextInterceptor`** corre primero. Popula `RequestContextStorage` con `{ requestId }`. Lifecycle: request entera.
2. **`AuthGuard`** valida JWT, resuelve `core.user`, popula **parcialmente** `TenantContextStorage` con `{ userId, isSuperadmin, permissions[] }`. `organizationId` queda `undefined` acá.
3. **`TenantGuard`** (si aplica al endpoint) completa `TenantContextStorage.organizationId` desde el header / claim / param. Los endpoints `@SuperadminOnly` cross-tenant pueden omitir `TenantGuard`; en ese caso `organizationId` queda `undefined` y el emitter escribe `organization_id = NULL`.
4. **Handler del controller** corre. Si hace `prismaService.runInTransaction(async (tx) => { ... })`, el wrapper popula `TransactionContextStorage` con `{ tx }`. Lifecycle: solo mientras la transacción esté activa.
5. **`AuditEventEmitter.emit(event)`** lee de las tres ALS:
   - `actorId` ← `TenantContextStorage.get().userId` (D9).
   - `organizationId` ← `TenantContextStorage.get().organizationId ?? null` (D9 + 0002 edge case).
   - `requestId` ← `RequestContextStorage.get().requestId` (D8).
   - `tx` ← `TransactionContextStorage.get().tx` (D1). Si es `undefined`, lanza `NoActiveTransactionError`.

**Failure modes y mensajes claros**:

- `MissingActorError` — el emit corre fuera de una request autenticada (no hay `TenantContextStorage`). Ver D9.
- `MissingRequestContextError` — el emit corre fuera de una request con el interceptor (no hay `RequestContextStorage`). Debería ser imposible si el interceptor está global; si pasa, es bug de wiring.
- `NoActiveTransactionError` — el emit corre fuera de una transacción. Contrato violado; ver D1.

Cada uno es una exception tipada que el emitter lanza; el global exception filter las mapea a 500 con `requestId` (si está disponible) para debug.

**Incertidumbre**: baja respecto a "tres ALS separadas vs una". Media respecto a la ergonomía: si en código real aparece boilerplate molesto (p.ej. tests que tienen que popular tres ALS para testear una feature), se provee un helper `withTestContext({ auth, request, tx }, fn)` que popula las tres. Se deja para cuando aparezca la molestia; no se anticipa.

---

## Module boundaries

### El módulo `audit` es dueño de

- Schema Postgres `audit` y tabla `audit.event`.
- Trigger `audit.reject_event_mutation` y sus dos attachments.
- Servicio `AuditEventEmitter`.
- Endpoints `GET /api/v1/audit/events` y `GET /api/v1/audit/events/:id`.
- `RequestContextInterceptor` y `RequestContextStorage` (D8).
- `TransactionContextStorage` y el wrapper `PrismaService.runInTransaction` (D1).
- Decorator compuesto `@AuditReadAccess` (D6).
- Tipos `DomainEvent`, `AuditEventDto`, `AuditEventListDto`, `ListAuditEventsQueryDto` en `packages/shared-types/src/audit/`.

### `audit/index.ts` exporta

- `AuditModule` (el NestJS module).
- `AuditEventEmitter` (clase / inyectable).
- `RequestContextInterceptor` (para registro global en `main.ts`).
- `RequestContextStorage`, `TransactionContextStorage` (para tests y para el wrapper).
- `PrismaService.runInTransaction` (si vive en `audit`) o re-export del helper si vive en un paquete aparte.
- `@AuditReadAccess()` decorator.
- Re-export de tipos desde `shared-types/src/audit/` (por ergonomía del consumer; la source of truth sigue siendo `shared-types`).

### `audit` **consume** de `auth` (ADR 0004, pendiente)

- `AuthGuard`, `SuperadminOnly`, `Permissions`, `CurrentUser`, `AuthContext` tipo.
- `TenantContextStorage` (la ALS de auth).
- El servicio que resuelve permisos por request (para que `@AuditReadAccess` pueda preguntar `hasPermission(ctx, 'audit:read')`).

### `audit` **consume** de `core` (ADR 0002)

- FK schema-level a `core.user(id)` y `core.organization(id)`. **No** consume servicios de `core` directamente para operaciones internas del emitter.
- Para enriquecer `actorEmail` en el response del endpoint `GET /events`, el handler hace un `LEFT JOIN core.user` en la query Prisma. Esto se considera acceso de lectura read-only y no rompe boundaries (no hay escritura a `core` desde `audit`, y el join está en un query de `audit`, no en un import de service).

### Prohibiciones

- Otros módulos **no** hacen `prisma.auditEvent.create()`, `prisma.auditEvent.createMany()`, ni acceso directo a `audit.event` por Prisma o raw SQL. La única vía es `AuditEventEmitter.emit()`. Esto ya estaba declarado en 0001 (sección "Forbidden imports") y 0002 (sección "Module boundaries"); este ADR lo reafirma.
- `audit` **no** importa de `okr` ni de ningún módulo de negocio. Los tipos `DomainEvent` para las actions de OKR y Core viven en `shared-types`, que es neutral.
- `audit` **no** importa servicios internos de `auth` ni de `core`: solo superficie pública (`AuthGuard`, `TenantContextStorage`, etc.).

### `audit` **no** usa la Prisma tenant extension

- `audit.event` **no está en `TENANT_SCOPED_MODELS`**. Razones:
  - `organization_id` NULLABLE — la extension por construcción exige el valor y fallaría al insertar eventos cross-tenant (`user.superadmin_granted`, `user.created`, etc.).
  - El scoping para **lecturas** se hace explícitamente en los handlers (ver D6 y "Tenant scoping"), no vía extension.
  - Para **escrituras**, el emitter escribe `organization_id` desde `TenantContextStorage` (o `NULL` si el contexto no tiene `organizationId`, caso superadmin o eventos de sistema).
- La invariante "ningún repo de negocio escribe directo en `audit.event`" se apoya en las prohibiciones de module boundaries, no en la extension.

---

## Cascade math placement

N/A. El módulo `audit` no tiene aritmética de cascada. El shape de `diff` puede contener números (progresos, pesos) pero `audit` los trata como opacos `JSONB`; la interpretación es del consumer (UI).

---

## Auth0 → local RBAC mapping

### Claims Auth0 consumidos

**Ninguno específico** de `audit`. El módulo reutiliza el `AuthContext` populado por `AuthGuard` (ADR 0004); no lee claims del JWT directamente.

### Permission keys introducidos

| Permiso | Capacidad |
|---|---|
| `audit:read` | Leer eventos de la organización corriente del caller. |
| `audit:read:all` | Leer **todos** los eventos cross-tenant, incluyendo `organization_id IS NULL`. Implícito en `is_superadmin = true`; reservado también para un rol "auditor externo" futuro. |

**Ubicación del seed**: tabla `auth.permission` (seedeada por ADR 0004, pendiente). Este ADR **declara** que los permisos existen y documenta su semántica; ADR 0004 los **seedea** en la migración de permisos junto con `okr:*` y `core:*`.

### Mapping rol → permisos (default que espera `audit`; source of truth en `auth`)

| Rol | Permisos de `audit` |
|---|---|
| `org-reader` | — (sin acceso a audit en MVP) |
| `org-user` | — (sin acceso a audit en MVP) |
| `org-admin` | `audit:read` |
| Superadmin (flag `is_superadmin`) | `audit:read:all` implícito (no requiere entrada en `auth.role_permission`) |
| `external-auditor` (rol futuro, no MVP) | `audit:read:all` sin `is_superadmin` |

### Decorators por endpoint

Ambos endpoints usan el decorator compuesto `@AuditReadAccess()` que el módulo `audit` expone. Internamente: `isSuperadmin(ctx) || hasPermission(ctx, 'audit:read')`. Si alguno es verdadero, pasa; si no, 403.

`@AuditReadAccess()` se aplica en AND con `@AuthGuard()` (que siempre es mandatorio).

### Política ante claims drift

Consistente con 0001 y 0002: permisos **siempre se resuelven en DB por request**, no desde claims custom del JWT. El `AuthContext` que `audit` consume ya trae `permissions[]` resuelto por `auth`; `audit` no hace lookup adicional.

### Faltantes para ADR 0004

Ver sección "Impact → Faltantes para ADR 0004 (auth)" más abajo.

---

## Tenant scoping

### Cómo fluye `organizationId`

**Para escrituras** (emit):

```
JWT → AuthGuard → TenantContextStorage.organizationId
                                    ↓
                    AuditEventEmitter.emit()
                                    ↓
        audit.event.organization_id = TenantContextStorage.get().organizationId ?? null
```

- Si el handler está bajo un endpoint tenant-scoped (tiene `@TenantGuard`), `organizationId` viene de ahí — el evento escribe `organization_id` con valor.
- Si el handler está bajo un endpoint `@SuperadminOnly` cross-tenant (ej. `POST /orgs`), `TenantContextStorage.organizationId` puede ser `undefined`, y el evento escribe `organization_id = NULL`. Esto es correcto para eventos "de sistema" (`user.superadmin_granted`, `organization.created` cuando se dispara desde un contexto cross-tenant — aunque el evento `organization.created` específicamente carga `org.id` como `organization_id` per 0002, ver edge case abajo).

**Para lecturas** (`GET /events*`):

- El handler implementa la matriz de D6 **sin** la Prisma tenant extension:
  - Superadmin: sin filtro de `organization_id`.
  - `audit:read`: filtro forzado `WHERE organization_id = TenantContextStorage.get().organizationId`.
- `audit.event` **no está en `TENANT_SCOPED_MODELS`** (ver "Module boundaries").

### Edge cases

- **`POST /orgs` (crea org + first period, 0002 D8-c)**: se dispara desde contexto superadmin cross-tenant; el `TenantGuard` no corre (ADR 0002 "Edge cases → `POST /orgs`"). Los eventos emitidos en esa transacción (`organization.created`, `period.created`) llevan `organization_id = org.id` (explícito, per la tabla de eventos de 0002), **no** `NULL`. **Cómo se logra**: el caller puede construir el payload del `DomainEvent` con `entityType` y `entityId` del evento; el `organizationId` del evento no se toma automáticamente del `TenantContextStorage` (que estaría vacío en cross-tenant) sino de un override explícito. **Refinamiento al contrato del emitter**: se admite un segundo shape opcional:
  ```ts
  emit(event: DomainEvent): Promise<void>;
  emit(event: DomainEvent, override: { organizationId: string | null }): Promise<void>;
  ```
  Por default el emitter usa ALS; el override solo se usa en endpoints cross-tenant que necesitan atribuir el evento a una org específica (`POST /orgs`, `POST /orgs/:id/modules/:key/enable`, etc.). El override **no** toca `actorId` ni `requestId` — siguen viniendo de ALS.

- **Eventos de sistema con `organization_id IS NULL`**: `user.created`, `user.updated`, `user.superadmin_granted`, `user.superadmin_revoked`. Estos se emiten **sin** override; el `TenantContextStorage.organizationId` es `undefined` (porque el primer login ocurre antes de que el user tenga org), y el emit escribe `NULL`. Visibilidad: solo superadmin (D6).

- **Lecturas cross-tenant**: solo superadmin puede hacer `GET /events` sin filtro de org. Para `audit:read`, el filtro es mandatorio y se aplica dentro del handler.

### Confirmación

- Ningún repository de `audit` hace queries sin filtro de `organization_id` **excepto** cuando el caller es superadmin. Esa excepción se expresa explícitamente en el handler (no es bypass implícito de la extension).
- **Default deny**: todos los endpoints llevan `@AuthGuard` + `@AuditReadAccess`. Sin ambos, 401/403.

---

## Audit events

**El módulo `audit` no emite eventos propios.**

Razón: `audit` es write-by-others / read-by-admins. No tiene mutaciones de negocio propias (no hay `PATCH /events/:id`; no hay edición). Las únicas operaciones de escritura son los INSERTs que hacen otros módulos vía `AuditEventEmitter` — esos INSERTs ya **son** el trail; no tiene sentido meta-auditarlos.

Las lecturas (`GET /events`, `GET /events/:id`) **no se auditan**. Consistente con la regla general (0001, 0002): lecturas no producen eventos en MVP.

**Confirmación**: cero INSERTs, cero UPDATEs, cero DELETEs sobre `audit.event` originados en el propio módulo `audit`. Trivialmente append-only.

---

## Alternatives considered

Además de las alternativas internas a cada decisión D1–D10 (documentadas en esa sección), se evaluaron:

### A1. Event sourcing total

**Descartada**: usar `audit.event` como **single source of truth** del estado del sistema; el estado corriente de `okr` / `core` se reconstruye por replay del log. Razones:

- El audit log es **complementario** al estado corriente (OLTP), no lo reemplaza. `okr.task.progress_cached` se lee en queries de negocio O(1); reconstruir por replay sería O(eventos).
- Event sourcing obliga a que cada cambio de state model (p.ej. renombrar `progress_cached_bp` a `progress_bp_cached`) implique versionado de eventos y migration path — complejidad que MVP no necesita.
- La regla frozen "math vive en `okr-domain`, cascada se recalcula sincrónicamente" (0001) es incompatible con la asincronía típica del event sourcing.

El audit log es para **auditoría y forensics**, no para replay operacional. Se mantiene complementario.

### A2. Outbox pattern

**Descartada**: INSERT del evento en una tabla `outbox` dentro de la tx, worker async lo replica a `audit.event`. Ventajas típicas (desacople, resilencia ante failures del sink externo) no aplican porque el sink **es la misma DB**. Agrega un punto de fallo extra (el worker) sin ganancia clara. 0001 ya descartó event-driven async por "el usuario debe ver el estado final al terminar la operación".

### A3. Un audit log por schema (`okr.audit_event`, `core.audit_event`)

**Descartada**: cada módulo tiene su propia tabla de eventos.

- Pro: boundaries más fuertes; `okr` no depende de `audit`.
- Contra: fragmenta el trail. Consultas cross-módulo (ej. "qué pasó con el usuario X en toda la plataforma") requieren UNION de N tablas. Triplica el trabajo de agregar append-only enforcement. Pierde la ventaja principal de centralizar: **un único lugar** para la política de retención, auditoría forense, export a SIEM externo futuro.
- El trade-off de "boundary" se resuelve por el contrato de emitter: `okr` solo ve `AuditEventEmitter`, no toca la tabla; el módulo `audit` es infra, no dominio.

### A4. Persistir `actor_email` / `actor_displayName` denormalizado en `audit.event`

**Descartada**: grabar en cada row el email del actor al momento del evento.

- Pro: el trail es estrictamente inmutable (email histórico preservado, aún si el usuario cambia email después).
- Contra: duplica ~40-50 bytes por row (con 10M filas, 500 MB solo de emails). Agrega complejidad: si el user cambia email, ¿se actualiza en eventos viejos? NO (append-only), lo cual genera inconsistencia visual en la UI ("este email ya no existe").
- Trade-off: se prefiere **resolver por JOIN al leer** (D6). La identidad inmutable es `actor_id`; el email es presentación. Si aparece requisito forense de "qué email tenía el usuario en el momento X", se reconstruye del trail: `user.updated` ya captura los cambios de email (0002 tabla de eventos).

### A5. `entity_type` como enum Postgres

**Descartada**: enum DB con valores `'okr.objective' | 'okr.key_result' | ...`.

- Pro: type-safety a nivel DB.
- Contra: agregar un nuevo `entity_type` requiere `ALTER TYPE ADD VALUE`, que en Postgres no puede correr dentro de transacciones con otras operaciones y tiene issues de concurrent access. Cada módulo nuevo con eventos obligaría a una migración de ALTER al enum.
- Se prefiere `VARCHAR` + convención + type-safety TS (D3).

---

## Impact

### Migraciones requeridas

1. Crear schema Postgres `audit` si no existe.
2. Crear tabla `audit.event` con columnas, FKs, CHECKs e índices listados en "Data model".
3. Crear función `audit.reject_event_mutation()` y triggers `trg_event_no_update`, `trg_event_no_delete` (D2).
4. `REVOKE UPDATE, DELETE, TRUNCATE ON audit.event FROM <app_role>` (D2).
5. Orden de migraciones respecto a 0002: `core.user` y `core.organization` deben existir **antes** de aplicar `audit.event` (por FKs cross-schema). Orden total: `core` primero, `audit` después. Dentro de `auth` (ADR 0004), `auth.permission` se puede seedear independiente.

### Tests nuevos

- **Unit (`apps/api/src/modules/audit/__tests__/`)**:
  - `AuditEventEmitter.emit()` con mock de `PrismaService.auditEvent.create`:
    - Lee `actor_id`, `organization_id`, `request_id` de las tres ALS correctamente.
    - Lanza `NoActiveTransactionError` si `TransactionContextStorage` está vacía.
    - Lanza `MissingActorError` si `TenantContextStorage` está vacía.
    - **No** atrapa excepciones del Prisma client; propaga (D7).
  - `RequestContextInterceptor`: usa `X-Request-Id` de header si viene, genera cuid si no, agrega header de respuesta.
  - Decorator `@AuditReadAccess`: pasa si superadmin, pasa si `audit:read`, rechaza si ninguno.
  - Cursor de paginación: encode/decode estable; ordena por `(occurredAt DESC, id DESC)`.

- **Integration (`apps/api/test/`, testcontainers Postgres)**:
  - El INSERT de `AuditEventEmitter.emit()` corre dentro de la transacción del caller. Si el caller hace rollback, el evento **no** queda persistido.
  - Si el emit falla (p.ej. payload inválido — violación de NOT NULL), la transacción del caller hace rollback completo: la mutación de negocio tampoco persiste (D7).
  - Un `UPDATE` directo sobre `audit.event` falla con error del trigger (`ERRCODE 42501`, mensaje explícito).
  - Un `DELETE` directo sobre `audit.event` falla con el trigger.
  - El rol `<app_role>` no puede emitir `UPDATE`/`DELETE` ni `TRUNCATE`. El `<migration_role>` sí puede (para que migraciones de `ALTER TABLE ADD COLUMN` funcionen).
  - `GET /events`: filtros por cada campo funcionan; paginación cursor-based es estable al agregar nuevos eventos entre páginas.
  - Matriz D6: superadmin ve todos los eventos; org-admin solo ve los de su org; intento de org-admin de pasar `organizationId` de otra org es ignorado (el handler lo sobrescribe, no devuelve error).
  - Usuario sin `audit:read` ni `is_superadmin`: 403 en ambos endpoints.
  - `GET /events/:id` con id de otra org (siendo org-admin): 404 (no 403 — no leak).
  - Cross-schema FK: intentar INSERT con `actor_id` inexistente en `core.user` falla con FK violation, rollback del caller.

- **E2E (`apps/web`, Playwright)**:
  - Flujo: un org-admin crea un Objetivo; abre la página de "Actividad reciente" del backoffice; ve el evento `objective.created` listado con su email, timestamp y diff.
  - Un superadmin navega a "Audit log del sistema"; ve eventos cross-tenant, incluido el último `user.superadmin_granted`.

### Otros módulos afectados

- **`apps/api/src/main.ts`**: registrar `RequestContextInterceptor` como interceptor global (requiere `APP_INTERCEPTOR` provider en `AppModule` o `app.useGlobalInterceptors()`).
- **`okr`** (ADR 0001): el adaptador `apps/api/src/modules/okr/events/*` migra de la firma hipotética `emit(event, tx)` a `emit(event)` (tx viene de ALS). Cambio mecánico en call sites.
- **`core`** (ADR 0002): idéntico al cambio en `okr`. Los eventos cross-tenant (`organization.created`, `period.created` inicial, `organization_module.enabled/disabled`) usan el override `emit(event, { organizationId: orgId })` para atribuir explícitamente; los eventos sistema (`user.*`) usan `emit(event)` y caen a `organization_id = NULL`.
- **`packages/shared-types/src/audit/`**: se crea con los tipos `DomainEvent`, `AuditEventDto`, `AuditEventListDto`, `ListAuditEventsQueryDto`.

### Ajustes pendientes sobre ADRs previos

**Sobre ADR 0001 (OKR)**:

- La sección "Audit events → Campos comunes" dice `request_id: string // del middleware de tracing (opcional pero recomendado)`. Este ADR **eleva `request_id` a obligatorio**: viene del `RequestContextInterceptor` global (D8) y siempre está poblado. Se sugiere enmienda textual en 0001: "request_id: string, obligatorio, provisto por `RequestContextInterceptor` del módulo `audit` (ADR 0003)".
- La sección "Forma: secuencia canónica por mutación" dice `5. AuditEventEmitter.emit(..., tx)`. Este ADR **cambia la firma** a `emit(event)` (tx desde ALS, D1). Enmienda: "5. AuditEventEmitter.emit(event)". El tx sigue disponible en la ALS populada por `prismaService.runInTransaction`.
- La sección "Module boundaries" mencionaba que la ubicación del `AsyncLocalStorage` de transacción quedaba al ADR de `audit`. Queda **confirmada acá**: vive en `audit` como `TransactionContextStorage`.

Ninguno de estos ajustes cambia el contenido de los eventos ni las invariantes de cascada; son refinamientos de mecánica. Se dejan como enmiendas pendientes, **no** se escribe el parche en este ADR.

**Sobre ADR 0002 (Core)**:

- Confirma la decisión de `organization_id NULLABLE` en `audit.event`. Cero cambio textual necesario.
- La sección "Edge cases" de 0002 sugería que el emitter "recibe `organization_id` del evento explícitamente" para casos de sistema. Este ADR **refina**: por default viene de ALS; para casos cross-tenant donde el caller quiere atribuir a una org específica distinta de la del contexto (ej. `POST /orgs`), se usa el override `emit(event, { organizationId })`. Enmienda textual sugerida en 0002: reemplazar "recibe el `organizationId` del evento explícitamente" por "recibe el `organizationId` vía override explícito en el emit cuando el contexto cross-tenant lo requiere; caso contrario lee de `TenantContextStorage`".

### Faltantes para ADR 0004 (auth)

> **RESOLVED as of ADR 0004 (auth)**. All items below are delivered by ADR 0004. See ADR 0004 for: `AuthGuard`, `TenantGuard`, `ModuleEnabledGuard`, `@SuperadminOnly`, `@Permissions`, `@CurrentUser`, `AuthContext` type, `TenantContextStorage` (canonical, owned by `auth`), `hasPermission` helper, `auth.permission` / `auth.role` / `auth.role_permission` tables, seed of `audit:read` → `org-admin`, and declaration of `audit:read:all` reserved for future `external-auditor` role (seeded without assignments in MVP).

`audit` depende de que `auth` entregue:

- **Guards**: `AuthGuard` (valida JWT, resuelve `core.user`, popula `TenantContextStorage` con `userId` + `isSuperadmin` + `permissions[]`).
- **Decorators**: `SuperadminOnly`, `Permissions`, `CurrentUser`.
- **Tipo**: `AuthContext`.
- **ALS**: `TenantContextStorage`.
- **Servicio**: un método público que responda `hasPermission(context, permissionKey): boolean` — consumido por el decorator compuesto `@AuditReadAccess` de `audit`. (Alternativa: que `auth` exponga `@Permissions('audit:read')` y `audit` componga `@SuperadminOnly` OR eso a nivel Nest; queda a ADR 0004 elegir la forma ergonómica.)
- **Tablas**: `auth.permission`, `auth.role`, `auth.role_permission`.
- **Seeds**:
  - Permission keys `audit:read` y `audit:read:all` en `auth.permission`.
  - Asignación `audit:read` al rol `org-admin` en `auth.role_permission`.
  - `audit:read:all` **no** se asigna a ningún rol de MVP (queda disponible para `external-auditor` futuro). Superadmin hereda el acceso implícitamente vía `is_superadmin = true`.

---

## Consequences

### Trade-offs aceptados

- **Una sola tabla `audit.event`, sin partitioning**. La tabla crece indefinidamente; re-evaluable en 10M filas / 1 GB. Hasta entonces, la simplicidad gana.
- **Rollback transaccional si el INSERT de audit falla**. Un bug en el emitter (payload mal construido, conexión perdida) puede colgar operaciones de negocio y devolver 5xx al cliente. Preferible a persistir data sin trail.
- **`actor_id NOT NULL`**. Cierra la puerta al cron autónomo hasta que un ADR futuro lo relaje explícitamente. Jobs background no pueden emitir eventos en MVP.
- **`actorEmail` resuelto por JOIN al leer, no persistido**. Si un usuario cambia email, las vistas históricas muestran el email actual. Aceptable porque la identidad inmutable (`actor_id`) está preservada; la presentación no es la fuente de verdad.
- **`diff` JSONB sin índice GIN**. Búsquedas tipo "eventos donde cambió el campo X" son full table scan. Documentado; aceptable para MVP dado que el caso de uso primario es "historial de la entidad X" o "qué hizo el usuario X", ambos indexados.
- **Tres ALS separadas**. Levemente más boilerplate que una ALS compuesta, a cambio de ownership clara y lifecycles correctos.
- **Emit propaga excepciones**. Contrario al patrón de logging best-effort; requiere que el exception filter global mapee elegantemente a 5xx.

### Limitaciones conocidas

- **Sin dashboard de consultas avanzadas del audit log**. MVP solo ofrece filtros básicos y paginación. Si el equipo legal pide forensics sofisticado (agregaciones, búsqueda full-text en `diff`, reportes temporales), se diseña en un ADR dedicado.
- **`request_id` no cubre jobs background**. Solo requests HTTP. Cuando aparezcan workers async, el ADR futuro decide si generan su propio correlation id o reutilizan otro esquema.
- **Lecturas del audit log no se auditan**. "Quién leyó qué" no queda en el trail. Si aparece requisito de forensics de acceso, ADR dedicado.
- **No hay streaming a SIEM externo**. Integraciones con Kafka, Datadog, Splunk, etc. están fuera de alcance. Cuando se necesite, se agrega un consumer que lea `audit.event` y haga replay (la tabla es el canonical source).
- **Super-admin ve todo, incluidos eventos con `organization_id IS NULL`**. Esto incluye eventos sensibles como `user.superadmin_granted`. Aceptable: superadmin es el nivel más alto de confianza; si se necesita un "auditor externo sin privilegios de mutación", el rol `external-auditor` con `audit:read:all` lo cubre.

### Decisiones diferidas

- **Partitioning por `occurred_at`** (D4): al cruzar umbral.
- **Retention policy** (archival a cold storage, borrado físico de eventos antiguos): incompatible con append-only duro; cualquier movimiento requiere ADR que defina si es "archival" (mueve a otra tabla / S3, sigue accesible en read-only) o "delete" (rompe append-only).
- **Auditoría de lecturas** (forensics de quién consultó qué): ADR dedicado si hay requisito legal.
- **Eventos de sistema con `actor_id` NULL o un `core.user` "system"**: cuando aparezcan crons / jobs autónomos.
- **Export streaming a SIEM** (Kafka, S3, Datadog): ADR dedicado cuando haya requisito operativo.
- **Índices GIN sobre `diff`** para búsqueda por contenido: si emergen casos de uso.
- **Rol `external-auditor`**: seedea `audit:read:all` sin `is_superadmin`. ADR 0004 puede o no incluirlo; si no, se difiere.

---

## Conflicts with frozen rules

None detected.

Verificación punto por punto:

- **Module boundaries**: `audit` consume solo superficie pública de `auth` y FKs de `core`; exporta todo vía `index.ts`; otros módulos no tocan `audit.event` directo.
- **Multi-tenant**: el módulo implementa scoping explícito en handlers (no usa la Prisma extension porque `organization_id` es NULLABLE, fundado en 0002); las lecturas se filtran según la matriz D6; las escrituras leen `organizationId` de `TenantContextStorage`.
- **Audit log append-only**: enforced por trigger + REVOKE; sin UPDATE/DELETE desde ningún lugar del sistema; correcciones via eventos compensatorios.
- **Decimales**: no aplica. `audit.event` no almacena pesos ni porcentajes; el `diff` contiene números opacos (typed en TS via `DomainEvent`).
- **OKR frozen rules**: no aplica. `audit` no toca cascada OKR.
- **Default deny**: todo endpoint lleva `@AuthGuard` + `@AuditReadAccess`.
- **TypeScript estricto**: `DomainEvent` es discriminated union sin `any`.
- **Sin `Float`**: no aplica (no hay decimales en `audit.event`).
