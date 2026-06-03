# 0001 — Fundación del módulo OKR

**Status**: Accepted (pending ADR 0002-core, 0003-audit, 0004-auth, which may refine upstream contracts)
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-20
**Author**: architect subagent
**Spec**: docs/specs/okr-module.md

---

## Context and problem

El módulo OKR es el primer módulo funcional de `gestion-publica`. La spec (en revisión, con RN-01 a RN-31 cerradas por el dueño del producto) define el modelo Objetivo → KR → Tarea con cascada ponderada por pesos en basis points (bps), avance cargado solo a nivel Tarea, soft-delete con invariante de suma, period gating, audit log activo y multi-tenant desde el día 1.

Este ADR establece los cimientos técnicos del módulo `okr`:

- Modelo de datos (entidades, tipos de columna, índices, FKs, unique constraints).
- Contrato de API REST bajo `/api/v1/okr/...` con DTOs, guards y códigos HTTP.
- Boundaries del módulo NestJS `okr` y cómo **consume** (sin reimplementar) la superficie pública de `core`, `auth` y `audit`.
- Ubicación de la matemática de cascada (en `packages/okr-domain`, puro).
- Atomicidad del recálculo, política concurrente (RN-27), límites estructurales (RN-28) y proyección de suma ante soft-delete (RN-25).
- Mapeo Auth0 → RBAC local y tenant scoping end-to-end.
- Catálogo de eventos de audit emitidos por el módulo.

**Lo que este ADR no cubre**: diseño interno de `core` (Organization, Period, module-enablement), `auth` (Auth0 integration, RBAC) o `audit` (append-only store). Solo documenta el contrato público que `okr` consume de ellos; sus faltantes quedan listados en "Impact" para ADRs futuros.

Preguntas a responder:

1. ¿Dónde corre la aritmética de cascada y cómo la orquesta el service?
2. ¿Cómo se garantiza que el recálculo sea atómico (RN-04, RN-05, RN-07, RN-08, Notas de implementación)?
3. ¿Dónde y cómo se valida la invariante de suma = 10.000 bps?
4. ¿Cómo se bloquea el soft-delete que rompería la suma (RN-25)?
5. ¿Cómo se detectan y responden los conflictos concurrentes sin versionado explícito (RN-27)?
6. ¿Dónde viven los límites 10/20 (RN-28)?
7. ¿Cómo se resuelve el "período abierto corriente" (RN-14, RN-24) sin cederle la elección al usuario?
8. ¿Cómo se propaga `organizationId` desde el JWT hasta las queries de Prisma?
9. ¿Qué eventos de audit emite cada mutación?
10. ¿Qué claims de Auth0 consume `okr` y cómo se resuelven contra RBAC local?
11. ¿Qué forma exacta tienen los endpoints REST y sus DTOs?
12. ¿Qué shape tiene el schema Prisma (con `weight_bp Int` vs `Decimal(5,4)`)?

## Decision

Vamos a implementar el módulo `okr` como un módulo NestJS autocontenido que **orquesta** (controllers → services → repositories), **delega** la aritmética de cascada a `packages/okr-domain` (funciones puras), **persiste** el estado en el schema Postgres `okr` con pesos y progresos en `weight_bp Int` (basis points), **garantiza atomicidad** del recálculo vía `prisma.$transaction` con propagación manual hacia arriba, **valida invariantes** (suma = 10.000, límites 10/20, soft-delete seguro) en service-layer dentro de la misma transacción con política "último gana si sigue siendo válido, 409 si no", y **consume** de `core`/`auth`/`audit` exclusivamente sus APIs públicas. El avance se carga únicamente a nivel Tarea y cascadea hacia KR y Objetivo en la misma operación.

---

## Data model

### Ubicación

Schema Postgres: **`okr`**. Tres tablas: `okr.objective`, `okr.key_result`, `okr.task`.

FKs hacia `core` (schemas cruzados):

- `objective.organization_id` → `core.organization(id)` `ON DELETE RESTRICT`
- `objective.period_id` → `core.period(id)` `ON DELETE RESTRICT`
- `key_result.organization_id` → `core.organization(id)` `ON DELETE RESTRICT`
- `task.organization_id` → `core.organization(id)` `ON DELETE RESTRICT`

**Sin DB cascade delete**: el soft-delete es la única vía funcional de baja. Las FKs son `ON DELETE RESTRICT` como defensa en profundidad; si alguien intenta borrar una organización/period con Objetivos vivos, Postgres corta antes de que se corrompa el árbol. La limpieza física queda fuera del alcance funcional del módulo.

### Tipo elegido para pesos y progreso: `weight_bp Int`

Se elige **`Int` en basis points** (0–10.000) por encima de `Decimal(5,4)`:

- La spec razona en bps (`weight_bp`, `avance_bp`, `progress_cached_bp`). Persistir en bps elimina el roundtrip Decimal↔bps en cada operación.
- La aritmética de cascada (`Σ p_i × w_i / 10_000`) es enteramente entera si los operandos lo son, lo que la hace determinística, comparable por igualdad y trivial para property-based testing con `fast-check`.
- `Int` en Postgres es 4 bytes, indexable, serializable a JSON sin cuidado de precisión. `Decimal` arrastraría `Prisma.Decimal` en todo el stack (backend y shared-types).
- La presentación en `XX,XX%` se hace solo al render (RN-18, RN-22), dividiendo por 100.

Restricciones de rango se implementan con `CHECK (weight_bp BETWEEN 0 AND 10000)` a nivel columna, pero la validación de **suma** = 10.000 no se hace vía CHECK (sería un agregado imposible de expresar en un CHECK de fila), sino en service-layer dentro de transacción — ver sección "Invariante de suma".

### Shape ilustrativo (Prisma)

> Ilustrativo, no migración ejecutable.

```prisma
// apps/api/prisma/schema.prisma (extracto)

model Objective {
  id              String    @id @default(cuid())
  organizationId  String    @map("organization_id")
  periodId        String    @map("period_id")
  title           String    @db.VarChar(200)
  description     String?   @db.Text
  progressCached  Int       @default(0) @map("progress_cached_bp")  // 0..10000
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  keyResults      KeyResult[]

  // FKs cross-schema a core.*: se declaran en la migración SQL;
  // Prisma los conoce sólo como String IDs para no forzar mapeo bidireccional.

  @@index([organizationId, periodId], map: "idx_objective_org_period")
  @@index([organizationId, deletedAt], map: "idx_objective_org_active")
  // Único por (org, period, title) SOLO entre activos: índice parcial.
  // En Prisma no se puede declarar índice parcial inline, se agrega por SQL:
  //   CREATE UNIQUE INDEX uq_objective_org_period_title_active
  //     ON okr.objective (organization_id, period_id, title)
  //     WHERE deleted_at IS NULL;

  @@schema("okr")
  @@map("objective")
}

model KeyResult {
  id              String    @id @default(cuid())
  organizationId  String    @map("organization_id")
  objectiveId     String    @map("objective_id")
  title           String    @db.VarChar(200)
  description     String?   @db.Text
  weightBp        Int       @map("weight_bp")           // 0..10000, CHECK
  progressCached  Int       @default(0) @map("progress_cached_bp")  // 0..10000
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  objective       Objective @relation(fields: [objectiveId], references: [id], onDelete: Restrict)
  tasks           Task[]

  @@index([organizationId, objectiveId, deletedAt], map: "idx_kr_org_obj_active")
  // Índice parcial único por (objective, title) sobre activos: SQL manual.
  //   CREATE UNIQUE INDEX uq_kr_objective_title_active
  //     ON okr.key_result (objective_id, title)
  //     WHERE deleted_at IS NULL;

  @@schema("okr")
  @@map("key_result")
}

model Task {
  id              String    @id @default(cuid())
  organizationId  String    @map("organization_id")
  keyResultId     String    @map("key_result_id")
  title           String    @db.VarChar(200)
  description     String?   @db.Text
  weightBp        Int       @map("weight_bp")           // 0..10000, CHECK
  progressBp      Int       @default(0) @map("progress_bp")  // 0..10000, input directo RN-06
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  keyResult       KeyResult @relation(fields: [keyResultId], references: [id], onDelete: Restrict)

  @@index([organizationId, keyResultId, deletedAt], map: "idx_task_org_kr_active")
  //   CREATE UNIQUE INDEX uq_task_kr_title_active
  //     ON okr.task (key_result_id, title)
  //     WHERE deleted_at IS NULL;

  @@schema("okr")
  @@map("task")
}
```

CHECKs SQL complementarios (declarados en la migración, no en Prisma):

