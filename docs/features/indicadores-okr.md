# Módulo 2 — Indicadores en OKRs

> Documento de alcance. Depende de `indicadores-modelo-comun.md` y de que el
> **Módulo 1 esté implementado completo** (`indicadores-gestion.md`).
> Módulos requeridos (via `core.organization_module`): `indicadores-okr`
> **y** `indicadores-gestion` (dependencia validada en `enableModule`).
> Estado: **pendiente de aprobación**.

## 1. Alcance

- Vínculo Metric ↔ KR **uno-a-varios**: un indicador puede alimentar varios
  KRs; cada KR tiene a lo sumo un indicador vinculado.
- "Modo de progreso" del KR: `manual` (comportamiento actual, por tareas) |
  `automatic` (derivado del indicador por interpolación lineal).
- Vínculo a nivel Objetivo: **solo contexto visual**, cero impacto en cálculo.
- **La cascada existente NO se modifica**: el Objetivo sigue agregando sus KRs
  ponderados igual que hoy; solo cambia la fuente del valor del KR.

### No-alcance

- Copilot AI (explícito, fase posterior).
- Agregación de varios indicadores en un KR, fórmulas compuestas, pesos entre
  indicadores.
- Modificación alguna de `packages/okr-domain` (la cascada no cambia).

## 2. Modelo de datos

### Columna nueva en `okr.key_result`

```prisma
model KeyResult {
  // ... campos existentes sin cambios ...
  /// 'manual' | 'automatic' — CHECK en migración. Default 'manual'.
  progressMode String @default("manual") @map("progress_mode") @db.VarChar(10)
}
```

### Tablas nuevas en schema `metrics`

```prisma
model MetricKrLink {
  id              String   @id @default(cuid())
  metricId        String   @map("metric_id")
  /// Un KR tiene a lo sumo un vínculo (unique).
  keyResultId     String   @unique @map("key_result_id")
  organizationId  String   @map("organization_id")
  /// Snapshot al vincular. Default: acumulado actual del indicador.
  baselineValue   Decimal  @map("baseline_value") @db.Decimal(18, 4)
  targetValue     Decimal  @map("target_value") @db.Decimal(18, 4)
  /// 'increasing' | 'decreasing' — heredada del Metric al vincular, editable.
  direction       String   @db.VarChar(10)
  createdByUserId String   @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  metric       Metric       @relation(fields: [metricId], references: [id], onDelete: Restrict)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  // FK a okr.key_result: cross-schema, vía SQL crudo en la migración
  // (mismo patrón que audit.event → core.*).

  @@index([metricId], map: "idx_mkl_metric")
  @@index([organizationId], map: "idx_mkl_org")
  @@map("metric_kr_link")
  @@schema("metrics")
}

model MetricObjectiveContext {
  metricId       String   @map("metric_id")
  objectiveId    String   @map("objective_id")
  organizationId String   @map("organization_id")
  createdByUserId String  @map("created_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")

  metric       Metric       @relation(fields: [metricId], references: [id], onDelete: Restrict)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  // FK a okr.objective: cross-schema vía SQL crudo.

  @@id([metricId, objectiveId])
  @@index([objectiveId], map: "idx_moc_objective")
  @@map("metric_objective_context")
  @@schema("metrics")
}
```

Ambas se registran en `tenant-scoped-models.ts`. El unlink **borra la fila**
de `MetricKrLink` (no soft-delete): la historia queda en `audit.event`
(`kr.metric_unlinked` con diff completo) — ver D-O3.

## 3. Cálculo del progreso automático

Función pura en `packages/metrics-domain`:

```
computeAutomaticKrProgressBp({ baseline, target, actual }): number
  raw = (actual − baseline) / (target − baseline)   // Decimal math
  return trunc(clamp(raw, 0, 1) × 10000)            // bp Int 0..10000
```

- `actual` = acumulado del indicador a hoy (`baselineValue` del Metric + Σ incrementos).
- La misma fórmula sirve para dirección creciente y decreciente **por signo
  del denominador**: si `target < baseline` (decreciente), empeorar (subir)
  da raw negativo → clamp a 0; mejorar más allá del target → clamp a 1.
- Si empeora respecto del baseline → 0%. Si supera el target → 100%.
- `baseline == target` → vínculo inválido (422 al crear/editar).

### Flujo de recálculo (hook)

1. `MetricEntryService` guarda/edita/borra una entry (transacción, Módulo 1).
2. Tras commit, busca vínculos activos del metric (`MetricKrLink`).
3. Por cada KR vinculado llama a la **API pública del módulo OKR** (método
   nuevo exportado en `apps/api/src/modules/okr/index.ts`, ver D-O1):
   `applyAutomaticKrProgress(krId, progressBp, authContext)`.
