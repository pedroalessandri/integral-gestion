# Indicadores — Modelo común (Módulos 1 y 2)

> Documento de alcance. Define el modelo de datos compartido por los módulos
> "Indicadores de gestión" (Módulo 1) e "Indicadores en OKRs" (Módulo 2), el
> sistema de feature flags por organización y el guard de módulo.
> Estado: **pendiente de aprobación**. No implementar hasta aprobación explícita.

## 1. Alcance

- Un solo modelo de datos para ambos módulos: `Metric` (catálogo por organización)
  + `MetricEntry` (cargas). El Módulo 1 lo usa suelto; el Módulo 2 agrega el
  vínculo a KRs (ver `indicadores-okr.md`).
- Tabla genérica `feature_flags` para habilitación de módulos por organización,
  pensada para módulos futuros, administrada solo por superadmin.
- Guard liviano de módulo en la API + ocultamiento en navegación.
- Paquete de lógica pura `packages/metrics-domain` (curva esperada, acumulados,
  interpolación), testeable sin DB, espejo del patrón `okr-domain`.

### No-alcance (explícito)

- **Copilot AI: FUERA de alcance en esta fase.** Ni redacción asistida de
  indicadores ni validación SMART. Cuando se retome, reutilizará el módulo
  `ai` existente (cuotas incluidas).
- Owner/assignee propio de indicadores: no hay. Alcanzan los roles existentes.
- Jerarquía o agregación entre indicadores: no hay.
- Papelera con UI de restore: igual que el resto del sistema (soft-delete sin
  pantalla de restauración hoy).

## 2. Modelo de datos

Nuevo schema Postgres **`metrics`** (se agrega a `schemas` del datasource en
`apps/api/prisma/schema.prisma`, hoy `["core","auth","okr","audit","ai"]`).
La tabla de flags es transversal → vive en **`core`**.

Convenciones heredadas del schema existente: cuid como PK, `snake_case` con
`@map`, enums como `VarChar` + CHECK constraint en la migración SQL
(schema-qualified, como todas las migraciones del repo), `deletedAt` para
soft-delete, `organizationId` en toda entidad de negocio.

Valores de indicadores: **`Decimal(18,4)`** (regla 7 de CLAUDE.md: nunca
`Float`/`number`). Redondeo solo en presentación.

```prisma
model Metric {
  id             String    @id @default(cuid())
  organizationId String    @map("organization_id")
  periodId       String    @map("period_id")
  name           String    @db.VarChar(200)
  /// 'number' | 'percent' | 'currency' — CHECK en migración
  unit           String    @db.VarChar(10)
  /// 'increasing' | 'decreasing' — CHECK en migración
  direction      String    @db.VarChar(10)
  /// 'weekly' | 'biweekly' | 'monthly' — CHECK en migración. Fija al crear.
  frequency      String    @db.VarChar(10)
  /// Valor de partida de la curva esperada. Default 0.
  baselineValue  Decimal   @default(0) @map("baseline_value") @db.Decimal(18, 4)
  /// Valor objetivo del período.
  targetValue    Decimal   @map("target_value") @db.Decimal(18, 4)
  deletedAt      DateTime? @map("deleted_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  period       Period        @relation(fields: [periodId], references: [id], onDelete: Restrict)
  entries      MetricEntry[]

  @@unique([organizationId, periodId, name], map: "uq_metric_org_period_name")
  @@index([organizationId, periodId], map: "idx_metric_org_period")
  @@index([deletedAt], map: "idx_metric_deleted_at")
  @@map("metric")
  @@schema("metrics")
}

model MetricEntry {
  id              String    @id @default(cuid())
  metricId        String    @map("metric_id")
  organizationId  String    @map("organization_id")
  /// Primer día del bucket (DATE UTC). Ver reglas de bucketing (RN-C4).
  bucketDate      DateTime  @map("bucket_date") @db.Date
  /// INCREMENTO del período (no acumulado). Puede ser negativo (corrección).
  incrementValue  Decimal   @map("increment_value") @db.Decimal(18, 4)
  comment         String?   @db.Text
  createdByUserId String    @map("created_by_user_id")
  deletedAt       DateTime? @map("deleted_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  metric       Metric       @relation(fields: [metricId], references: [id], onDelete: Restrict)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@index([metricId, bucketDate], map: "idx_metric_entry_metric_bucket")
  @@index([organizationId], map: "idx_metric_entry_org")
  @@map("metric_entry")
  @@schema("metrics")
}

model FeatureFlag {
  organizationId  String   @map("organization_id")
  moduleKey       String   @map("module_key") @db.VarChar(64)
  enabled         Boolean  @default(false)
  updatedByUserId String   @map("updated_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@id([organizationId, moduleKey])
  @@map("feature_flag")
  @@schema("core")
}
```

Además: registrar `Metric`, `MetricEntry` y `FeatureFlag` en
`packages/prisma-tenant-extension/src/tenant-scoped-models.ts` para el scoping
automático por `organizationId`.