```sql
ALTER TABLE okr.objective
  ADD CONSTRAINT chk_objective_progress_range
  CHECK (progress_cached_bp BETWEEN 0 AND 10000);

ALTER TABLE okr.key_result
  ADD CONSTRAINT chk_kr_weight_range  CHECK (weight_bp BETWEEN 0 AND 10000),
  ADD CONSTRAINT chk_kr_progress_range CHECK (progress_cached_bp BETWEEN 0 AND 10000);

ALTER TABLE okr.task
  ADD CONSTRAINT chk_task_weight_range   CHECK (weight_bp BETWEEN 0 AND 10000),
  ADD CONSTRAINT chk_task_progress_range CHECK (progress_bp BETWEEN 0 AND 10000);
```

### Denormalización de `progress_cached`

- `objective.progress_cached_bp` y `key_result.progress_cached_bp` viven denormalizados para lecturas O(1). Se recalculan en la misma transacción de cualquier mutación que los afecte.
- `task.progress_bp` es el **input directo** (RN-06, RN-29). No se cachea nada adicional a nivel Task: la Tarea ya tiene su progreso como valor de verdad.
- **No** se guarda snapshot histórico del `progress_cached` — el historial reconstruible vive en `audit.event` (ver "Audit events").

### Índices y justificación

| Índice | Propósito |
|---|---|
| `idx_objective_org_period` B-tree | Listar Objetivos de una org en un período (endpoint `GET /objectives?period=...`). |
| `idx_objective_org_active` B-tree | Filtro rápido por `deleted_at IS NULL` al listar activos. |
| `uq_objective_org_period_title_active` parcial UNIQUE | Evita dos Objetivos activos con el mismo título en la misma org + período. Permite recrear un Objetivo con el mismo título tras soft-delete. |
| `idx_kr_org_obj_active` B-tree | Cargar KRs activos de un Objetivo. |
| `uq_kr_objective_title_active` parcial UNIQUE | Evita duplicados de título entre KRs activos del mismo Objetivo. |
| `idx_task_org_kr_active` B-tree | Cargar Tareas activas de un KR. |
| `uq_task_kr_title_active` parcial UNIQUE | Idem Tasks dentro de un KR. |

El `organizationId` primero en los índices compuestos asegura que cualquier query tenant-scoped tenga plan óptimo.

### Unique constraints

Se elige unicidad por **título** entre entidades activas del mismo padre. Alternativa descartada: sin unique alguno (tolerar duplicados de título). Se prefiere unique parcial por diseño defensivo, dado que la UX valida título único a nivel visual y dos KRs con el mismo nombre en la UI son motivo clásico de confusión en OKR. Si el dueño del producto rechaza esta restricción, se elimina; no rompe nada de la cascada.

---

## API contract

Todos los endpoints bajo `/api/v1/okr/...`. Los DTOs viven en `packages/shared-types/src/okr/` y se importan tanto desde `apps/api` como desde `apps/web`.

**Guards aplicados a todos los endpoints del módulo** (a través de filtros globales del module):

- `@AuthGuard()` — valida JWT Auth0 y resuelve usuario.
- `@TenantGuard()` — extrae `organizationId` del JWT/contexto y lo inyecta en el request scope.
- `@ModuleEnabled('okr')` — verifica que `core.organization_module` tenga OKR activo para la org actual.
- `@Permissions(...)` — se especifica por endpoint (ver tabla).

Códigos HTTP comunes:

- **400**: error de validación de shape/tipo (class-validator).
- **403**: auth válida pero sin permiso.
- **404**: entidad inexistente **o fuera del scope de la org actual** (edge case 9: no filtrar información).
- **409**: conflicto de invariante (suma ≠ 10.000, RN-27).
- **422**: regla de negocio violada (período cerrado, límite 10/20, soft-delete bloqueado por suma).

### Objetivos

| Método + Path | Propósito | Permiso | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/okr/objectives?period=YYYY-Qn` | Lista Objetivos activos de la org para un período. `period` opcional, default al período abierto corriente. | `okr:read` | query: `ListObjectivesQueryDto` | `ObjectiveSummaryDto[]` | 200, 400, 403 |
| `GET /api/v1/okr/objectives/:id` | Detalle de un Objetivo (sin KRs/Tasks — usar `/cascade` para árbol completo). | `okr:read` | — | `ObjectiveDetailDto` | 200, 403, 404 |
| `POST /api/v1/okr/objectives` | Crea Objetivo. Período se resuelve al **abierto corriente** de la org (RN-24); el cliente no lo elige. | `okr:write` | `CreateObjectiveDto` `{ title, description? }` | `ObjectiveDetailDto` | 201, 400, 403, 422 |
| `PATCH /api/v1/okr/objectives/:id` | Edita solo `title` y `description`. No edita período ni peso (los Objetivos no ponderan, RN-11). | `okr:write` | `UpdateObjectiveDto` `{ title?, description? }` | `ObjectiveDetailDto` | 200, 400, 403, 404, 422 |
| `DELETE /api/v1/okr/objectives/:id` | Soft-delete. Sin chequeo de suma (RN-25: soft-delete de Objetivo se acepta completo). | `okr:write` | — | — | 204, 403, 404, 422 (período cerrado) |
| `POST /api/v1/okr/objectives/:id/rebalance-weights` | Actualización atómica de pesos de todos los KRs del Objetivo. Única vía para rebalanceo bulk (CU-03). | `okr:write` | `RebalanceKrWeightsDto` `{ items: { krId, weightBp }[] }` | `ObjectiveCascadeDto` | 200, 400, 403, 404, 409 (suma ≠ 10.000), 422 |
| `GET /api/v1/okr/objectives/:id/cascade` | Árbol completo Objetivo → KRs → Tareas con `progressCachedBp` denormalizado. Endpoint principal de visualización (US-11, CU-05). | `okr:read` | — | `ObjectiveCascadeDto` | 200, 403, 404 |

### Key Results

| Método + Path | Propósito | Permiso | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/okr/objectives/:objectiveId/key-results` | Lista KRs activos de un Objetivo. | `okr:read` | — | `KeyResultSummaryDto[]` | 200, 403, 404 |
| `GET /api/v1/okr/key-results/:id` | Detalle de un KR. | `okr:read` | — | `KeyResultDetailDto` | 200, 403, 404 |
| `POST /api/v1/okr/objectives/:objectiveId/key-results` | Crea KR. Valida suma post-inserción = 10.000, límite ≤ 10 KRs activos. | `okr:write` | `CreateKeyResultDto` `{ title, description?, weightBp }` | `KeyResultDetailDto` | 201, 400, 403, 404, 409 (suma), 422 (límite/período) |
| `PATCH /api/v1/okr/key-results/:id` | Edita `title`, `description`, `weightBp`. Si cambia `weightBp`, valida suma y recalcula cascada. | `okr:write` | `UpdateKeyResultDto` `{ title?, description?, weightBp? }` | `KeyResultDetailDto` | 200, 400, 403, 404, 409, 422 |
| `DELETE /api/v1/okr/key-results/:id` | Soft-delete. Bloqueado si la suma restante ≠ 10.000 (RN-25). | `okr:write` | — | — | 204, 403, 404, 409 (suma), 422 (período) |

### Tareas

| Método + Path | Propósito | Permiso | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/okr/key-results/:krId/tasks` | Lista Tareas activas de un KR. | `okr:read` | — | `TaskSummaryDto[]` | 200, 403, 404 |
| `GET /api/v1/okr/tasks/:id` | Detalle de Tarea. | `okr:read` | — | `TaskDetailDto` | 200, 403, 404 |
| `POST /api/v1/okr/key-results/:krId/tasks` | Crea Tarea con peso y avance inicial 0. Valida suma y límite ≤ 20 activas. | `okr:write` | `CreateTaskDto` `{ title, description?, weightBp }` | `TaskDetailDto` | 201, 400, 403, 404, 409, 422 |
| `PATCH /api/v1/okr/tasks/:id` | Edita `title`, `description`, `weightBp`. **No** se edita `progressBp` por este endpoint. | `okr:write` | `UpdateTaskDto` `{ title?, description?, weightBp? }` | `TaskDetailDto` | 200, 400, 403, 404, 409, 422 |
| `DELETE /api/v1/okr/tasks/:id` | Soft-delete. Bloqueado si la suma restante ≠ 10.000 (RN-25). | `okr:write` | — | — | 204, 403, 404, 409, 422 |
| `PUT /api/v1/okr/tasks/:id/progress` | **Único** endpoint de carga de avance (RN-06, RN-09). Idempotente por el valor final, no acumulativo. | `okr:progress:write` | `SetTaskProgressDto` `{ progressBp }` (entero 0..10.000) | `TaskDetailDto` + `cascadeSnapshot` | 200, 400, 403, 404, 422 (período cerrado o tarea deleted) |

### Shape de los DTOs principales (en `packages/shared-types/src/okr/`)

```ts
// shared-types/src/okr/objective.dto.ts
export interface ObjectiveSummaryDto {
  id: string;
  title: string;
  periodCode: string;               // "YYYY-Qn"
  progressCachedBp: number;         // 0..10_000
  hasActiveKeyResults: boolean;     // para flag "plan incompleto" (RN-31)
  createdAt: string;                // ISO-8601
}

