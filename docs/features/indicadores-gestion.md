# Módulo 1 — Indicadores de gestión

> Documento de alcance. Depende de `indicadores-modelo-comun.md` (modelo de
> datos, flags, permisos, `metrics-domain`). Flag: `indicadores-gestion`.
> Estado: **pendiente de aprobación**. Se implementa completo ANTES del Módulo 2.

## 1. Alcance

- ABM de indicadores (catálogo por organización y período).
- Carga periódica de avances (incrementos por bucket, retroactiva permitida).
- Visualización esperado vs. real (curva lineal esperada vs. acumulado real).
- Entrada nueva en el nav lateral, visible solo con la flag activa.

### No-alcance

- Vínculo con KRs/Objetivos (Módulo 2).
- **Copilot AI: fuera de alcance en esta fase** (decisión explícita).
- Export/import, alertas por desvío, indicadores multi-período.

## 2. Backend

Nuevo módulo NestJS autocontenido `apps/api/src/modules/metrics/`, espejo de
la estructura de `okr`:

```
apps/api/src/modules/metrics/
├── controllers/
│   ├── metric.controller.ts
│   └── metric-entry.controller.ts
├── dto/
│   ├── create-metric.dto.ts        # name, unit, direction, frequency, baselineValue?, targetValue
│   ├── update-metric.dto.ts        # name?, targetValue?, baselineValue? (unit/direction/frequency inmutables → RN-M2)
│   ├── list-metrics-query.dto.ts   # frequency?, linked? (linked recién opera en Módulo 2)
│   ├── create-metric-entry.dto.ts  # bucketDate, incrementValue, comment?
│   └── update-metric-entry.dto.ts  # incrementValue?, comment?
├── services/
│   ├── metric.service.ts           # CRUD + series (usa metrics-domain)
│   └── metric-entry.service.ts     # CRUD de cargas + acumulados
├── index.ts                        # superficie pública del módulo
└── metrics.module.ts
```

Guards en todos los endpoints (default deny, regla 8 de CLAUDE.md):
`AuthGuard` (global) + `TenantGuard` + `PermissionsGuard` + nuevo
`ModuleEnabledGuard` con `@RequiresModule('indicadores-gestion')`.
Mutaciones dentro de `prisma.runInTransaction` + `auditEmitter.emit`, con
`tenantContextStorage.run(authContext, ...)` — mismo patrón que
`ObjectiveService` (`apps/api/src/modules/okr/services/objective.service.ts`).

### Endpoints REST

| Método | Ruta | Permiso | Respuesta |
|---|---|---|---|
| GET | `/orgs/:orgId/metrics` | `metrics:read` | `{ items: MetricSummaryDto[] }` |
| POST | `/orgs/:orgId/metrics` | `metrics:write` | `MetricDetailDto` |
| GET | `/metrics/:id` | `metrics:read` | `MetricDetailDto` |
| PATCH | `/metrics/:id` | `metrics:write` | `MetricDetailDto` |
| DELETE | `/metrics/:id` | `metrics:write` | 204 (soft-delete) |
| GET | `/metrics/:id/series` | `metrics:read` | `MetricSeriesDto` |
| GET | `/metrics/:id/entries` | `metrics:read` | `{ items: MetricEntryDto[] }` |
| POST | `/metrics/:id/entries` | `metrics:entry:write` | `MetricEntryDto` |
| PATCH | `/metrics/:id/entries/:entryId` | `metrics:entry:write` | `MetricEntryDto` |
| DELETE | `/metrics/:id/entries/:entryId` | `metrics:entry:write` | 204 (soft-delete) |

Envelope `{ items }` en listados, objeto directo en detalle/mutaciones —
mismo patrón que `period.controller.ts` / `member.controller.ts`.

### DTOs (en `packages/shared-types`, subpath nuevo `./metrics`)

- `MetricSummaryDto`: id, name, unit, direction, frequency, baselineValue,
  targetValue, lastValue (acumulado a hoy), expectedToDate, progressPct
  (avance real/target, clamp 0–100, para la barra mini), linkedKrCount
  (0 hasta Módulo 2), periodo `{ id, code, status }`.
- `MetricDetailDto`: summary + description de buckets válidos
  (`buckets: string[]` ISO), createdAt/updatedAt.
- `MetricSeriesDto`: `expected: Array<{ date, value }>` (lineal), `actual:
  Array<{ bucketDate, cumulativeValue }>`, `summary: { cumulative,
  expectedToDate, deviationPct }`.
- `MetricEntryDto`: id, bucketDate, incrementValue, cumulativeAfter, comment,
  createdBy `{ id, displayName }`, createdAt, updatedAt.

Valores `Decimal` viajan como **string** en los DTOs (evitar `number` en
contratos, regla 7); el frontend formatea según `unit`.

## 3. Reglas de negocio (RN-M)

1. **RN-M1** — Nombre único por (organización, período), case-insensitive. 409 si colisiona.
2. **RN-M2** — `unit`, `direction` y `frequency` son inmutables post-creación (PATCH los rechaza con 422). `name`, `baselineValue` y `targetValue` sí se editan (auditado).
3. **RN-M3** — El metric se crea siempre en el **período abierto actual** de la org (mismo criterio que `ObjectiveService.create`: 422 si no hay período abierto).
4. **RN-M4** — Toda mutación (metric o entry) exige período abierto (`assertPeriodOpen`). Período cerrado ⇒ solo lectura, 403 con el mensaje estándar.
5. **RN-M5** — `bucketDate` debe ser una frontera válida del período según RN-C4; carga retroactiva permitida a cualquier bucket pasado del período.
6. **RN-M6** — Editar/borrar una entry pasada: permitido en período abierto, siempre con evento de auditoría (`metric.entry.updated` / `metric.entry.deleted` con diff before/after).
7. **RN-M7** — Buckets vacíos: tolerados (RN-C7). La serie real solo tiene puntos donde hay cargas.
8. **RN-M8** — Soft-delete de metric: en el Módulo 1 no tiene bloqueos; (el Módulo 2 agrega el bloqueo por vínculos activos).
9. **RN-M9** — Dirección solo afecta presentación en este módulo ("Llegar a X" vs "Bajar a X", color del desvío); la matemática de curvas es idéntica.