## 3. Reglas de negocio comunes (RN-C)

1. **RN-C1** — Toda query filtra por `organizationId` (extensión Prisma + `TenantGuard`, sin excepciones).
2. **RN-C2** — Un `Metric` pertenece a exactamente un período (el mismo `core.period` de OKRs). No hay indicadores multi-período; duplicar a otro período es acción explícita futura.
3. **RN-C3** — `frequency` es **fija al crear**. Cambiarla exige borrar y recrear el indicador.
4. **RN-C4** — Bucketing: los buckets se derivan del rango del período y la frecuencia. `weekly` → lunes de cada semana que intersecta el período; `biweekly` → días 1 y 16 de cada mes; `monthly` → día 1 de cada mes. El primer bucket arranca en `period.startsAt` aunque no caiga en frontera. `bucketDate` debe ser una frontera válida dentro del período (422 si no).
5. **RN-C5** — `MetricEntry` registra el **incremento**, no el acumulado. El acumulado a una fecha = `baselineValue` + Σ incrementos con `bucketDate` ≤ fecha.
6. **RN-C6** — Cargas retroactivas y edición/borrado de cargas pasadas: **permitidas** dentro del período, siempre auditadas con el `AuditEventEmitterService` existente.
7. **RN-C7** — Buckets vacíos tolerados: la curva real no avanza en ese tramo; no es error ni bloquea nada.
8. **RN-C8** — Curva esperada: **SIEMPRE lineal** de `baselineValue` a `targetValue` entre `period.startsAt` y `period.endsAt`. Es referencia visual, no configurable, no se persiste (se calcula en `metrics-domain`).
9. **RN-C9** — Read-only en período cerrado: mismo comportamiento que OKRs. Toda mutación de `Metric`/`MetricEntry` pasa por el patrón `assertPeriodOpen` (hoy en `apps/api/src/modules/okr/services/period-guard.ts`; se extrae copia local al módulo metrics para no romper boundaries, o se promueve a `common/` — ver Decisiones).
10. **RN-C10** — Soft-delete con `deletedAt`, igual que Objetivos/KRs/Tasks. Borrar un `Metric` no borra físicamente sus entries (quedan bajo el metric borrado). Restricción adicional del Módulo 2: bloqueado si tiene vínculos activos a KRs.
11. **RN-C11** — Auditoría append-only de toda mutación: `metric.created|updated|deleted`, `metric.entry.created|updated|deleted`, `feature_flag.enabled|disabled` (entityType `metrics.metric`, `metrics.metric_entry`, `core.feature_flag`).

## 4. Feature flags y guard de módulo

### Claves de módulo

- `indicadores-gestion` (Módulo 1)
- `indicadores-okr` (Módulo 2)

### Semántica

- Sin fila en `feature_flag` o `enabled=false` ⇒ módulo **apagado** (default deny).
- Módulo apagado ⇒ desaparece del nav lateral **y** la API rechaza con 403 `ModuleDisabled`.
- **Dependencia**: `indicadores-okr` requiere `indicadores-gestion` activo.
  - Encender `indicadores-okr` con `indicadores-gestion` apagado → 409.
  - Apagar `indicadores-gestion` con `indicadores-okr` encendido → 409 (apagar primero el dependiente). Sin cascada silenciosa.
- Administración: **solo superadmin** (guard `SuperAdminOnlyGuard` existente, `apps/api/src/modules/auth/guards/superadmin-only.guard.ts`).

### Guard

Nuevo `ModuleEnabledGuard` + decorator `@RequiresModule('indicadores-gestion')`
en `apps/api/src/common/` (es transversal, como `@CurrentUser`). Lee el
`organizationId` del `AuthContext` (ALS `tenantContextStorage`) y consulta la
flag (cacheable en memoria con TTL corto; la invalidación fina no es crítica:
un toggle de superadmin puede tardar segundos en propagar). Se aplica a todos
los controllers de metrics; el Módulo 2 exige **ambas** flags.

### Endpoints de administración

| Método | Ruta | Permiso | Respuesta |
|---|---|---|---|
| GET | `/orgs/:orgId/feature-flags` | superadmin | `{ items: FeatureFlagDto[] }` |
| PUT | `/orgs/:orgId/feature-flags/:moduleKey` | superadmin | `FeatureFlagDto` (body `{ enabled: boolean }`) |

`FeatureFlagDto = { moduleKey, enabled, updatedAt, updatedByUserId }`. El GET
devuelve las claves conocidas del catálogo aunque no exista fila (enabled=false
implícito).

### UI de administración — tab nueva en Configuración

Hoy `apps/web/src/app/(app)/orgs/[id]/settings/page.tsx` NO tiene tabs: es una
columna con `OrgContextForm` + `AiUsageCard`. La sección se reestructura con
Tabs (Radix `@radix-ui/react-tabs`, ya en dependencias):