export interface ObjectiveDetailDto extends ObjectiveSummaryDto {
  description: string | null;
  organizationId: string;
  periodId: string;
  updatedAt: string;
}

export interface ObjectiveCascadeDto {
  objective: ObjectiveDetailDto;
  keyResults: KeyResultInCascadeDto[];
  planIncomplete: boolean;          // true si no hay KRs activos O alguno sin Tasks (RN-31)
}

export interface KeyResultInCascadeDto {
  id: string;
  title: string;
  weightBp: number;
  progressCachedBp: number;
  hasActiveTasks: boolean;          // flag "sin tareas" vs "0% con tareas" (US-12, edge case 2)
  tasks: TaskInCascadeDto[];
}

export interface TaskInCascadeDto {
  id: string;
  title: string;
  weightBp: number;
  progressBp: number;
}
```

```ts
// shared-types/src/okr/rebalance.dto.ts
export interface RebalanceKrWeightsItemDto {
  krId: string;
  weightBp: number;     // 0..10_000
}
export interface RebalanceKrWeightsDto {
  items: RebalanceKrWeightsItemDto[];   // debe incluir TODOS los KRs activos del Objetivo
}
```

```ts
// shared-types/src/okr/set-progress.dto.ts
export interface SetTaskProgressDto {
  progressBp: number;   // entero 0..10_000; ver RN-22 para truncado si viene %
}
```

El cuerpo exacto de `SetTaskProgressDto` acepta `progressBp` entero. Si el frontend quiere mandar `%` con decimales (por ergonomía), lo convierte en el cliente (`Math.trunc(pct * 100)`). Alternativa "backend acepta `progressPct: number` y trunca" descartada: mover el borde al cliente mantiene el backend libre de `Float`.

### Errores: shape común

Todos los errores siguen el formato estándar de Nest + un campo `error.details` para contexto de dominio. Ejemplo de 409 por invariante rota:

```json
{
  "statusCode": 409,
  "message": "Sum of active KR weights must equal 10000 bps",
  "error": "WeightSumInvariant",
  "details": {
    "actualBp": 9500,
    "expectedBp": 10000,
    "scope": "objective",
    "scopeId": "ck9xj..."
  }
}
```

El 409 de soft-delete bloqueado (RN-25) trae `scope: "objective"` o `"keyResult"` con los bps que quedarían si la operación procediera.

---

## Module boundaries

### Módulo `okr` — forma interna

```
apps/api/src/modules/okr/
├── okr.module.ts                  # @Module; wires controllers, services, repos
├── index.ts                       # superficie pública
├── controllers/
│   ├── objective.controller.ts
│   ├── key-result.controller.ts
│   └── task.controller.ts
├── services/
│   ├── objective.service.ts
│   ├── key-result.service.ts
│   ├── task.service.ts
│   └── cascade-orchestrator.service.ts   # carga data, llama okr-domain, persiste
├── repositories/
│   ├── objective.repository.ts
│   ├── key-result.repository.ts
│   └── task.repository.ts
├── dto/                           # re-exporta shared-types con validadores class-validator
├── events/                        # adaptadores a AuditEventEmitter (consumido desde audit)
└── __tests__/
```

### `okr/index.ts` — superficie pública

**Hipótesis MVP**: ningún otro módulo consume entidades OKR. La superficie pública inicial es mínima:

```ts
// apps/api/src/modules/okr/index.ts
export { OkrModule } from './okr.module';
// No se re-exportan services, repos, ni DTOs internos. Los DTOs "compartibles"
// ya están en packages/shared-types (consumibles desde apps/web).
```

Si más adelante un módulo futuro (ej. `reporting`) necesita leer la cascada de una org, se expondrá un `OkrReadService` vía `index.ts` con un contrato explícito. **No se anticipa**: YAGNI.

### `okr` consume de `core`

Importa exclusivamente desde `modules/core/index.ts`:

- `OrganizationContextService` (o equivalente) — para resolver la organización activa.
- `PeriodService.getCurrentOpenPeriod(organizationId): Promise<PeriodDto>` — resuelve el período abierto corriente. Usado en `POST /objectives` (RN-24) y en todas las mutaciones para verificar que `objective.period` está abierto (RN-14).
- `PeriodService.getById(periodId): Promise<PeriodDto>` — para materializar `periodCode` en respuestas.
- `ModuleEnablementService.isEnabled(organizationId, moduleKey): Promise<boolean>` — usado por `@ModuleEnabled('okr')` guard.

Estos servicios son contrato que `core` debe exponer (ver "Impact / faltantes en otros módulos").

### `okr` consume de `auth`

Importa desde `modules/auth/index.ts`:

- `AuthGuard` — valida JWT Auth0.
- `TenantGuard` — inyecta `organizationId` resolviendo claims + lookup en `core.user_organization_role`.
- `Permissions` decorator (`@Permissions('okr:read')`).
- `ModuleEnabled` decorator (si `auth` lo provee; si no, lo provee `core`).
- `CurrentUser` decorator para inyectar el `AuthContext` en el controller si hace falta.

### `okr` consume de `audit`

Importa desde `modules/audit/index.ts`:

- `AuditEventEmitter` — servicio con `emit(event: DomainEvent): void`. El emit es **in-transaction** vía la ALS `TransactionContextStorage` owned por el módulo `audit` (ADR 0003). El módulo `okr` **no maneja la ALS directamente** — se apoya en `PrismaService.runInTransaction` que wraps sus operaciones de negocio y popula la ALS. Si la ALS está vacía al momento del `emit`, se lanza `NoActiveTransactionError` → rollback / 5xx en el caller.

### Prohibiciones explícitas

- **Prohibido**: `import { X } from '../core/internal/...'` (o cualquier path que no sea `core/index.ts`).
- **Prohibido**: acceder a `prisma.organizationModule` o `prisma.period` directamente desde `okr`. Se pasa por los services públicos de `core`. Esto aísla a `okr` de cambios de schema de `core`.
- **Prohibido**: emitir audit events "a mano" haciendo `prisma.auditEvent.create()`. Siempre vía `AuditEventEmitter` (para que el schema de `audit.event`, las validaciones y el trigger append-only queden bajo control de `audit`).

### `packages/okr-domain` — contenido y boundary

```
packages/okr-domain/src/
├── index.ts
├── types.ts              # tipos propios, NO importados de Prisma ni Nest
├── basis-points.ts       # conversión bps↔pct (truncado RN-22)
├── cascade.ts            # computeKrProgress, computeObjectiveProgress
├── invariants.ts         # validateWeightSumInvariant, projectSumAfterDelete
└── __tests__/            # vitest + fast-check
```

**Exporta**:

```ts
// packages/okr-domain/src/index.ts
export type {
  TaskInput,          // { weightBp, progressBp }
  KrInput,            // { weightBp, tasks: TaskInput[] }
  ObjectiveInput,     // { keyResults: KrInput[] }
  CascadeResult,
  WeightSumError,
} from './types';