4. Ese método actualiza `progressCachedBp` del KR y recalcula el cache del
   Objetivo **con la cascada existente** (`computeObjectiveProgress` de
   `okr-domain`, mismo camino que hoy dispara el avance de una tarea), y
   emite `kr.progress_recomputed_from_metric` en audit.

La cascada Objetivo←KRs no cambia ni una línea: solo cambia quién escribe el
`progressBp` del KR.

## 4. Reglas de negocio (RN-O)

1. **RN-O1** — Un KR en modo `automatic` tiene exactamente un `MetricKrLink`; su progreso viene **solo del indicador**. Un KR `manual` se comporta exactamente como hoy.
2. **RN-O2** — Al vincular: baseline default = acumulado actual del indicador (editable), target obligatorio, dirección heredada del Metric (editable). El KR pasa a `automatic` y su `progressCachedBp` se recalcula de inmediato.
3. **RN-O3** — Metric y KR deben pertenecer a la **misma organización y mismo período** (422 si no).
4. **RN-O4** — En modo automático las tareas bajo el KR **se permiten pero son informativas**: conservan su avance y sus sliders, pero NO alimentan el % del KR (nota visual en la UI: "estas tareas no impactan el avance del KR"). El servicio de recálculo **branchea por `progress_mode`**: `manual` → `computeKrProgress(tasks)` como hoy; `automatic` → valor derivado del indicador. La cascada KR→Objetivo queda intacta en ambos modos. Ver D-O2 — matiza la nota de dominio "cascada siempre por tareas" de CLAUDE.md/AGENTS.md; actualizarla en la corrida de implementación.
5. **RN-O5 (caso a)** — Desvincular → el KR **conserva el último % calculado** en `progressCachedBp` y vuelve a `manual`.
6. **RN-O6 (caso b)** — Indicador sin datos (sin entries) → KR en 0% con estado **"sin datos"** (badge en UI; `progressCachedBp = 0`).
7. **RN-O7 (caso c)** — Soft-delete de un Metric con vínculos activos → **bloqueado** (409): primero desvincular. (Endurece RN-M8 del Módulo 1.)
8. **RN-O8 (caso d)** — Cierre de período → % del KR **congelado** al último valor calculado; el vínculo queda read-only (crear/editar/borrar vínculos exige período abierto, `assertPeriodOpen`).
9. **RN-O9 (caso e)** — Editar baseline/target a mitad de período → **permitido**, recálculo inmediato del KR y su Objetivo, evento de auditoría con diff.
10. **RN-O10** — Vínculo a nivel Objetivo (`MetricObjectiveContext`): solo lectura visual, sin efecto en ningún cálculo. El patrón "el objetivo ES el indicador" se logra con un objetivo de **un único KR automático** (documentar en UI/help).
11. **RN-O11** — Todos los endpoints del módulo exigen ambos módulos habilitados (`indicadores-okr` + `indicadores-gestion`) vía `@RequiresModule` sobre `ModuleEnablementService.isEnabled()`.

## 5. Endpoints REST

| Método | Ruta | Permiso | Respuesta |
|---|---|---|---|
| PUT | `/key-results/:id/metric-link` | `metrics:write` | `MetricKrLinkDto` (crea o reemplaza; body: `{ metricId, baselineValue?, targetValue, direction? }`) |
| PATCH | `/key-results/:id/metric-link` | `metrics:write` | `MetricKrLinkDto` (edita baseline/target/direction) |
| DELETE | `/key-results/:id/metric-link` | `metrics:write` | 204 (unlink, RN-O5) |
| GET | `/metrics/:id/links` | `metrics:read` | `{ items: MetricKrLinkDto[] }` |
| PUT | `/objectives/:id/context-metrics/:metricId` | `metrics:write` | 204 (agrega contexto) |
| DELETE | `/objectives/:id/context-metrics/:metricId` | `metrics:write` | 204 |
| GET | `/objectives/:id/context-metrics` | `metrics:read` | `{ items: MetricContextDto[] }` |

`MetricKrLinkDto`: id, metricId, metricName, keyResultId, baselineValue,
targetValue, direction, lastValue, computedProgressBp, estado
(`ok | sin-datos`), createdAt/updatedAt. Decimales como string.

El cascade DTO existente (`ObjectiveCascadeDto`) se extiende: cada KR suma
`progressMode` y, si es automático, `metricLink` embebido (para la Pantalla 3
sin fetch extra).

## 6. Frontend

### Archivos a modificar

- `apps/web/src/app/(app)/objectives/[id]/page.tsx` — detalle de objetivo:
  render condicional del bloque KR según `progressMode` + bloque nuevo de
  contexto (Pantalla 3). (Nota: aprovechar el ítem [R] pendiente de TODO.md de
  converger el type local `CascadeResponse` con `ObjectiveCascadeDto`.)