1. **General** — `OrgContextForm` actual (nombre, misión, visión, valores, contexto adicional).
2. **Copilot AI** — `AiUsageCard` actual (uso del mes).
3. **Módulos** — nueva, **visible solo superadmin**: los toggles de feature flags (Pantalla 4, abajo).

### Pantalla 4 · Feature flags (mockup validado por Pedro)

Por organización, dos toggles: "Indicadores de gestión" e "Indicadores en
OKRs". El segundo aparece **atenuado y bloqueado** si el primero está apagado,
con la leyenda "Requiere Indicadores de gestión". Leyenda general de la tab:
"Los módulos apagados desaparecen de la navegación".

## 5. Permisos por rol

Nuevas permission keys (seed en migración + `packages/shared-types/src/auth/permission-keys.ts`):

| Permiso | Descripción |
|---|---|
| `metrics:read` | Ver indicadores, series y cargas. |
| `metrics:write` | Crear/editar/borrar indicadores; gestionar vínculos a KRs (Módulo 2). |
| `metrics:entry:write` | Cargar/editar/borrar avances (entries). |

Matriz sobre los roles existentes (`auth.role` seed):

| Rol | metrics:read | metrics:write | metrics:entry:write |
|---|---|---|---|
| `org-reader` | ✔ | — | — |
| `org-user` | ✔ | — | ✔ |
| `org-admin` | ✔ | ✔ | ✔ |
| superadmin | wildcard `*` (bypass existente en `TenantGuard`) | | |

Es decir: **crea/edita metrics el `org-admin`; carga entries el `org-user`**
(y superiores). Espejo exacto del split `okr:write` / `okr:progress:write`.

## 6. Paquete `packages/metrics-domain`

Funciones puras, sin DB (patrón `okr-domain`): derivación de buckets
(`buildBuckets(period, frequency)`), acumulado (`accumulate(entries)`), curva
esperada (`expectedAt(date, period, baseline, target)`), desvío, e
interpolación para el Módulo 2 (`computeAutomaticKrProgressBp`). Tests con
Vitest (+ fast-check para invariantes: clamp 0–10000, monotonía de la
esperada, etc.).

## 7. Seeds de demo

Sobre la org demo existente, en el período abierto: 3 indicadores —
"Trámites digitalizados" (number, increasing, weekly, 0→500),
"Tasa de reclamos" (percent, decreasing, monthly, 12→8),
"Recaudación propia" (currency, increasing, monthly, 0→45.000.000) — con
cargas parciales (~60% del período transcurrido, un bucket vacío intencional).
Flags: `indicadores-gestion` ON e `indicadores-okr` ON en la org demo.

## 8. Secuenciación

1. Este modelo común (migraciones `metrics` + `feature_flag`, guard, tab Módulos, permisos, `metrics-domain`).
2. **Módulo 1 completo** (`indicadores-gestion.md`) — implementado y aprobado antes de empezar el 3.
3. **Módulo 2** (`indicadores-okr.md`).

## Decisiones del architect

- **D-A1 · Superposición con `core.organization_module`**: ya existe
  `core.organization_module` + `core.module` (habilitación de módulos del
  backoffice, `module-enablement.service.ts`). La decisión tomada (tabla nueva
  `feature_flags` genérica) se documenta tal cual, pero dejo constancia de la
  redundancia conceptual. Propongo tratar `feature_flag` como el mecanismo
  vigente para módulos nuevos y evaluar en una corrida futura la convergencia
  de `organization_module` hacia `feature_flag`. **Revisar en la aprobación.**
- **D-A2 · Schema `metrics` propio** (no meter las tablas en `okr`): respeta
  el patrón "schema por módulo" y deja al Módulo 1 sin dependencia de `okr`.
- **D-A3 · Múltiples entries por bucket**: permitidas (el acumulado es la
  suma). Simplifica la carga retroactiva y el historial; la alternativa
  (upsert único por bucket) obligaría a merges de comentarios/autores.
- **D-A4 · Incrementos negativos permitidos** como mecanismo de corrección
  (coherente con "edición de cargas pasadas permitida"), siempre auditados.
- **D-A5 · Fronteras de bucket**: weekly=lunes, biweekly=1 y 16, monthly=1
  (RN-C4). No configurables en esta fase.
- **D-A6 · `assertPeriodOpen`**: hoy vive dentro de `okr`. Para no romper el
  boundary de módulos, se promueve a `apps/api/src/common/` (o se duplica la
  función de 14 líneas en metrics). Preferencia: promover a `common/`.
- **D-A7 · Tabs de Configuración**: General / Copilot AI / Módulos (la página
  actual no tiene tabs; había que definir la estructura resultante).
- **D-A8 · Baseline en el modelo común** (`baselineValue` en `Metric`, default
  0): la letra dice "lineal de 0 (o baseline) al target"; lo modelo como campo
  explícito con default 0 en vez de sobrecargar `targetValue`.
- **D-A9 · Cache del guard de módulo** con TTL corto (~30s) para no pegar a la
  DB en cada request; el toggle es una operación rara de superadmin.