export {
  computeKrProgress,          // (tasks: TaskInput[]) => number  // bps 0..10000
  computeObjectiveProgress,   // (krs: Array<{ weightBp, progressBp }>) => number
  validateWeightSumInvariant, // (items: { weightBp }[], expected=10000) => Result<void, WeightSumError>
  projectSumAfterDelete,      // (siblings: { id, weightBp }[], deletedId) => number  // proyecta
  truncateBpFromPct,          // (pct: number) => number  // RN-22
  bpToPct,                    // (bp: number, decimals=2) => number  // solo presentación
} from './api';
```

**Nunca exporta**:

- Tipos generados por Prisma (`@prisma/client`).
- Decoradores/símbolos de NestJS.
- Tipos de DTO que "contengan" campos Prisma-like (IDs, timestamps). Los inputs son puramente aritméticos.

**Dependencies**: `fast-check` (dev). Ninguna runtime.

### `packages/shared-types` — contenido

Contiene los DTOs transversales (listados arriba en "API contract") y los **enums** de dominio (`PermissionKey = 'okr:read' | 'okr:write' | 'okr:progress:write' | 'okr:admin'`). No contiene lógica, solo tipos e interfaces. Lo consumen tanto `apps/api` (controllers, DTOs con class-validator) como `apps/web` (clientes de API tipados, forms con Zod). Cero dependencia runtime.

### `packages/prisma-tenant-extension` — ubicación y contenido

La Prisma extension que inyecta `organizationId` en cada operación (ver "Tenant scoping") vive en `packages/prisma-tenant-extension/`, como **paquete hermano** de `okr-domain` y `shared-types`, al nivel superior del árbol `packages/` — alineado con el layout definido en `CLAUDE.md` (no hay sub-árbol `packages/shared/`).

```
packages/prisma-tenant-extension/
├── src/
│   ├── index.ts               # export tenantExtension, MissingTenantContextError
│   └── async-local-storage.ts # TenantContextStorage (opcional; podría vivir en auth)
└── package.json
```

**Por qué paquete propio y no subcarpeta de `auth`**:

- Es reutilizable por futuros módulos de negocio (`core` puede aplicarlo a su propio schema si la infra de tenancy crece).
- Facilita el testeo aislado (no levanta NestJS; solo toma una función `() => string | null` como dependencia).
- Dependencias mínimas: solo `@prisma/client` peer.

El módulo `auth` **consume** este paquete (lo aplica a su `PrismaService`); no lo contiene. La decisión de qué paquete provee `TenantContextStorage` (el `AsyncLocalStorage`) queda al ADR de `auth`: puede vivir aquí como utilidad opcional o en `auth` si se considera parte del contrato de autenticación.

---

## Cascade math placement

### Decisión: `packages/okr-domain` (funciones puras) + service orchestrator

**Justificación**:

1. **Regla frozen** (CLAUDE.md + AGENTS.md + architect.md): la aritmética de cascada vive en `packages/okr-domain` como funciones puras.
2. **Testabilidad**: property-based tests con `fast-check` (invariantes: "todas al 100% ⇒ KR al 100%", "progreso ∈ [0, 10000]", linealidad por peso, etc.) sin levantar DB.
3. **Reusabilidad**: el frontend puede importar las mismas funciones para previsualizar la cascada en vivo mientras el admin edita pesos, sin duplicar lógica.
4. **Separación**: no se mezcla aritmética con I/O. Los services orquestan (cargar → calcular → persistir), el paquete calcula.

### API del paquete (detalle)

```ts
// Puras, deterministas, trabajan solo con Ints en bps.

export function computeKrProgress(tasks: TaskInput[]): number {
  // Σ(progressBp_i × weightBp_i) / 10_000
  // Si tasks.length === 0 ⇒ 0 (RN-07).
  // Si alguna weightBp está fuera de [0, 10_000] ⇒ lanza InvariantError (defensivo).
  // Si la suma de weightBp activos no es 10_000 ⇒ lanza WeightSumError.
  //   (llamadores deben validar antes; esto es última línea de defensa.)
}

export function computeObjectiveProgress(
  krs: Array<{ weightBp: number; progressBp: number }>
): number {
  // Σ(progressBp_j × weightBp_j) / 10_000
  // krs.length === 0 ⇒ 0 (RN-08).
}

export function validateWeightSumInvariant(
  items: Array<{ weightBp: number }>,
  expected = 10_000
): { ok: true } | { ok: false; actual: number; expected: number } {
  // Suma y compara. Invariante RN-04/RN-05.
}