- `apps/web/src/components/objectives/kr-card-actions.tsx` — kebab del KR:
  acciones "Vincular indicador…" / "Editar vínculo…" / "Desvincular".
- `apps/web/src/components/objectives/task-progress-slider.tsx` — sin cambios
  (los sliders de tareas siguen operativos también bajo un KR automático; sus
  tareas son informativas y no alimentan el %, RN-O4); la barra del KR
  automático es un componente nuevo.
- `apps/web/src/components/objectives/actions.ts` — server actions nuevas.

### Componentes nuevos (`apps/web/src/components/objectives/`)

- `kr-metric-link-dialog.tsx` — selector de indicador del período + baseline
  (prellenado con el último valor) + target + dirección.
- `kr-automatic-progress.tsx` — barra de progreso sin slider + leyenda.
- `objective-context-metrics.tsx` — bloque "Indicadores de contexto".

### Pantalla 3 · KR automático (mockup validado por Pedro)

En el detalle de objetivo existente, el KR vinculado muestra: badge
"⚡ Automático", la leyenda "Vinculado al indicador X · baseline → target ·
último valor", barra de progreso **sin** slider, y nota de cómo se calcula
(interpolación lineal, clamp 0–100). Si el KR automático tiene tareas, se
muestran con la nota "informativas — no impactan el avance del KR" (RN-O4).
Los KRs manuales no cambian en nada.
Bloque aparte "Indicadores de contexto del objetivo": lista de indicadores
solo lectura con último valor, **marcado explícitamente como sin impacto en
el cálculo**.

## 7. Permisos por rol

Sin permisos nuevos: gestionar vínculos = `metrics:write` (org-admin);
ver = `metrics:read`. La escritura del progreso del KR derivada del hook corre
con el `authContext` del usuario que cargó la entry (auditable end-to-end).

## 8. Seeds de demo

Sobre los seeds del Módulo 1: vincular "Trámites digitalizados" a un KR de un
objetivo demo (baseline 0, target 500) y dejar otro KR del mismo objetivo en
manual, para mostrar convivencia. Agregar "Tasa de reclamos" como indicador de
contexto del objetivo. Un objetivo extra "espejo de indicador" con un único KR
automático (patrón RN-O10).

## 9. Secuenciación

Después del Módulo 1 mergeado: (1) migración (`progress_mode` + tablas de
vínculo con FKs cross-schema), (2) `computeAutomaticKrProgressBp` en
`metrics-domain` con property tests (clamp, ambas direcciones, baseline=target
inválido), (3) API pública OKR `applyAutomaticKrProgress` + hook en
`MetricEntryService` + tests de integración del recálculo end-to-end,
(4) endpoints de vínculo, (5) frontend, (6) seeds.

## Decisiones del architect

- **D-O1 · Boundary metrics→okr**: metrics no importa internals de okr
  (regla 1 de CLAUDE.md). El módulo OKR exporta en su `index.ts` un método
  público `applyAutomaticKrProgress(krId, progressBp, authContext)` y metrics
  lo consume vía DI. Alternativa descartada: eventos internos (EventEmitter) —
  más desacoplado pero pierde la transaccionalidad simple y es prematuro.
- **D-O2 · RESUELTA (por Pedro)**: en modo automático el progreso del KR
  viene **solo del indicador**; las tareas bajo ese KR **se permiten pero son
  informativas** (no alimentan el %), con nota visual. El servicio de
  recálculo branchea por `progress_mode`; la cascada KR→Objetivo queda
  intacta. La nota de dominio "cascada siempre por tareas" de
  CLAUDE.md/AGENTS.md se matiza en la corrida de implementación.
- **D-O3 · APROBADA (por Pedro)**: unlink = hard delete del vínculo + evento
  de auditoría con diff completo (el vínculo no es entidad de negocio visible
  post-mortem; su historia vive en `audit.event`). Re-vincular crea fila nueva.
- **D-O4 · Baseline/target/direction viven en el LINK** (snapshot editable),
  no se leen del Metric en tiempo de cálculo: permite que dos KRs usen el
  mismo indicador con metas distintas y aísla al KR de ediciones posteriores
  del Metric (RN-O9 edita el link, no el Metric).
- **D-O5 · Recálculo síncrono en el request de la entry** (sin colas): el
  fan-out típico es de pocos KRs por indicador; si aparece un caso con cientos
  de vínculos se revisará. Registrado como riesgo aceptado.
- **D-O6 · `direction` duplicada en el link**: la fórmula no la necesita (el
  signo del denominador la codifica), pero se persiste para UI/validación
  (badge ↑/↓ y warning si target contradice la dirección declarada).