## 4. Frontend

### Navegación

- **Modificar** `apps/web/src/components/app-shell.tsx`: agregar item
  `{ href: '/metrics', label: 'Indicadores', requiresOrg: true }` a `navItems`,
  condicionado a la flag. El shell recibe una prop nueva `enabledModules:
  string[]` que el layout server (`apps/web/src/app/(app)/layout.tsx`) obtiene
  junto al `me` (nuevo fetch a `/orgs/:orgId/feature-flags` público de lectura
  para miembros — ver Decisiones D-M2).

### Rutas nuevas

- `apps/web/src/app/(app)/metrics/page.tsx` — catálogo (Pantalla 1).
- `apps/web/src/app/(app)/metrics/[id]/page.tsx` — detalle (Pantalla 2).

### Componentes nuevos (`apps/web/src/components/metrics/`)

- `metrics-table.tsx` — tabla del catálogo.
- `metric-filters.tsx` — chips de filtro (client).
- `metric-form-dialog.tsx` — alta/edición (react-hook-form + zod, patrón de los dialogs de objectives).
- `metric-row-actions.tsx` — kebab (⚠ aplicar desde el inicio el fix del bug conocido "kebab queda abierto tras cerrar dialog": DropdownMenu controlado por el padre, TODO.md ítem [B]).
- `metric-chart.tsx` — gráfico de líneas SVG propio (sin dependencia nueva de charting, regla 11; ver D-M1).
- `entry-form-panel.tsx` — panel lateral de carga.
- `entry-history-table.tsx` — historial de cargas.
- `actions.ts` — server actions (patrón `components/objectives/actions.ts`).

### Pantalla 1 · Catálogo (mockup validado por Pedro)

Tabla con columnas: **Indicador** (nombre + unidad), **Frecuencia**, **Meta
del período** (con dirección: ↑ "Llegar a X" / ↓ "Bajar a X"), **Último
valor**, **Avance** (barra mini + %), **Vínculos** (badge "OKR" si tiene —
vacío hasta Módulo 2), **kebab** de acciones (Editar / Eliminar). Chips de
filtro arriba: Todos / por frecuencia / Vinculados a OKRs. Botón primario
"+ Nuevo indicador" (visible con `metrics:write`).

### Pantalla 2 · Detalle (mockup validado por Pedro)

- Header: nombre + badges (meta, frecuencia, período) y botón "+ Cargar
  avance" (visible con `metrics:entry:write`).
- Gráfico de líneas: curva esperada lineal (gris punteada), curva real
  acumulada (color primario, con puntos por bucket cargado), línea de
  referencia horizontal del target. Debajo: acumulado / esperado a hoy /
  desvío %.
- Panel lateral de carga: selector de bucket (incluye buckets anteriores para
  carga retroactiva), campo incremento, comentario opcional. Nota visible: en
  período cerrado la carga se deshabilita.
- Abajo, historial de cargas: fecha, bucket, incremento, acumulado (tras esa
  carga), comentario, usuario, kebab (Editar / Eliminar).

## 5. Permisos por rol

Ver matriz completa en `indicadores-modelo-comun.md` §5. Resumen: `org-admin`
crea/edita/borra indicadores; `org-user` y `org-admin` cargan avances;
`org-reader` solo ve. Superadmin bypass wildcard.

## 6. Seeds de demo

Los del modelo común §7 (3 indicadores con cargas parciales y un bucket vacío
intencional, flag ON en la org demo).

## 7. Secuenciación

Primera corrida implementable tras aprobar los tres docs: modelo común +
este módulo, en este orden: (1) migración + prisma generate, (2)
`metrics-domain` con tests, (3) módulo NestJS + tests de integración
(testcontainers), (4) flags + guard + tab Módulos, (5) frontend, (6) seeds.
**El Módulo 2 no arranca hasta que esto esté mergeado y aprobado.**

## Decisiones del architect

- **D-M1 · Gráfico SVG propio** en vez de recharts/visx: regla 11 de CLAUDE.md
  (no dependencias pesadas sin justificación) y ya existe el precedente del
  Gantt hecho a mano (`apps/web/src/components/gantt/`). Dos polilíneas + una
  línea de referencia no justifican una librería.
- **D-M2 · Lectura de flags para el nav**: `GET /orgs/:orgId/feature-flags` es
  superadmin-only (administración). Para el nav, el layout necesita saber qué
  módulos están activos: se expone la lectura a cualquier miembro autenticado
  de la org (solo lectura de flags no es sensible) manteniendo el PUT
  superadmin-only. Alternativa descartada: duplicar el dato en `/me`.
- **D-M3 · `progressPct` del catálogo** se calcula server-side en el
  summary DTO (trunc a entero en presentación), para que la tabla no tenga
  que traer todas las entries.
- **D-M4 · Entries con soft-delete** (`deletedAt`) en vez de hard delete, por
  simetría con el resto del sistema y porque el historial es un artefacto
  visible del producto.