export function projectSumAfterDelete(
  siblings: Array<{ id: string; weightBp: number }>,
  toDeleteId: string
): number {
  // Retorna la suma de pesos si se excluye toDeleteId.
  // Usado para RN-25 ANTES de persistir el soft-delete.
}
```

### Cómo orquesta el service

`CascadeOrchestratorService.recomputeAndPersist(objectiveId, tx)` es el corazón del módulo. Dentro de una transacción recibida:

1. **Load batch** (una sola pasada): `tx.keyResult.findMany({ where: { objectiveId, deletedAt: null }, include: { tasks: { where: { deletedAt: null } } } })`.
2. **Para cada KR**: `progressKr = computeKrProgress(kr.tasks)`.
3. **Objetivo**: `progressObj = computeObjectiveProgress(krs con progressKr)`.
4. **Persistir denormalizado**: `tx.keyResult.updateMany(...)` batch + `tx.objective.update(...)` para el padre.

Los callers (services de KR, Task, Rebalance) llaman a `recomputeAndPersist` una sola vez al final de su unidad lógica, dentro de la misma `$transaction`. Nunca se llama desde un trigger DB.

---

## Atomicidad del recálculo

### Decisión: una única `prisma.$transaction` con propagación manual

**Descartadas**:

- **Trigger DB**: movería lógica de cascada a la DB (viola la regla frozen de que la math vive en `okr-domain`). Haría imposibles los property-based tests sin DB. Descartado.
- **Event-driven async (outbox + worker)**: introduce eventualmente-consistente; el usuario **debe** ver el estado final al terminar la operación (Notas de implementación de la spec). Descartado para MVP.
- **`SELECT ... FOR UPDATE` sobre el Objetivo**: considerado para serializar escrituras sobre el mismo árbol. Descartado en MVP porque la política explícita de concurrencia es "último gana si sigue siendo válido" (RN-27); con revalidación de invariante en commit, el lock de fila no aporta. Queda como opción de endurecimiento si aparece contención real.

### Forma: secuencia canónica por mutación

Cada mutación que afecta la cascada sigue exactamente:

```
prisma.$transaction(async (tx) => {
  1. Cargar estado actual requerido (KRs y Tasks activos del Objetivo afectado).
  2. Aplicar el cambio pedido (insert / update / soft-delete).
  3. Validar invariantes sobre el NUEVO estado:
     - suma de pesos = 10.000 (RN-04, RN-05) si la mutación tocó pesos o soft-delete.
     - límites 10/20 (RN-28) si la mutación fue create.
     - proyectar suma pre-soft-delete (RN-25) si la mutación fue delete de KR/Task.
     ⇒ Si falla cualquiera, throw → la transacción se aborta → HTTP 409 o 422.
  4. CascadeOrchestratorService.recomputeAndPersist(objectiveId, tx).
  5. AuditEventEmitter.emit(event). El `tx` se resuelve desde `TransactionContextStorage` (ALS), poblado por `PrismaService.runInTransaction`. Ver ADR 0003 para el mecanismo completo.
})
```

Esta secuencia aplica a: crear KR/Task, editar peso de KR/Task, soft-delete KR/Task, rebalance-weights, set-progress. Para operaciones que no tocan cascada (editar título/descripción de Objetivo o KR), los pasos 3 y 4 se omiten.

**Isolation level**: `READ COMMITTED` (default de Postgres). Alternativa `SERIALIZABLE` se descarta por costo y porque la revalidación explícita de invariantes en el paso 3 nos da el comportamiento deseado para RN-27 sin pagar el serializable.

**Audit dentro de la transacción**: crítico. Si el commit falla, el audit event tampoco se emite (evita falsos positivos en el trail). Si la transacción commitea, el audit está garantizado.

---

## Invariante de suma de pesos (RN-04, RN-05)

### Decisión: validación en service-layer dentro de la misma transacción

No usamos CHECK constraint a nivel DB. Razones:

- Un CHECK de agregado sobre múltiples filas no se expresa en Postgres directamente (solo `CHECK` de fila). Alternativas: deferred constraint + trigger, o `EXCLUSION CONSTRAINT` creativa. Ambas complican la migración y el debug sin ventaja clara sobre validación en servicio.
- **Excepción deliberada**: estados intermedios de edición (Admin creando KRs uno por uno en la UI sin haber enviado aún el rebalance completo) **pueden** dejar la suma distinta de 10.000 dentro de una sola transacción si el flujo es "crear KR con peso K que debe coexistir con otros KRs cuya suma actual es 10.000". La regla es "la suma cerrada al final de la operación debe ser 10.000". Con CHECK deferred esto también se puede modelar, pero la validación explícita en servicio hace el error más legible ("actual=9500, expected=10000") y permite retornar 409 limpio.
- CHECKs de rango por fila (peso en [0, 10.000]) sí se usan — son cheap y defensivos.

### Dónde exactamente corre la validación

Centralizada en `InvariantValidatorService` dentro del módulo `okr`:

- Tras aplicar el cambio en la transacción pero antes de `recomputeAndPersist`.
- Usa `validateWeightSumInvariant` de `okr-domain`.
- Cuando falla: lanza `WeightSumException` (mapea a 409 por el exception filter global del módulo).

### Casos que ejercitan la invariante

| Operación | Validación |
|---|---|
| `POST /key-results` | Tras insert, suma de KRs activos del Objetivo = 10.000. |
| `PATCH /key-results/:id` (cambio `weightBp`) | Idem. |
| `DELETE /key-results/:id` | **Antes** de marcar `deleted_at`, `projectSumAfterDelete` = 10.000 (RN-25). |
| `POST /objectives/:id/rebalance-weights` | Suma del payload completo = 10.000 Y cubre TODOS los KRs activos (si un KR activo no aparece en `items`, 400). |
| `POST /tasks` | Tras insert, suma de Tasks activas del KR = 10.000. |
| `PATCH /tasks/:id` (cambio `weightBp`) | Idem. |
| `DELETE /tasks/:id` | Idem RN-25 a nivel KR. |

---

## Soft-delete bloqueado por invariante (RN-25)

### Decisión: proyección pre-commit en service-layer

Antes de persistir el soft-delete de un KR o Task:

1. Cargar hermanos activos (mismo Objetivo para KRs, mismo KR para Tasks) dentro de la transacción.
2. Llamar `projectSumAfterDelete(siblings, targetId)`.
3. Si ≠ 10.000 → throw → HTTP 409 con payload:
   ```json
   {
     "error": "WeightSumInvariantOnDelete",
     "details": {
       "expectedBp": 10000,
       "actualAfterDeleteBp": 7000,
       "hintAction": "rebalance siblings first"
     }
   }
   ```
4. Si = 10.000 → `update` marcando `deleted_at` → recalcular cascada → emitir audit.

### Concurrencia en el soft-delete

**Escenario A**: dos admins, A1 soft-deletea un KR y A2 en paralelo edita el peso de otro KR del mismo Objetivo.

- Ambas operaciones abren su propia `$transaction`.
- Con `READ COMMITTED`, cada una lee el snapshot previo al otro commit.
- La que commitea primero aplica su cambio; la segunda, al commitear, revalida la invariante sobre el estado ya modificado.
- **Caso crítico**: A1 borra KR1 (de 4000 bps), asumiendo que el resto suma 6000. A2 al mismo tiempo baja KR2 de 6000 a 5000. Si A2 commitea primero, la validación de A1 al commit ve `projectSumAfterDelete = 5000` ≠ 10.000 → 409 a A1.
- Esto es el comportamiento pedido: "último gana si sigue siendo válido, 409 si no" (RN-27).

**Escenario B**: no se adopta `SELECT ... FOR UPDATE` sobre el Objetivo padre en MVP. Trade-off: puede haber rework ocasional para el admin que pierde la carrera, pero la simplicidad compensa dado que la edición de OKR no es high-throughput y los admins son pocos.

---

## Conflicto de edición concurrente (RN-27)

### Decisión: sin optimistic lock, revalidación de invariante al commit

**Descartado**: columna `version` con `@UpdatedAt` + `WHERE version = ?`. Costo: un campo más en cada entidad, cada PATCH/DELETE lo envía en el body, el cliente lo maneja. Agrega complejidad a `shared-types` y a los clientes web. **Beneficio MVP**: bajo, porque la invariante de suma ya funciona como lock implícito — cualquier conflicto que importe se detecta al commit.

**Descartado**: `SELECT ... FOR UPDATE` sobre el Objetivo. Previene concurrencia real pero serializa todo y complica el código. Se deja como opción para un ADR futuro si aparece contención.

### Secuencia exacta en cada mutación

Dentro de `prisma.$transaction(READ COMMITTED)`:

1. **Lectura de estado actual** de los hermanos activos relevantes (KRs del Objetivo o Tasks del KR). Sin lock.
2. **Composición del nuevo estado** en memoria (con el cambio aplicado: nuevo KR, peso actualizado, tarea soft-deleted, etc.).
3. **Validación de invariantes** sobre el nuevo estado compuesto en memoria (suma, límites, proyección si es delete).
4. **Persistencia** de la mutación principal (`create` / `update` / soft-`update`).
5. **Recálculo de cascada** y persistencia de `progressCachedBp` en KR y Objetivo afectados.
6. **Emit audit event**.
7. **Commit** — si otro admin commiteó antes y alteró algo que haga fallar la invariante, el commit no falla por sí mismo (no hay `version`), pero la próxima mutación del otro admin sobre el mismo scope revalidará y fallará allí si corresponde.

La **clave** está en el paso 3: la validación se hace sobre el estado leído en el paso 1 + mi cambio. Si el otro admin commiteó entre mi paso 1 y mi paso 4, y su cambio impacta a los mismos hermanos, yo ya no los veo. En ese caso mi validación usa datos stale. El MVP acepta esta ventana **porque** el dueño del producto explicitó "último gana" (RN-27).

**Endurecimiento opcional** (queda fuera de MVP, se anota como seguimiento): repetir el paso 1 dentro de la misma transacción usando `FOR UPDATE` sobre el Objetivo antes del paso 3. Garantiza serialización real. Se valoró y se prefirió no pagarlo ahora.

### Response 409

Cuando la invariante falla, el service lanza `WeightSumException` con payload `{ actualBp, expectedBp, scope }` y el filter global mapea a HTTP 409. La UI debe reaccionar invitando a recargar (no hay resolución automática en MVP).

---

## Límites estructurales (RN-28)

### Decisión: validación en service-layer

- `KeyResultService.create()`: tras compute de cuántos KRs activos quedarían, si > 10 → `StructuralLimitException` → HTTP 422.
- `TaskService.create()`: idem, límite 20 Tasks activas por KR.

No se usa CHECK constraint (no hay forma barata en Postgres de limitar cardinalidad de hijos sin trigger). Trigger se descarta por la misma razón que se descartó trigger de cascada: la lógica vive en el service.

Los límites **solo cuentan entidades activas** (RN-28 + Notas de implementación). Soft-delete libera cupo. Si mañana se habilita "restaurar soft-deleted" (fuera de alcance, ex-AR-06), la restauración deberá re-validar el límite; se deja anotado para ese ADR futuro.

---

## Period gating (RN-14, RN-24)

### Decisión: policy en service + uso de API pública de `core`

**Sin** guard dedicado dedicado a período (no hay uno genérico suficiente — la regla varía según la mutación: creación exige período **corriente**, edición exige período **abierto**, lectura no exige nada salvo org scope). Se implementa como invocación explícita desde cada service-method que muta, antes del paso 3 de la secuencia transaccional.

Servicio público consumido de `core`:

- `PeriodService.getCurrentOpenPeriod(organizationId)` → para `POST /objectives` (RN-24).
- `PeriodService.getById(periodId)` → devuelve `{ id, code, status: 'open' | 'closed' | 'future' }`; `okr` verifica `status === 'open'` antes de cualquier mutación sobre Objetivos de ese período (RN-14).

El usuario **nunca elige el período** al crear un Objetivo. El `CreateObjectiveDto` **no** tiene `periodId`. El backend lo resuelve. Si no hay período abierto corriente (caso esperable entre dos trimestres), el backend responde 422 con `error: "NoCurrentOpenPeriod"`.

Para lecturas (`GET /objectives?period=YYYY-Qn`), cualquier período es válido (se puede ver el pasado). El query param acepta el `code`; el service lo resuelve a ID vía `PeriodService`.

---

## Tenant scoping

### Decisión: cadena JWT → `TenantGuard` → AsyncLocalStorage → Prisma extension → repository

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Auth0 JWT                                                         │
│    Claims base: sub, email.                                          │
│    Claim custom (resolución org): https://gestion-publica.ar/orgs    │
│      con array de org slugs/ids accesibles al usuario.               │
├──────────────────────────────────────────────────────────────────────┤
│ 2. AuthGuard (de módulo auth)                                        │
│    Verifica firma JWT Auth0.                                         │
│    Popula `request.user = { sub, email, orgs[] }`.                   │
├──────────────────────────────────────────────────────────────────────┤
│ 3. TenantGuard (de módulo auth)                                      │
│    Extrae organizationId de:                                         │
│      a) header `X-Organization-Id` (MVP: UI lo setea), O             │
│      b) claim custom si hay una sola org.                            │
│    Valida que el usuario tenga acceso a esa org mediante             │
│      core.user_organization_role (consulta explícita, no sólo claim).│
│    Popula `AuthContext`: { userId, organizationId, permissions[] }.  │
├──────────────────────────────────────────────────────────────────────┤
│ 4. AsyncLocalStorage request-scoped (`TenantContextStorage`)         │
│    Middleware/Interceptor pone el AuthContext en ALS.                │
│    Accesible desde cualquier layer sin pasar el req manualmente.     │
├──────────────────────────────────────────────────────────────────────┤
│ 5. Prisma extension (`tenantExtension`)                              │
│    Se aplica al PrismaClient global (`prisma.$extends(tenantExt)`).  │
│    En cada operación sobre modelos de schema `okr` (Objective,       │
│    KeyResult, Task):                                                 │
│      - En findMany/findUnique/findFirst/count: inyecta               │
│          where.organizationId = ALS.organizationId                   │
│      - En create: inyecta                                            │
│          data.organizationId = ALS.organizationId                    │
│      - En update/delete/updateMany/deleteMany: inyecta               │
│          where.organizationId = ALS.organizationId                   │
│    Si ALS está vacío (no hay AuthContext), lanza                     │
│      MissingTenantContextError → 500 (es un bug, no un 4xx).         │
├──────────────────────────────────────────────────────────────────────┤
│ 6. Repository layer                                                  │
│    Los repositorios reciben ya el client extendido. No manipulan     │
│    organizationId: si lo hacen en el where, la extensión no          │
│    sobrescribe (el suyo toma precedencia — comportamiento            │
│    configurable). En `okr` nos apoyamos en la extensión.             │
└──────────────────────────────────────────────────────────────────────┘
```

### Forma conceptual de la Prisma extension (pseudocódigo)

> No es código ejecutable. Ilustra la shape.

```ts
// packages/prisma-tenant-extension/src/index.ts (a crear)
import { Prisma } from '@prisma/client';

const TENANT_SCOPED_MODELS = new Set(['Objective', 'KeyResult', 'Task']);

export const tenantExtension = (getOrgId: () => string | null) =>
  Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);
          const orgId = getOrgId();
          if (!orgId) throw new MissingTenantContextError(model, operation);

          switch (operation) {
            case 'findUnique':
            case 'findFirst':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
              args.where = { ...(args.where ?? {}), organizationId: orgId };
              break;
            case 'create':
              args.data = { ...(args.data ?? {}), organizationId: orgId };
              break;
            case 'update':
            case 'updateMany':
            case 'delete':
            case 'deleteMany':
              args.where = { ...(args.where ?? {}), organizationId: orgId };
              break;
            // 'upsert', 'createMany' requieren manejo específico documentado.
          }
          return query(args);
        },
      },
    },
  });
```

`getOrgId` lee del `AsyncLocalStorage`. El `PrismaService` de Nest se construye como `new PrismaClient().$extends(tenantExtension(() => tenantContextStorage.get()?.organizationId ?? null))`.

### Organization selection for multi-org users

Un usuario puede tener acceso a N organizaciones. El flujo MVP para selección de org activa:

1. **Descubrimiento de orgs accesibles**: tras el login Auth0, la UI llama `GET /api/v1/me` y recibe:

   ```
   {
     userId: string,
     email: string,
     orgs: [{ id: string, slug: string, name: string }]
   }
   ```

   Este endpoint es provisto por `auth` (o `core`) y se formaliza en **ADR 0003-auth** / **ADR 0002-core**. Este ADR asume su existencia como parte del contrato público de esos módulos.

2. **Selección del usuario**:
    - Si `orgs.length === 1`: la UI **auto-setea** el header `X-Organization-Id` con la única org. No se muestra picker.
    - Si `orgs.length > 1`: la UI muestra un selector de organización al ingresar (y permite cambiar desde un menú del header). La elección se persiste en el cliente (ej: `localStorage`) para no preguntar cada request.
    - Si `orgs.length === 0`: el usuario no tiene acceso a ninguna org; se redirige a una pantalla de "sin acceso" (flujo a definir en `auth`).

3. **Propagación a la API**: la UI adjunta `X-Organization-Id: <orgId>` a **cada llamada** a `/api/v1/okr/...`. El `TenantGuard` (de `auth`):
    - Lee el header.
    - Valida que el usuario tenga membership en esa org (lookup a `core.user_organization_role`).
    - Popula el `AuthContext` con `organizationId`.
    - Si el header falta o la membership no existe → `HTTP 403`.

**Alternativa considerada y descartada**: codificar la org activa como *claim JWT* (`active_org_id`), requiriendo re-login para cambiar de org. Descartada porque:

- Usuarios con acceso a múltiples orgs enfrentarían fricción (cerrar sesión, esperar redirect Auth0, re-login) cada vez que necesiten cambiar de contexto.
- Introduce drift entre el claim del JWT y el estado de membership en DB (si se revoca acceso a una org, el JWT sigue siendo válido hasta que expire).
- Complica el refresh silencioso del token.

El enfoque de header explícito + validación por DB en cada request cuesta una query indexada (ya presente para resolver permisos), es tolerante a cambios de membership en caliente, y no acopla la UX al flujo Auth0.

### Edge cases de tenant scoping

- **Superadmin cross-tenant**: fuera del alcance de este ADR. Cuando se diseñe (en el ADR de `core` o `auth`), se propone un decorator `@SuperadminOnly()` que, combinado con una marca en el `AuthContext`, hace que la extensión haga bypass del filtro. En MVP del módulo OKR: **no hay** endpoints superadmin.
- **Operaciones cross-schema**: `okr` no hace joins a `core.organization` ni a `core.period` via Prisma relations (eligiendo mantener schemas desacoplados). Lee esas entidades vía los services de `core`. Por eso la extensión solo vigila modelos del schema `okr`.
- **`audit.event`**: es write-only desde `okr` via `AuditEventEmitter` (no pasa por la extensión del lado de `okr`). El módulo `audit` se encarga de su propio scoping.

### Confirmación

Ningún repository de `okr` hace queries sin `organizationId`. Si un bug lo intentara, la extensión lo fuerza; si la ALS está vacía, la extensión lanza. **Default deny** se cumple por construcción.

---

## Audit events

Cada mutación emite **exactamente un** evento INSERT en `audit.event`. Todos dentro de la misma transacción Prisma que la mutación (ver "Atomicidad").

| Mutación | `action` | `entity_type` | `entity_id` | `diff` (JSONB) | Notas |
|---|---|---|---|---|---|
| `POST /objectives` | `objective.created` | `okr.objective` | `objective.id` | `{ before: null, after: { title, description, periodId } }` | Progreso no se incluye (siempre 0). |
| `PATCH /objectives/:id` (title/desc) | `objective.updated` | `okr.objective` | `objective.id` | `{ before: { title?, description? }, after: { title?, description? } }` | Solo campos cambiados. |
| `DELETE /objectives/:id` | `objective.deleted` | `okr.objective` | `objective.id` | `{ before: { deletedAt: null }, after: { deletedAt: ts } }` | Soft-delete. |
| `POST /objectives/:id/rebalance-weights` | `objective.rebalanced` | `okr.objective` | `objective.id` | `{ before: [{ krId, weightBp }...], after: [{ krId, weightBp }...] }` | Un solo evento cubre el batch (no un evento por KR). Simplifica auditoría. |
| `POST /key-results` | `key_result.created` | `okr.key_result` | `keyResult.id` | `{ before: null, after: { title, description, weightBp, objectiveId } }` | |
| `PATCH /key-results/:id` | `key_result.updated` | `okr.key_result` | `keyResult.id` | `{ before: { ... }, after: { ... } }` | Solo campos cambiados. Si cambió `weightBp`, queda en el diff. |
| `DELETE /key-results/:id` | `key_result.deleted` | `okr.key_result` | `keyResult.id` | `{ before: { deletedAt: null }, after: { deletedAt: ts } }` | Soft-delete. |
| `POST /key-results/:krId/tasks` | `task.created` | `okr.task` | `task.id` | `{ before: null, after: { title, description, weightBp, keyResultId } }` | `progressBp` inicial = 0. |
| `PATCH /tasks/:id` | `task.updated` | `okr.task` | `task.id` | `{ before: { ... }, after: { ... } }` | No emite por `progressBp` (ese tiene su evento dedicado). |
| `DELETE /tasks/:id` | `task.deleted` | `okr.task` | `task.id` | `{ before: { deletedAt: null }, after: { deletedAt: ts } }` | Soft-delete. |
| `PUT /tasks/:id/progress` | `task.progress.updated` | `okr.task` | `task.id` | `{ before: { progressBp: X }, after: { progressBp: Y } }` | Incluso si `X == Y` (RN-29 permite "mismo valor"). Reconstruye historial. |

### Campos comunes en todos los eventos

```
{
  id: cuid,
  occurred_at: timestamp,
  actor_id: userId,           // del AuthContext
  organization_id: orgId,     // del AuthContext
  entity_type: 'okr.objective' | 'okr.key_result' | 'okr.task',
  entity_id: string,
  action: string,             // ver tabla
  diff: JSONB,                // ver tabla
  request_id: string          // obligatorio; poblado por RequestContextInterceptor del módulo audit (ADR 0003)
}
```

**Confirmación**: todas las operaciones listadas son **INSERT**. `audit.event` no sufre ningún `UPDATE` o `DELETE` desde el módulo `okr`. Correcciones se hacen emitiendo un nuevo evento compensatorio (ej: `task.progress.updated` con el valor corregido — el trail retiene la historia).

**No auditado (por decisión explícita)**: lecturas (`GET`). Si más adelante auditoría forense lo pide (accesos a datos sensibles), se agrega en un ADR dedicado.

---

## Auth0 → local RBAC mapping

### Claims Auth0 consumidos

```
Mandatorios:
  sub              → identifica al usuario (se mapea a core.user.auth0_sub)
  email            → display y como fallback de identidad
Custom (namespaced por Auth0 rules):
  https://gestion-publica.ar/orgs      → array de org slugs/ids accesibles
                                         (opcional; si no está, se resuelve por DB)
```

**No se confía** en claims custom de **permisos** (ej: "admin", "user"). El JWT solo identifica **identidad** y (opcionalmente) **la lista de orgs**. Los permisos se resuelven **siempre** en DB por request, contra:

- `core.user_organization_role` (filas `(user_id, organization_id, role_id)`)
- `auth.role` (`id`, `key` — ej: `org-admin`, `org-user`, `org-reader`)
- `auth.role_permission` (`role_id`, `permission_key`)
- `auth.permission` (`key` — ej: `okr:read`, `okr:write`, `okr:progress:write`, `okr:admin`)

### Por qué resolver en DB y no confiar en claims custom de permisos

- Drift (gotcha 10 de AGENTS.md): si cambia un permiso en la DB, el JWT del usuario sigue con los permisos viejos hasta el refresh. Resolviendo por request se elimina el drift.
- Auth0 actions introducen complejidad de configuración y acoplamiento al dashboard Auth0 para algo que ya modelamos en DB.
- Superficie de confianza menor: el JWT solo identifica, no autoriza.

El cache de permisos por request (AuthContext dura toda la request) evita N queries; con un JOIN optimizado (`user_organization_role` → `role_permission` → `permission`) es una sola query indexada.

### Permisos del módulo `okr`

| Permiso | Capacidad |
|---|---|
| `okr:read` | Lectura de todos los endpoints `GET` (incluidos `/cascade`, `/objectives?period=...`). Rol `org-reader` y superiores lo incluyen. |
| `okr:write` | Creación, edición y soft-delete de Objetivos, KRs, Tasks; rebalance. Rol `org-admin`. |
| `okr:progress:write` | Carga de avance en Tasks (`PUT /tasks/:id/progress`). En MVP (RN-21) lo tienen tanto `org-admin` como `org-user`. |
| `okr:admin` | Reservado. Actualmente sin endpoints atados. Se introduce para operaciones sensibles futuras (ej: restaurar soft-deleted en próxima iteración). |

Mapeo rol → permisos (default que espera `okr`; la fuente de verdad vive en `auth`):

| Rol | Permisos |
|---|---|
| `org-reader` | `okr:read` |
| `org-user` | `okr:read`, `okr:progress:write` |
| `org-admin` | `okr:read`, `okr:write`, `okr:progress:write` |
| `org-superadmin` (futuro) | `okr:read`, `okr:write`, `okr:progress:write`, `okr:admin` |

### Decorators por endpoint

- `GET` endpoints: `@Permissions('okr:read')`.
- `POST/PATCH/DELETE` Objetivo/KR/Task: `@Permissions('okr:write')`.
- `POST /objectives/:id/rebalance-weights`: `@Permissions('okr:write')`.
- `PUT /tasks/:id/progress`: `@Permissions('okr:progress:write')`.

Los decorators son **AND**. Todos los endpoints aplican además `@AuthGuard()`, `@TenantGuard()` y `@ModuleEnabled('okr')`.

### Política ante claims drift

- **Identidad** (sub, email): se toma del JWT. Si Auth0 emite un JWT válido, confiamos en la identidad.
- **Permisos**: resueltos **por request** en DB. Ningún claim custom define `okr:write` directamente.
- **Cambio de rol**: tiene efecto en la próxima request. No requiere re-login.
- **Revocación de acceso a una org**: borrar la fila en `core.user_organization_role`; la próxima request con header `X-Organization-Id: <org>` falla en el `TenantGuard` con 403.

---

## Alternatives considered

### A1. Aritmética de cascada en la DB (trigger / función PL/pgSQL)

- Qué es: el trigger `AFTER UPDATE OF progress_bp ON okr.task` recalcula el KR y el Objetivo.
- **Descartada** porque (a) viola la regla frozen de `okr-domain` (b) impide property-based testing sin DB (c) ata la lógica al motor Postgres (d) hace mucho más difícil debuggear errores de cascada desde el backend.

### A2. Event-driven async con outbox para recálculo

- Qué es: la mutación inserta un evento en `outbox`, un worker lo consume y recalcula.
- **Descartada** porque la spec exige que el usuario **vea** el estado final al terminar la operación (Notas de implementación). La consistencia eventual rompe esa expectativa. Agrega complejidad operacional (worker, reintentos) sin valor para OKR.

### A3. Pesos como `Decimal(5,4)` en vez de `Int` en bps

- Qué es: `weight: Decimal(5,4)` representa 0.0000..1.0000.
- **Descartada** porque (a) la spec razona en bps explícitamente (b) la aritmética entera es más simple y determinística (c) `Prisma.Decimal` cruza todo el stack y fuerza serialización especial (d) property-based testing con `fast-check` trabaja mejor con enteros.

### A4. Optimistic lock con columna `version`

- Qué es: `version: Int` en Objective/KR/Task; los PATCH/DELETE requieren `If-Match` o `version` en el body.
- **Descartada** para MVP porque la invariante de suma ya cumple la función de "detector de conflicto" para los escenarios que importan. Agrega complejidad a clientes y DTOs por un beneficio marginal. Se deja anotada como endurecimiento futuro.

### A5. Guard dedicado de período (`@PeriodOpen()`)

- Qué es: un decorator declarativo que valida que el Objetivo target esté en período abierto.
- **Descartada** porque las reglas varían según la mutación (corriente vs abierto; creación vs edición vs lectura). Un guard único sería demasiado general o lleno de branches. Se prefiere la llamada explícita en los services, que además queda en el mismo lugar donde vive la regla de invariante.

### A6. `SELECT ... FOR UPDATE` sobre Objetivo para concurrencia

- Qué es: bloquear el Objetivo para que dos mutaciones sobre su árbol se serialicen.
- **Descartada** para MVP porque serializa todo acceso al árbol y agrega contención innecesaria. La política "último gana" con revalidación en commit cubre el 95% de los casos. Se deja como endurecimiento si aparece contención real.

### A7. Controller "thin" / service "thick" vs CQRS con command handlers

- Qué es: arquitectura CQRS con handlers separados para commands y queries.
- **Descartada** por overkill para MVP. Un service por entidad + `CascadeOrchestratorService` es suficiente y cumple la regla "no lógica en controllers".

---

## Impact

### Migraciones requeridas (shape, no SQL completo)

1. Crear schemas `core`, `auth`, `okr`, `audit` (si no existen; probablemente en migraciones de `core` y `auth`).
2. Crear tablas `okr.objective`, `okr.key_result`, `okr.task` con columnas, FKs, CHECKs e índices listados en "Data model".
3. Crear índices parciales únicos (via SQL directo, no vía Prisma schema).

### Tests nuevos

- **`packages/okr-domain`**:
  - Unit tests de `computeKrProgress`, `computeObjectiveProgress`.
  - Property-based tests (`fast-check`):
    - Todas las Tasks al 100% y suma de pesos = 10.000 ⇒ KR al 100%.
    - Todas las Tasks al 0% ⇒ KR al 0%.
    - Progreso resultante ∈ [0, 10.000].
    - Linealidad: escalar todas las Tasks por k (donde k ≤ 1) ⇒ KR se escala por k.
    - `validateWeightSumInvariant` detecta todas las sumas ≠ 10.000.
    - `projectSumAfterDelete` equivale a `totalSum - deletedItem.weightBp`.
  - Tests de `truncateBpFromPct` para RN-22 (ej: `33.3333%` → `3333`).

- **`apps/api/test/` (integration, testcontainers Postgres)**:
  - Multi-tenant scoping: admin de Org A no puede leer/mutar entidades de Org B (404).
  - Period gating: crear Objetivo en período no-corriente falla; mutar en período cerrado falla (422).
  - Invariante de suma: crear KR que no suma 10.000 falla (409); rebalance que suma 10.000 pasa.
  - RN-25: soft-delete de KR que dejaría suma ≠ 10.000 falla (409); soft-delete de Objetivo pasa siempre.
  - RN-28: crear 11° KR falla (422); crear 21° Task falla (422); soft-delete libera cupo.
  - RN-27: dos transacciones concurrentes sobre el mismo Objetivo — la que commitea después ve 409 si la suma ya no cierra.
  - Cascada: cargar avance en Task recalcula `progressCachedBp` de KR y Objetivo en la misma response.
  - Audit: cada mutación inserta un evento en `audit.event` con el `diff` esperado.
  - Atomicidad: si el recálculo falla, no persiste nada (ni la Task, ni el cached, ni el audit).

- **`apps/web` (Playwright e2e)**:
  - Admin habilita módulo OKR para una org (asume `core` expone UI o seed).
  - Admin crea Objetivo → KR → Tasks; guardado correcto con suma = 10.000.
  - Usuario con `okr:progress:write` carga avance; ve el % cascadear en la vista árbol.
  - Visualización pública (autenticada, RN-30): lista Objetivos del período corriente.

### Otros módulos afectados

- **`core`**: debe exponer `OrganizationContextService`, `PeriodService` (con `getCurrentOpenPeriod`, `getById` devolviendo `status`), `ModuleEnablementService.isEnabled`. Debe crear `core.organization_module` con seed de módulos conocidos. Debe existir `core.period` con `status: 'open' | 'closed' | 'future'` y FK a `core.organization`.
- **`auth`**: debe exponer `AuthGuard`, `TenantGuard`, `ModuleEnabled`, `Permissions` decorator, `CurrentUser` decorator, tipo `AuthContext`, y la infraestructura de resolución de permisos por request (tablas `auth.role`, `auth.permission`, `auth.role_permission`, `core.user_organization_role`; seed de permisos del módulo `okr`).
- **`audit`**: debe exponer `AuditEventEmitter` que acepte eventos dentro de transacción Prisma (o compartir AsyncLocalStorage de transacción). Debe crear tabla `audit.event` con trigger que rechaza UPDATE/DELETE. Debe publicar el schema de `DomainEvent` consumido por `okr`.
- **`packages/shared-types`**: agrega namespace `okr` con los DTOs listados en "API contract".
- **`packages/okr-domain`**: crear el paquete con las funciones puras listadas.
- **`packages/prisma-tenant-extension`**: crear el paquete con la extensión Prisma que inyecta `organizationId` (ver "Module boundaries" y "Tenant scoping"). Consumido por `auth` (que lo aplica al `PrismaService`) y reutilizable por futuros módulos.

### Faltantes públicos que deben resolver ADRs futuros

Ver el bloque final de la entrega a usuario. En este ADR se asume su existencia.

---

## Consequences

### Trade-offs aceptados

- **Suma validada en service, no en DB**: la DB admite estados transitorios dentro de la transacción. En la práctica toda transacción commiteada deja la suma válida. Hay una ventana de inconsistencia de **microsegundos** dentro de la transacción si alguien observara desde otra sesión con isolation muy permisivo; con READ COMMITTED no hay problema.
- **`progress_cached` denormalizado**: sacrificamos "fuente única de verdad" por performance de lectura. Se mitiga con la disciplina de recalcular en la misma transacción. Si un bug deja `progress_cached` stale, hay una inconsistencia visible; se propone un job de auditoría mensual (fuera de alcance MVP) que compare calculado vs cacheado.
- **`weight_bp Int` en vez de Decimal**: cero problemas de precisión, pero requiere que cualquier futura extensión "peso fraccional con 3 decimales" cambie el tipo. Se considera improbable en OKR.
- **Claims Auth0 no llevan permisos**: un lookup a DB por request. Costo: una query indexada. Beneficio: cero drift. Aceptable.
- **Sin `SELECT ... FOR UPDATE`**: contención no serializada. Aceptable hasta que aparezca evidencia contraria.
- **Soft-delete sin restore**: decisión del producto (ex-AR-06). El módulo no construye la infra de restore. Si aparece, es otro ADR.

### Limitaciones conocidas

- **Admins de múltiples orgs**: el MVP asume un header `X-Organization-Id` setado por la UI. Cambiar de org ≡ cambiar el header. El `TenantGuard` valida membership. No hay "lock" de sesión a una org.
- **Superadmin cross-tenant**: no existe en MVP del módulo `okr`. Cuando se introduzca (otro ADR), la Prisma extension deberá contemplar un bypass controlado.
- **Integridad multi-request**: un usuario podría crear un Objetivo y, en una request aparte, agregar KRs uno por uno. Entre esas requests, la suma intermedia es `< 10.000`; eso **está permitido** (el Objetivo puede quedar temporalmente "plan incompleto" con 0 KRs o con algunos pero no completos). La invariante se exige **al cerrar una operación transaccional**, no como estado global del árbol todo el tiempo. La UI debe alertar "el Objetivo está incompleto" a fin de sesión; no hay bloqueo.
- **No hay ventana de reversión**: soft-delete es inmediato, sin "undo" de 5 segundos. Recrear manualmente es la única vía (ex-AR-06). Si el usuario se equivoca, se recrea.
- **Known Limitation — Silent overwrite on non-invariant concurrent edits**: dos admins editando la misma entidad sobre campos que **no** afectan la invariante de suma de pesos experimentarán *last-write-wins silencioso* — el segundo escritor aterriza, el cambio del primero se pierde, y ninguno recibe notificación. Casos afectados:
    - Dos admins editando el `title` del mismo Objetivo.
    - Dos admins editando la `description` del mismo KR.
    - Dos admins editando pesos de **KRs distintos** dentro del mismo Objetivo, de modo que **ambos** conjuntos de pesos nuevos suman 10.000 por separado (ej: A rebalancea KR1=4000/KR2=6000 y B rebalancea KR3=3000/KR4=7000 manteniendo los demás; ambos commits son individualmente válidos, el segundo pisa al primero).

    El check de invariante **no captura** esta clase de conflicto porque cada escritura, vista aislada, produce un estado válido. Esto es una consecuencia directa de no llevar versionado explícito (RN-27: "último guardado gana si la invariante se sostiene").

    **Mitigación para MVP**: ninguna. Se recomienda a los usuarios coordinar fuera de banda cuando se anticipen ediciones concurrentes sobre la misma entidad.

    **Costo del fix futuro**: ~20–40 líneas de código para agregar una columna monotónica `version: Int` en `okr.objective`, `okr.key_result` y `okr.task`, un check de header `If-Match` en los endpoints `PATCH` / `DELETE` / `PUT progress` / `POST rebalance-weights`, y mapeo a `HTTP 409` con payload accionable (`{ currentVersion, yourVersion }`). No es scope creep: es una extensión **deliberadamente diferida** a MVP+1 pendiente de feedback real de usuarios. El diseño actual no bloquea esa evolución — ni la Prisma extension, ni `packages/okr-domain`, ni los DTOs de `shared-types` cambian.

### Decisiones diferidas

- Restauración de soft-deleted (ex-AR-06) → ADR futuro si se activa.
- Publicación anónima de OKR sin login (ex-AR-12) → ADR futuro de `public-publishing`.
- Clone-to-period (`POST /objectives/:id/clone-to-period`) → referenciado en AGENTS.md pero **no** diseñado en este ADR. Es un feature adicional; merece su propio ADR cuando se priorice (preserva estructura, resetea avances).
- RBAC más fino entre Admin y Usuario-con-carga (ex-AR-11, complemento RN-21) → se resolverá vía nuevos permisos y roles en `auth`; el módulo `okr` ya está preparado (permiso `okr:progress:write` separado de `okr:write`).
- Ponderación entre Objetivos del mismo período (ex-AR-10, ya revisable en la spec) → si se activa, se agrega una nueva tabla o columna `objective.weight_bp`; el modelo actual no lo soporta.
- Métricas auditadas de cascada stale → job de reconciliación periódico, fuera de alcance MVP.

---

## Conflicts with frozen rules

None detected.

Toda la spec es consistente con las frozen rules del proyecto:

- Un Objetivo en exactamente un Período ✓ (RN-01).
- Sin jerarquía vertical entre unidades ✓ (RN-12).
- Sin input directo de `%` a nivel KR ✓ (RN-09; los KRs de métrica se modelan con Tasks).
- Cascada pura en `packages/okr-domain` ✓ (decisión de este ADR).
- Weights en `Int` bps (nunca Float) ✓ (decisión de este ADR).
- Multi-tenant en toda entidad ✓ (decisión de este ADR).
- `audit.event` append-only ✓ (tabla de "Audit events" enumera solo INSERTs).
- Default deny, `@AuthGuard` + tenant scoping en todo endpoint ✓ (decisión de este ADR).
- Sin `--no-verify` en commits, sin imports cruzando internals ✓ (sección "Module boundaries").
