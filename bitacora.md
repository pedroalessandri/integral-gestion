# bitacora.md

Registro cronológico de decisiones y corridas. **Una entrada por corrida**, la más reciente arriba.

Formato:

```
## AAAA-MM-DD · Cxx · <rol> · <rama>
- Hecho: <1–3 líneas>
- Commit: <hash>
- Verificación: <comando → resultado en una línea>
- Pendiente / desvíos: <si hubo>
- Preguntas abiertas: <decisiones no cubiertas por la SPEC, si hubo>
```

---

## 2026-10-08 · C18 · frontend-dev · feature/plan-f7-aportes
- Hecho:
  - **"Aporta a indicador"** en la ficha de proyecto (`features/contributions`: server actions, hook `useProjectContributions`, helpers puros y componentes). Lista los aportes con indicador, valor y estado Aplicado/Pendiente (ícono + texto). Permite agregar, editar y quitar; el selector ofrece solo indicadores del mismo objetivo `output` + `execution_feeds_indicator` a los que el proyecto todavía no aporta. Un aporte aplicado tiene editar y quitar deshabilitados con la explicación (se libera cuando el proyecto baja del 100 %). Valor decimal ≠ 0 sin validar el signo, sin `number`.
  - **Cargas automáticas**: badge "Automática" (y "Compensación" si es negativa) con el proyecto de origen y sin acciones (candado con texto para lectores de pantalla), en `entry-history-table.tsx`.
  - **Aviso "los aportes no alcanzan la meta"** en la tarjeta del indicador cuando `contributions.coversTarget === false` (total, valor proyectado y meta).
  - **Curva "Desde proyectos"** habilitada en el editor solo para `output` + `execution_feeds_indicator` (si no, deshabilitada con la razón). El gráfico la arma con `expectedCurve({ mode: 'from_projects' })` de `metrics-domain` y los pasos de `GET indicators/:id/contributions` (1 request por indicador vinculado), con muestras a ambos lados de cada `endsAt` para que se vea el escalón.
  - **422 `IndicatorHasLinkedProjects`**: `describeApiError` arma el mensaje con `details.projects` (`ApiErrorInfo` ahora lleva `details`). Mensajes en español para todos los códigos de aportes en el diccionario de etiquetas.
- Commit: este commit (`feat(web): aportes de proyectos a indicadores, cargas automáticas y curva desde proyectos`)
- Verificación: `pnpm typecheck --force` 7/7; `pnpm lint --force` 0 errores (2 warnings preexistentes en web, 1 en api); `turbo run test --force` 12/12 (web 77 tests, 28 nuevos; api 475); `pnpm --filter web build` OK. No se probó contra la API levantada: lo cubre el smoke de Pedro.
- Pendiente / desvíos:
  - **Campo de vínculo con la gestión (`linkMode`) en el diálogo del indicador**, fuera del alcance de C18 pero necesario: sin él ningún indicador podía ser `execution_feeds_indicator`. Ofrece "Independiente" y "Los proyectos aportan al indicador" (deshabilitada si no es Producto); `indicator_feeds_execution` solo se muestra, deshabilitada, si ya la tiene. En edición `linkMode` viaja solo si cambió.
  - El título del proyecto de una carga automática sale de los aportes vivos del indicador; si el aporte ya no existe o en `/metrics/[id]` dice "Aporte de un proyecto". TODO.md: sumar `sourceProjectTitle` a `MetricEntryDto` (media).
  - Sin Testing Library en web (igual que C16): helpers cubiertos con vitest y componentes con `renderToStaticMarkup`.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ Al pasar el tipo de Producto a Resultado, el vínculo `execution_feeds_indicator` vuelve a `independent` y la curva `from_projects` vuelve a `linear` (también si se quita el vínculo). Aplicado en un commit aparte (`reconcileLinkAndCurve` en `indicator-form.ts`, 3 tests; web 80 tests).
  - ✅ OK a `sourceProjectTitle` en `MetricEntryDto` como ítem de TODO.md.

## 2026-10-08 · C17 · backend-dev · feature/plan-f7-aportes
- Hecho:
  - **Aportes** (migración `20261008000004_project_contribution`, escrita a mano + `migrate deploy`): `metrics.project_contribution` (`contribution_value NUMERIC(18,4)` ≠ 0, único `(project_id, objective_indicator_id)`, `applied_entry_id`, FKs RESTRICT) con scoping de tenant. `metric_entry` suma `origin` (`manual` | `project_contribution`) y `source_project_id`, con un CHECK que los ata. ABM en `okr/indicators/:id/contributions`, `okr/projects/:id/contributions` y `okr/contributions/:id` (`TenantGuard` + `PermissionsGuard`, `okr:read` / `okr:write`), con audit `project_contribution.*`. 422 tipados: métrica no `output`, indicador no `execution_feeds_indicator`, proyecto inexistente, de otro objetivo o `from_indicator` hacia ese indicador (puerto nuevo `PROJECT_LINK_READER`, lo implementa `okr`); 409 `ContributionAlreadyExists`.
  - **Hook** (RN-P13): `okr` publica `project.completed` / `project.reopened` después del commit cuando el avance cruza el 100 %. El oyente de `metrics` reconcilia contra el estado actual del proyecto (fila del aporte con `FOR UPDATE`): crea la carga `+contributionValue` con el comentario "Aporte automático — Proyecto X" o la compensatoria `−` de lo aplicado; nunca borra. Es idempotente frente a eventos repetidos o desordenados y escribe su propio audit. Las cargas automáticas se distinguen por `origin` en `MetricEntryDto` (RN-P14) y son de solo lectura; la carga manual sigue permitida.
  - **`from_projects`** habilitado solo para `output` + `execution_feeds_indicator`: los pasos salen del `endsAt` planificado del proyecto y del `contributionValue`. `IndicatorStatusDto.contributions = { count, total, projectedValue, coversTarget }` para el aviso "los aportes no alcanzan la meta" (C18).
  - **RN-P12**: el cambio de `kind` `output` → `outcome` también se bloquea si algún indicador de la métrica tiene aportes. **ADR D5 regla 3** (lado de los aportes): cambiar el `linkMode` o borrar un indicador con proyectos vinculados da 422 `IndicatorHasLinkedProjects` con `details.projects`. Para eso el filtro global de errores ahora reenvía `details`.
  - `metrics-domain`: `bucketContaining` y `summarizeContributions`.
- Commit: este commit (`feat(metrics): aportes de proyectos a indicadores, carga automática al 100 % y curva from_projects`)
- Verificación:
  - `pnpm typecheck` 7/7; `pnpm lint` 0 errores (1 warning preexistente en api); `pnpm test` 12/12 (api 475, metrics-domain 75, web 49).
  - `psql`: `\d metrics.project_contribution` (único, CHECK y FKs) y `\d metrics.metric_entry` (`origin`, `source_project_id`, CHECKs y FK); migración `20261008000004` aplicada.
  - E2E en DB descartable `gp_c17` (ya borrada), corrido por el subagente: `project-contribution.e2e-spec.ts` 3/3 + `indicator-curves.e2e-spec.ts` 3/3. Cubre el 100 % que crea +4 y mueve el indicador, la baja que crea −4, la idempotencia, la compensación al borrar el proyecto, el 422 con la lista de proyectos y el aislamiento entre orgs. No lo volví a correr en el cierre.
- Pendiente / desvíos:
  - Fuera del plan, en la misma corrida: la regla 3 de ADR D5 (lado de los aportes) y el reenvío de `details` en el filtro de errores. `ObjectiveIndicatorService` toma el `requestId` del request real (antes fallaba el audit del oyente en el harness e2e).
  - TODO.md: el ítem de `from_projects` queda hecho (se mueve a Completados al mergear); nuevo ítem de reconciliación si el oyente falla; falta el otro sentido de la regla 3 (`INDICATOR_LINK_READER` y proyectos `from_indicator`). El seed demo todavía no tiene aportes ni `from_projects` (ítem existente).
- Preguntas abiertas (respondidas por Pedro el 2026-10-08; se mantiene lo implementado):
  - ✅ Fecha de la carga automática: el bucket del momento real en que el proyecto llega al 100 % (no el `endsAt` planificado). La baja del 100 % se fecha en el bucket de la reapertura.
  - ✅ Un aporte ya aplicado no se edita ni se borra hasta que el proyecto baje del 100 % (422 `ContributionAlreadyApplied`).
  - ✅ Borrar un proyecto con aporte aplicado: se compensa y el aporte se da de baja (hard delete, con audit).
  - ✅ Signo del aporte: cualquier valor ≠ 0, sin validar contra la dirección del indicador (los aportes pueden variar).
  - ✅ Si el oyente falla, por ahora solo se loguea; la reconciliación queda en TODO.md.

## 2026-10-08 · C16 · frontend-dev · feature/plan-f6-curvas
- Hecho:
  - **Editor de curva** en el diálogo del indicador (`indicator-form-dialog.tsx`): modo Lineal / Manual y "Desde proyectos" deshabilitado con su explicación (la API lo rechaza hasta C17). En manual hay un campo por intervalo (los buckets salen de `buildBuckets` de `metrics-domain` con el período del objetivo y la frecuencia, así que coinciden con la validación de la API); los vacíos se interpolan y el último intervalo queda bloqueado y siempre vale la meta, de modo que "el último punto = meta" no se puede romper. Validación de decimales en `curve-form.ts` y DTOs con `expectedCurveMode` + `targetPoints` en el mismo POST/PATCH (hace falta si cambió la meta). Mensajes en español para `IndicatorTargetPointsInvalid` (con el detalle de la API) y `ExpectedCurveModeNotAvailable`.
  - **Curva en el gráfico**: `chart-data.ts` ahora evalúa `expectedCurve` de `@gestion-publica/metrics-domain` (función pura, la misma del backend; no se duplicó lógica) sobre las fechas de muestreo de `series.expected` y los puntos de `GET okr/indicators/:id/target-points`. Reemplaza la recta con `Number`. La leyenda dice "Curva esperada (manual|lineal)". Si no se pueden cargar los puntos de un manual, se deja la serie de la API y se avisa.
  - **Semáforos**: `SemaphoreBadge` (texto + ícono + desvío en puntos, `lib/format-deviation.ts` con enteros) en la tarjeta del indicador (desde `/status`), junto a la barra de resultado y junto a la de gestión en el encabezado del objetivo (`GET okr/objectives/:id/status`). Uno por lectura; nunca combinados. Sin cargas: "Sin datos".
  - **"Carga pendiente"**: `PendingLoadBadge` en la tarjeta del indicador (con las fechas en el tooltip) y en la barra de resultado del objetivo (`pendingBucketsCount`).
  - `apps/web` suma la dependencia de workspace `@gestion-publica/metrics-domain` (consume `dist` igual que `shared-types`; turbo la buildea antes por `^build`). Etiquetas en `lib/labels.ts` (`SEMAPHORE_LABELS`, `DEVIATION_LABELS`, `PENDING_LOAD_LABELS`, `EXPECTED_CURVE_MODE_LABELS`). Vitest de web ahora incluye `*.test.tsx`.
- Commit: este commit (`feat(web): editor de curva manual, curva esperada en el gráfico, semáforos y carga pendiente`)
- Verificación:
  - `pnpm typecheck` 7/7; `pnpm lint` 0 errores (2 warnings preexistentes en web); `pnpm test` 12/12 (web 49 tests, 24 nuevos); `pnpm --filter web build` OK.
  - No se probó contra la API levantada: lo cubre el smoke de Pedro (indicador `outcome` semestral con curva manual).
- Pendiente / desvíos:
  - **Listado de objetivos sin semáforo ni badge**: `ObjectiveSummaryDto` no trae el estado y pedirlo por fila sería N+1. Contrato faltante anotado en TODO.md (estado en los ítems de `GET okr/objectives` o `GET okr/objectives/status?periodId=`); los componentes ya existen para enchufarlo.
  - Bug de C14 detectado acá y corregido en este mismo commit (no quedó en TODO.md): `expectedCurve` manual devolvía la base en el instante exacto del inicio del período aunque hubiera un punto ahí (el seed tiene 1/ene → 18), así que el desvío con carga solo en el primer bucket se medía contra la base. Ahora un punto en el inicio (o antes) reemplaza al ancla (inicio, base); test de regresión en `curves.test.ts`.
  - La pestaña hace 1 request extra de `/status` por indicador (y uno de `target-points` por cada manual) más el del objetivo, en paralelo en el servidor.
  - Sin tests de componentes con Testing Library (no está en web): se probaron `SemaphoreBadge` y `PendingLoadBadge` con `renderToStaticMarkup`.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ La meta queda en el inicio del último intervalo (para semestral en período anual, el 1/jul). Se deja así.
  - ✅ Nombres del semáforo: "En tiempo", "Atención", "Atrasado".
  - ✅ Un solo intervalo en el período: se permite; es una curva para ese período y listo. No se bloquea.
- Smoke de Pedro (2026-10-08): OK, indicador `outcome` semestral con curva manual (curva en el gráfico, semáforo y carga pendiente). Fase 6 mergeada (PR #19).

## 2026-10-08 · C15 · backend-dev · feature/plan-f6-curvas
- Hecho:
  - **Lugar común del desvío** (decisión de Pedro en C14): paquete puro nuevo `packages/deviation-domain` (`@gestion-publica/deviation-domain`, misma config que los otros: tsconfig, tsup, vitest, exports; sin dependencias). Tiene `deviationBp` (sobre enteros `bigint` en la misma escala), `progressDeviationBp` (gestión: real − planificado, bp), `aggregateDeviationBp` (media simple o ponderada de los hermanos medibles), `semaphore` y `DEFAULT_SEMAPHORE_THRESHOLDS` (10/25 puntos; -10 exacto verde, -25 exacto amarillo; adelantado siempre verde). Se movieron ahí las funciones y sus tests. `metrics-domain` ya no exporta `deviation` ni `semaphore`; conserva `deviationBp(strings)` solo como adaptador que parsea decimales y delega (lo usa `MetricService`). `okr-domain` suma `plannedExecutionProgress(projects, at)` (RN-P9: planificado de gestión del objetivo, con los mismos pesos todo-o-nada).
  - **Persistencia** (migración `20261008000003_indicator_target_point`, escrita a mano + `migrate deploy`): `metrics.indicator_target_point` (`bucket_date` DATE, `expected_value` NUMERIC(18,4), único `(objective_indicator_id, bucket_date)`, FKs RESTRICT, `organization_id`). Modelo Prisma `IndicatorTargetPoint` agregado a los modelos con scoping de tenant. Los puntos se reemplazan en bloque y se borran físicamente (el before/after completo queda en audit).
  - **API** (`okr/...`, `TenantGuard` + `PermissionsGuard`, `okr:read` / `okr:write`, `ValidationPipe` con whitelist): `expectedCurveMode` y `targetPoints` opcionales en create/PATCH de `ObjectiveIndicator`; `GET|PUT indicators/:id/target-points`; `GET indicators/:id/status`; `GET objectives/:objectiveId/status`. Validaciones 422 tipadas: `IndicatorTargetPointsInvalid` (fecha que no es inicio de bucket de la frecuencia dentro del período, fecha repetida, el último punto debe ser igual a la meta vigente, `manual` sin puntos) y `ExpectedCurveModeNotAvailable`. Si la meta cambia con la curva en `manual`, hay que mandar los puntos en el mismo PATCH. Audit: `indicator_target_points.replaced` (before/after con la lista) y `expectedCurveMode` en `objective_indicator.created/updated`.
  - **`from_projects`**: rechazado con 422 `ExpectedCurveModeNotAvailable`. La SPEC (RN-P17) lo limita a `output` con aportes y los aportes (`ProjectContribution`) son C17: hoy sería una curva plana en la base. `IndicatorStatusService` ya tiene la rama (pasos vacíos). TODO.md suma el ítem para C17.
  - **Estado del indicador**: valor acumulado, `asOf` (último bucket cargado), esperado en `asOf` y esperado hoy, desvío (bp) y semáforo, y buckets pendientes (gracia 10 días, constante). Sin cargas: desvío y semáforo `null`. **Estado del objetivo**: `{ objectiveId, asOf, result, execution }` con cada lectura con su desvío y semáforo; nunca un número único. Resultado: media simple/ponderada de los desvíos medibles de sus indicadores; gestión: `executionProgressCachedBp` contra `plannedExecutionProgress`. `metrics` lee el objetivo por un puerto nuevo `OBJECTIVE_PROGRESS_READER` (`common/contracts`, lo implementa `okr`), sin importar `okr`.
  - Contratos en `shared-types/metrics`: `IndicatorTargetPointInput/Dto`, `SetIndicatorTargetPointsDto`, `IndicatorStatusDto`, `ObjectiveStatusDto` (+ `ObjectiveResultStatusDto`, `ObjectiveExecutionStatusDto`), `SemaphoreColor`, y `expectedCurveMode`/`targetPoints` en los DTOs de create/update. `apps/api/Dockerfile` y `tsconfig.json` conocen el paquete nuevo.
  - Seed: el `outcome` semestral "Viajes diarios en bicicleta" usa curva manual (1/ene → 18, 1/jul → 30 = meta); TODO.md actualizado.
- Commit: este commit (`feat(metrics): curvas esperadas manuales, estado de indicador y objetivo, y paquete deviation-domain`)
- Verificación:
  - `pnpm typecheck` 7/7; `pnpm lint` 0 errores (1 warning preexistente en api, 2 en web); `pnpm test` 12/12 (api 419, deviation-domain 19, metrics-domain 65, okr-domain 106); `pnpm --filter web build` OK.
  - `psql` en la DB local: `\d metrics.indicator_target_point` (columnas, único, FKs) y `\d metrics.objective_indicator`; migración `20261008000003` registrada como aplicada.
  - Punta a punta en DB descartable `gp_c15` (ya borrada), nuevo `test/indicator-curves.e2e-spec.ts` por HTTP real: 3/3 (curva manual con todas las validaciones, estado del indicador -2000 bp amarillo, estado del objetivo con gestión 0 vs planificado 10000 = rojo y resultado intacto, aislamiento entre orgs y default deny). El seed corrió dos veces sin errores y dejó los 2 puntos de la curva.
- Pendiente / desvíos:
  - El desvío se mide en el **inicio** del último bucket cargado (misma x que el gráfico y que los puntos manuales). Con la curva lineal, un bucket recién cargado se compara con el esperado al inicio de ese bucket: el desvío es algo optimista (ver preguntas).
  - En el harness e2e el `requestId` es `'unknown'` y el audit del oyente de resultado falla por la columna `uuid` (solo en el harness; en runtime lo pone el middleware). Los otros e2e del repo están desactualizados. Va a `docs/tech-debt.md`, junto con el adaptador `deviationBp`.
  - TODO.md suma: habilitar `from_projects` (C17) y umbrales del semáforo por org. El ítem de la serie del indicador queda anotado para C16.
  - Se tocó `apps/api/Dockerfile` (copiar y construir el paquete nuevo) para que el deploy no se rompa; no es infra de CI.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ El desvío de resultado se mide contra lo esperado al inicio del último bucket cargado, por ahora.
  - ✅ Desvío del objetivo (resultado): media simple o ponderada de los desvíos de los indicadores con datos; los que no tienen cargas no cuentan y los pesos se renormalizan.
  - ✅ Proyectos `from_indicator`: el planificado sale de las fechas de sus tareas y el real del indicador ("una proporción lineal del avance vs. la realidad").
  - ✅ Los puntos manuales no se obligan a ser monótonos ni a quedar entre base y meta.

---

## 2026-10-08 · C14 · backend-dev · feature/plan-f6-curvas
- Hecho:
  - `metrics-domain/src/curves.ts` (puro, sin DB, valores como strings decimales / bp enteros):
    - `expectedCurve({ mode, at, range, baseline, target, points | steps })`: `linear` reusa `expectedAt`; `manual` interpola en el tiempo entre `IndicatorTargetPoint` (desde (inicio, base) hasta el primer punto; constante después del último); `from_projects` es escalonada: `baseline + Σ contributionValue` de los pasos con `endsAt <= at`.
    - `deviation({ actual, expected, baseline, target })`: envoltorio de `deviationBp` (ya existía; no se duplicó). Signo: positivo = adelantado hacia la meta, para ambas direcciones.
    - `semaphore(devBp, thresholds = { yellowBp: 1000, redBp: 2500 })`: verde `dev >= -yellow`, amarillo `>= -red`, rojo debajo; adelantado siempre verde.
    - `pendingBuckets(entries, buckets, today, graceDays = 10, periodEnd?)`: buckets cerrados hace más de `graceDays` días sin entry.
  - Exportado desde el index; `dist` rebuildeado. `okr-domain` no se tocó (el desvío de gestión de RN-P9 sigue sin función propia ahí; ver preguntas).
- Commit: este commit (`feat(metrics-domain): curvas esperadas, desvío, semáforo y cargas vencidas`)
- Verificación: `pnpm --filter @gestion-publica/metrics-domain test` → 71/71 (25 nuevos, con fast-check); `pnpm typecheck` 6/6; `pnpm lint` 0 errores (1 warning preexistente); `pnpm test` 10/10 (api 390).
- Pendiente / desvíos: `pendingBuckets` recibe un 5to parámetro opcional `periodEnd` (no está en el plan): sin él, el último bucket no tiene cierre conocido y nunca vence.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ Umbrales 10/25 puntos; bordes: exactamente -10 puntos es verde y exactamente -25 es amarillo.
  - ✅ Manual: antes del primer punto se interpola desde la base en el inicio del período, por tiempo.
  - ✅ Desvío y semáforo se mueven a un lugar común, ni `okr-domain` ni `metrics-domain` ("los OKR progresivamente van a tener menos peso"). Se hace en C15; el desvío de gestión (RN-P9) usa ese mismo lugar.
  - ✅ El parámetro `periodEnd` de `pendingBuckets` queda aprobado.
  - Sin cambio: `from_projects` parte de la base del indicador (D8) y sube en el `endsAt` planificado de cada proyecto con aporte (RN-P17); se revisa en C17.

## 2026-10-08 · C13 · backend-dev · feature/plan-f5-migracion
- Hecho:
  - PA-1 quedó respondida por Pedro y registrada en SPEC §8 y en las Open questions del ADR-0009: no hay clientes con datos reales en producción; los datos viejos son descartables y se pueden borrar siempre. Desbloquea la Fase 5.
  - `apps/api/src/database/migrate-to-planning.ts`: script idempotente con `--dry-run` (hace todo en una transacción por org y la revierte; los conteos son los reales) y `--org <slug>`. Por org: asegura la unidad central, crea siempre "Sin asignar" (`ministry`) y le asigna los objetivos sin unidad; KR `automatic` con `MetricKrLink` -> `ObjectiveIndicator` (métrica, base, meta, dirección y peso) y sus tareas a un proyecto "Tareas de <KR>"; KR `manual` (o automático sin vínculo) -> `Project` con título, owner, peso y fechas min/max de sus tareas o del período, y re-parenta sus tareas; recalcula indicador, proyecto y las dos lecturas del objetivo con `metrics-domain` / `okr-domain`. Idempotencia por `legacy_key_result_id` (indicador o proyecto). Audit `migration.*` con actor `system:migration` (un `request_id` por corrida); no hay UPDATE ni DELETE sobre `audit.event`.
  - Lógica pura del mapeo en `planning-migration.ts` (19 tests Vitest sin DB, incluida la cascada de `okr-domain` sobre el resultado). Scripts de `apps/api`: `migrate:planning` y `migrate:planning:dry-run` (corren sobre `dist/`).
  - `seed-demo.ts` reescrito: "Municipalidad de San Carrillo" (org `demo`, año en curso), 1 plan con 2 ejes, central + 3 unidades con visión y misión, 5 objetivos (uno sin eje), 8 métricas / 8 indicadores (`output` mensuales, `outcome` semestral, trimestral, anual y mensual), 8 proyectos y 19 tareas, con resultado y gestión derivados por las funciones puras. Borra primero los datos de negocio de la org demo (PA-1) y no toca `audit.event`.
- Commit: este commit (`feat(api): script de migración KR -> planificación y seed demo de San Carrillo`)
- Verificación:
  - Seed viejo + datos legacy extra (2da org con KR auto sin tareas, KR manual con y sin tareas, objetivo borrado): `--dry-run` y real dieron 2 indicadores, 4 proyectos, 5 tareas re-parentadas, 3 objetivos asignados, 2 recalculados y 20 eventos `migration.*`; la 2da corrida real dio todo en 0. Con `psql`: 5 KR vivos = 2 indicadores + 3 proyectos de KR manual (más 1 proyecto "Tareas de" del KR automático con tareas), todos con `legacy_key_result_id`; 0 tareas quedan colgando de un KR.
  - Seed nuevo sobre DB vacía descartable (ya borrada): 1 plan, 2 ejes, 4 unidades, 5 objetivos, 8 métricas, 22 cargas, 8 indicadores, 8 proyectos, 19 tareas; segunda corrida sin errores. También probado sobre una copia con datos migrados (se llevó los datos viejos de la org demo y no tocó la otra org).
  - `pnpm typecheck` 6/6, `pnpm lint` 0 errores (1 warning preexistente), `pnpm test` 10/10 (api 390 tests).
- Pendiente / desvíos:
  - Fuera del seed por no existir todavía: curva manual (`IndicatorTargetPoint`), curva `from_projects`, `ProjectContribution`, `linkMode` distinto de `independent` y proyectos `from_indicator`. TODO.md suma el ítem para C15/C17.
  - Los nuevos y viejos `progress_cached_bp` del KR legacy no se tocan (`KeyResult` y `MetricKrLink` siguen vivos hasta F10).
  - El seed no emite audit (igual que el anterior y las migraciones de catálogo).
  - Un solo `$transaction` por org con timeout de 120 s; para una org muy grande habría que partir.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ Pesos al partir los KR en indicadores y proyectos: queda lo actual. Si el grupo resultante no queda completo y sumando 10000, queda sin pesos (promedio simple), sin renormalizar; "Tareas de <KR>" no lleva peso propio.
  - ✅ KR `automatic` sin `MetricKrLink` se migra como proyecto.
  - ✅ Dos KR del mismo objetivo con la misma métrica: el segundo queda como CONFLICTO y no se migra.
  - ✅ "Sin asignar" se crea siempre, como dice la SPEC (corregido en un commit aparte sobre la misma rama).
  - ✅ "3 unidades" del seed: 3 operativas bajo la central (4 en total).
  - ✅ El seed no emite audit.
- Smoke de Pedro (2026-10-08): OK en Railway (migración y seed), con todo el contenido levantado. Fase 5 mergeada (PR #18).

## 2026-10-08 · C12 · frontend-dev · feature/plan-f4-indicadores
- Hecho:
  - `features/indicators`: acciones de servidor (`okr/objectives/:id/indicators`, `okr/indicators/:id`, `PUT .../weights`, catálogo de métricas, serie y cargas), hook `useObjectiveIndicators` (reusa `useWeightedGroup`/`WeightsControl`/`WeightsDialog` de proyectos), helpers puros (`indicator-form.ts`: validación de base/meta/dirección con enteros escalados, DTOs; `chart-data.ts`).
  - Pestaña "Indicadores" en la ficha de objetivo: tarjeta por indicador (tipo, frecuencia, base → meta, valor actual o "Sin datos", peso, avance en bp), gráfico real vs. esperado lineal (reusa `MetricChart`), carga de valores y historial (reusa `EntryFormPanel` y `EntryHistoryTable`). Editor de indicador (crear con métrica nueva o existente en un solo paso; editar tipo, fuente, descripción, base, meta y dirección), baja, y toggle "Ponderar" todo-o-nada.
  - Encabezado del objetivo: barra "Avance de resultado" (`resultProgressCachedBp`) al lado de "Avance de gestión", cada una con su propia instancia de `ProgressReadingBar`; nunca se combinan.
  - Pendientes de C10: `metric-form-dialog.tsx` manda `kind` (obligatorio) y suma fuente y descripción; las frecuencias `quarterly`/`semiannual`/`annual` entran en `parseFrequency` y en los filtros (`isMetricFrequency`); `MetricRowActions` pasa los campos nuevos al editar.
  - Mensajes en español para `MetricKindChangeBlocked`, `LinkModeRequiresOutputMetric`, `IndicatorDirectionMismatch`, `IndicatorBaselineEqualsTarget`, `IndicatorTargetRequired`, `IndicatorMetricSourceInvalid`, `IndicatorPeriodMismatch`, `IndicatorAlreadyLinked`, `MetricInUseByObjective` e `InvalidBucketDate`; las acciones de métricas ahora usan `describeApiError` (antes mostraban el mensaje crudo). Etiquetas de tipo en `lib/labels.ts` (`INDICATOR_KIND_LABELS`).
  - `apps/web` suma `typecheck` (`tsc --noEmit`) y Vitest (devDependency `vitest`, la misma versión que el resto del monorepo): 25 tests de `weights.ts`, `indicator-form.ts` y `chart-data.ts`.
- Commit: este commit (`feat(web): pestaña Indicadores con gráfico, carga de valores, ponderación y avance de resultado`)
- Verificación:
  - `pnpm typecheck`: 6/6 OK (web incluido).
  - `pnpm --filter web lint` y `pnpm lint`: 0 errores, 2 warnings preexistentes en web y 3 en api.
  - `pnpm test`: 10/10 tareas OK (web 25 tests, api 371 tests).
  - `pnpm --filter web build`: OK.
  - No se probó contra la API levantada (lo cubre el smoke de Pedro: cargar 3 buckets y ver las dos barras moverse por separado).
- Pendiente / desvíos:
  - El gráfico redibuja la recta esperada en el front con la base y la meta del indicador, porque `GET metrics/:id/series` usa las de la métrica (D8). El resumen de esa serie (esperado a hoy, desvío) no se muestra: el desvío de resultado es de C14–C16. Ítem en TODO.md.
  - El gráfico y las cargas usan endpoints del módulo "Indicadores de gestión" (`metrics:*`). Si la org no lo tiene habilitado, la pestaña lista los indicadores igual y avisa en cada uno; la creación solo ofrece "métrica nueva".
  - `linkMode` no está en el editor (siempre `independent`) hasta C17. Ítem en TODO.md.
  - El peso del indicador no se edita en el form: solo por "Editar pesos" en bloque, como proyectos y tareas. Un indicador nuevo en un grupo ponderado entra con 0 %.
  - Editar tipo, fuente o descripción son dos llamadas (métrica, luego indicador), no atómicas, y piden `metrics:write`. Ítem en tech-debt.
  - Sin curva manual ni `from_projects` (F6), como indica el plan.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ Baja de un indicador: alcanza con el aviso actual (la métrica y sus cargas se conservan); no hace falta contar las cargas.
  - ✅ Peso de un solo indicador en el editor: por ahora no; se sigue editando en bloque. Queda a futuro en TODO.md (prioridad baja).
- Smoke de Pedro (2026-10-08): OK, 3 buckets cargados y las barras de resultado y gestión se mueven por separado. Fase 4 mergeada (PR #16); CI de `main` en verde.

## 2026-10-08 · C11 · backend-dev · feature/plan-f4-indicadores
- Hecho:
  - Migración `20261008000002_objective_indicator`, escrita a mano y aplicada con `migrate deploy`. Crea `metrics.objective_indicator`: base y meta NUMERIC(18,4), `direction`, `weight_bp` nullable, `expected_curve_mode`, `link_mode`, `progress_cached_bp`, `legacy_key_result_id` y `deleted_at`, con CHECKs, único parcial `(objective_id, metric_id)` entre vivos y FKs. También agrega la FK pendiente de C08 `okr.project.source_objective_indicator_id`.
  - ABM en `metrics` bajo `okr/objectives/:id/indicators`, `okr/indicators/:id` y `PUT .../indicators/weights`. Se puede crear con `metricId` o con métrica inline, en la misma transacción y en el período del objetivo. Base, meta y dirección mandan desde el indicador (D8). Hay audit `objective_indicator.*`.
  - Recálculo según ADR-0009 D5. En su transacción, `metrics` recalcula `progressCachedBp` de los indicadores y el agregado del objetivo (`computeResultProgress`). Después del commit emite `indicator.progress_changed` (`@nestjs/event-emitter`). En `okr`, `IndicatorProgressListener` setea `resultProgressCachedBp` de forma idempotente y audita `objective.result_progress_changed`. La gestión no se toca.
  - Se dispara al crear, editar o borrar una `MetricEntry` o un indicador y al cambiar pesos.
  - Pesos todo-o-nada con el helper movido a `common/weights`. Validaciones:
    - RN-P12: `MetricKindChangeBlocked`.
    - RN-P14b: `LinkModeRequiresOutputMetric`.
    - Dirección contra (meta − base): `IndicatorDirectionMismatch`.
  - Funciones puras: `objectiveIndicatorProgressBp` y `accumulatedValue` (`metrics-domain`), `computeResultProgress` (`okr-domain`).
- Commit: este commit (`feat(metrics): ObjectiveIndicator con avance de resultado por evento post-commit, pesos opcionales y RN-P12`)
- Verificación:
  - `pnpm typecheck --force`: 5/5 OK.
  - `pnpm --filter api test`: 37 archivos, 371 tests OK.
  - `okr-domain`: 101 tests OK. `metrics-domain`: 46 tests OK.
  - `pnpm --filter api lint`: 0 errores, 3 warnings preexistentes.
  - `psql \d metrics.objective_indicator`: columnas, CHECKs, únicos parciales y FKs presentes, migración aplicada.
  - Punta a punta en DB descartable `gp_c11` (ya borrada), con el oyente real por `@OnEvent`. El resultado pasó por 0 → 1250 → 3750 → 5000 → 3250 → 10000 y la gestión quedó fija en 4750. Hubo 7 audits `objective.result_progress_changed` con el actor del payload; los pasos sin cambio no auditaron.
- Pendiente / desvíos:
  - Dependencia nueva `@nestjs/event-emitter@^2.1.1` (la v3 pide Nest 11).
  - El payload del evento suma `organizationId`, `actorId` y `requestId` a lo que pide el ADR. Con eso el oyente arma su contexto sin depender del ALS.
  - El lock del grupo es un `pg_advisory_xact_lock` por objetivo en `metrics` y ya no bloquea la fila de `okr.objective`. Los mocks no detectaban que `$queryRaw` falla con una función `void`; se pasó a `$executeRaw`.
  - El orden de eventos concurrentes no está garantizado. Quedó en tech-debt.
  - Las rutas van bajo `okr/` sin `ModuleEnabledGuard`, como `ProjectController`.
  - `expected_curve_mode` queda con default `linear` y sin DTO hasta F6.
  - Borrar una métrica que mide un objetivo vivo da 409.
  - No se corrieron los e2e.
  - TODO.md suma 2 ítems: el 422 por proyectos vinculados (C17/F7) y que borrar un objetivo no da de baja sus indicadores. tech-debt suma 3 ítems.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08 y aplicadas en este mismo commit con amend):
  - ✅ Respetar el ADR: el recálculo del objetivo va por evento post-commit, no por puerto síncrono. Se eliminó `OBJECTIVE_RESULT_RECOMPUTER`.
  - ✅ Crear con métrica inline exige solo `okr:write`.
  - ✅ Dirección que contradice el signo de (meta − base): 422, en create y en update.
  - ✅ El valor actual es el acumulado de la métrica; la base del indicador solo entra en la interpolación.

## 2026-10-08 · C10 · backend-dev · feature/plan-f4-indicadores
- Hecho: migración `20261008000001_metric_kind_source_frequencies` (escrita a mano, aplicada con `migrate deploy` porque `migrate dev` es interactivo): `chk_metric_frequency` suma `quarterly`, `semiannual` y `annual` (RN-P15); columnas `kind VARCHAR(10) NOT NULL DEFAULT 'output'` con `chk_metric_kind` (`output`|`outcome`), `source VARCHAR(500)` y `description VARCHAR(2000)` nullable. `metrics-domain/buckets.ts`: buckets trimestrales (ene/abr/jul/oct), semestrales (ene/jul) y anuales; si el período arranca a mitad de bucket, el primer bucket empieza en la fecha de inicio. Tipo `MetricKind`. DTOs: `kind` obligatorio en el create; `source` y `description` opcionales; en el update los tres son opcionales y `source`/`description` aceptan `null`; `frequency` sigue fuera del update (RN-P16, lo rechaza `forbidNonWhitelisted`); el filtro del listado acepta las 6 frecuencias. `MetricSummaryDto` y los payloads de audit `metric.created`/`metric.updated` llevan los campos nuevos. En web, solo las 3 etiquetas nuevas de `FREQUENCY_LABELS` (`Record` exhaustivo).
- Commit: este commit (`feat(metrics): frecuencias trimestral, semestral y anual, y tipo, fuente y descripción del indicador`)
- Verificación: `pnpm --filter metrics-domain test` → 6 archivos, 41 tests OK (9 nuevos de buckets); `pnpm --filter api test` → 33 archivos, 314 tests OK; `pnpm typecheck --force` → 5/5 OK; `psql \d metrics.metric` → columnas y CHECKs presentes, migración registrada como aplicada.
- Pendiente / desvíos:
  - **El alta de indicadores desde la web da 400 hasta C12**: `kind` es obligatorio y `metric-form-dialog.tsx` no lo manda. C12 tiene que sumar tipo, fuente y descripción al form. El PR de la fase se abre en C12, así que esto no llega a `main` roto.
  - Sin las frecuencias nuevas en web, aunque compila: `parseFrequency` en `app/(app)/metrics/page.tsx` y los filtros de `components/metrics/metric-filters.tsx` (para C12).
  - Largos máximos de `source` (500) y `description` (2000): elegidos por el agente, la SPEC no los fija.
  - No se corrieron los e2e de `apps/api/test` ni hay tests de web.
- Preguntas abiertas (respondidas por Pedro el 2026-10-08):
  - ✅ `kind` por defecto `output` en las métricas existentes: las métricas previas son descartables, así que no hace falta clasificarlas en C13.
  - ✅ Pasar `kind` de `output` a `outcome` se bloquea (422) si la métrica ya alimenta un indicador con aportes. Queda en RN-P12 de la SPEC y como paso de C11 (`execution_feeds_indicator`) y C17 (`ProjectContribution`), porque esas tablas todavía no existen.

## 2026-10-08 · Fix · Claude · fix/web-server-actions-async, chore/ci-workflow
- Hecho: el deploy de producción en Vercel del merge de la Fase 3 (PR #12) falló con `Server Actions must be async functions`: `features/projects/project-actions.ts` es `'use server'` y exportaba arrow functions no `async`. Producción quedó en el deploy del PR #11 sin que se notara. Fix: las 11 acciones pasan a `export async function` (PR #13). Se agrega CI (`.github/workflows/ci.yml`, PR #14): install, `prisma:generate`, build de `packages/*`, `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm --filter web build`, en cada PR y en `main`. Para que `pnpm lint` pase se borró un mock sin usar en `task.service.spec.ts`.
- Commit: `38dae55` (PR #13), `0a3a2ae` (PR #14)
- Verificación: `pnpm --filter web build` local → OK; deploy de producción de `fb269b8` y de `65837ba` → READY; primera corrida del CI en el PR y en `main` → success.
- Pendiente / desvíos: `tsc --noEmit` y lint no detectan errores propios de `next build`; desde ahora el CI lo cubre. Los e2e y Playwright quedan fuera del CI (necesitan DB). La protección de `main` que exige el check `verify` la decide Pedro.
- Preguntas abiertas: ninguna.

## 2026-10-07 · C09 · frontend-dev · feature/plan-f3-proyectos
- Hecho: `features/projects` (acciones de servidor tipadas con `shared-types/okr`, hooks `useObjectiveProjects`, `useProjectTasks`, `useWeightedGroup`, `useWeightDraft`, helpers puros de pesos en bp, formularios y estado de presentación). Ficha de objetivo con pestañas "Resultados Clave" (camino KR intacto) y "Proyectos": lista con ABM (crear acá; editar desde la ficha), warning de borrado con `taskCount` y Gantt proyecto → tareas (reusa `GanttAxis`/`GanttRow`). Nueva ficha de proyecto `/objectives/[id]/projects/[projectId]` con tareas (ABM, avance con el slider existente), Gantt y toggle "Ponderar" (reparto equitativo editable, PUT en bloque; quitar pesos con confirmación). Barra "Avance de gestión" (`executionProgressCachedBp`) en el encabezado del objetivo, sola: no se muestra ni se combina con resultado. Mensajes en español para `WeightSumInvalid`, `MixedWeightGroup`, `TaskOutsideProject`, `TaskDatesInvalid`, `ObjectiveWithoutOrgUnit`, `ProjectProgressModeNotSupported`, `ProjectOutsidePeriod`, `ProjectDatesInvalid`, `ProjectOrgUnitOutOfScope`, `OwnerNotMember`. Etiquetas de ponderación en `lib/labels.ts`.
- Commit: este commit (`feat(web): ficha de objetivo con proyectos y avance de gestión`)
- Verificación: `cd apps/web && npx tsc --noEmit` → sin errores; `pnpm --filter web lint` → 0 errores, 2 warnings preexistentes; `pnpm typecheck` → 5/5 OK; `pnpm --filter web test` → web no tiene script de tests (no hay runner). No se probó contra la API levantada (lo cubre el smoke de Pedro).
- Pendiente / desvíos:
  - Sin tests de web (no hay Vitest en `apps/web`); las funciones puras quedaron aisladas para testearlas (tech-debt).
  - Objetivo sin unidad: la pestaña Proyectos muestra el aviso en lugar de la lista y el botón de crear (la API da 422 `ObjectiveWithoutOrgUnit`). El form no ofrece `from_indicator`; el selector de unidad lista la del objetivo y sus descendientes.
  - Las tareas de proyecto solo se editan en título y fechas (la lista no trae descripción ni responsable y no hay `GET tasks/:id`). Ítem en TODO.md.
  - La lista del objetivo no edita proyectos: el lápiz abre la ficha, que sí tiene el detalle completo.
  - Fuera de alcance, ya planificado: Gantt de la vista ejecutiva en Objetivo → Proyecto → Tarea (C22) y desvío/semáforo de gestión (RN-P9, C14–C16). Tampoco hay "aportes a indicadores" en la ficha (F4) ni slot de resultado (C12).
  - La UI todavía no oculta escritura por permisos (`/me`): solo por período cerrado, igual que el resto de la ficha (ya figura en los ítems de C06).
  - Smoke de Pedro en el deploy (2026-10-08): OK, objetivo "Ciclovías" con 2 proyectos y tareas, ponderación y avance de gestión verificados. Fase 3 mergeada (PR #12); el deploy de Vercel de ese merge falló y se corrigió en PR #13.
- Preguntas abiertas (respondidas por Pedro el 2026-10-07):
  - ✅ Crear un proyecto o tarea en un grupo ya ponderado: la UI lo crea con peso 0 % y avisa que hay que usar "Editar pesos". Pedro confirma el flujo tal cual.
  - ✅ Borrar un proyecto o tarea de un grupo ponderado devuelve 422 `WeightSumInvalid` y la UI pide redistribuir primero, sin redistribución en el mismo paso. Pedro confirma la regla actual.

## 2026-10-07 · C08 · backend-dev · feature/plan-f3-proyectos
- Hecho: migración `20261007000003_project_task_project` (escrita a mano, aplicada con `migrate deploy`): `okr.project` (CHECKs de fechas, `progress_mode`, `source`, bp en rango; unique parcial `uq_project_legacy_key_result`), `okr.objective` + `result_progress_cached_bp` / `execution_progress_cached_bp`, `okr.task` + `project_id` (FK) con `key_result_id` y `weight_bp` nullable y CHECKs `chk_task_parent_xor` (proyecto XOR KR) y `chk_task_kr_weight` (el camino KR sigue exigiendo peso). `Project` en `TENANT_SCOPED_MODELS`. ABM de proyectos (`ProjectService` + `ProjectController`, rutas `okr/objectives/:id/projects`, `okr/projects/:id`, `okr/projects/:id/tasks`), permisos `okr:read`/`okr:write`, `TenantGuard` + `PermissionsGuard`, `ValidationPipe`, audit `project.created/updated/deleted`. RN-P4 por puerto nuevo `ORG_UNIT_HIERARCHY` (impl. `core`, `common/contracts`) + `ORG_UNIT_LOOKUP`; fechas dentro del período. RN-P5 y RN-P6 para tareas de proyecto en `TaskService` (`createInProject`, rama proyecto en update/delete/progress). Pesos todo-o-nada con `validateWeightSumInvariant` de `okr-domain` (helper `weight-group.ts`). Recálculo `project-recompute.ts`: tarea → `project.progressCachedBp` (`computeProjectProgress`) → `objective.executionProgressCachedBp` (`computeExecutionProgress`) en la misma transacción, con `SELECT ... FOR UPDATE` del proyecto/objetivo. El camino KR no cambió (sus tests siguen verdes). DTOs en `shared-types/okr` (`project.dto.ts`, `CreateProjectTaskDto`, `TaskSummaryDto` suma `projectId` y `weightBp` nullable, `ObjectiveSummaryDto` suma las dos lecturas) y eventos de audit de proyecto en `domain-event.ts`.
- Commit: este commit (`feat(okr): proyectos y tareas bajo proyecto con avance de gestión`)
- Verificación: `prisma:generate && pnpm typecheck` → 5/5 OK (y `tsc --noEmit` en `apps/web` sin errores); `pnpm --filter api test` → 33 archivos, 314 tests OK; `pnpm --filter api lint` → 1 error y 3 warnings preexistentes, ninguno nuevo; DB descartable `gp_c08` (ya borrada) con el código real (`ProjectService` + `TaskService` + audit): 2 proyectos con 3 tareas → `progress_cached_bp` 7500 y 2000, gestión del objetivo 4750 sin pesos y 5850 con proyectos 70/30, `progress_cached_bp` (KR) y `result_progress_cached_bp` quedan en 0; 422 por unidad de otra rama, por `from_indicator` y por grupo mixto; CHECKs verificados por `psql`.
- Pendiente / desvíos:
  - `progressMode = from_indicator` se rechaza con 422 `ProjectProgressModeNotSupported` en create y update; se habilita en F4/F7. `source_objective_indicator_id` queda sin FK hasta F4 (`metrics.objective_indicator` no existe).
  - Para pasar un grupo de "sin pesos" a "con pesos" (RN-P7) agregué `PUT objectives/:id/projects/weights` y `PUT projects/:id/tasks/weights`: reemplazan de forma atómica los pesos de todos los hermanos vivos (todos con peso y suma 10000, o todos `null`). Sin eso un grupo no podía pasar a ponderado sin quedar mixto. Alta y baja validan el grupo resultante: crear un hermano en un grupo ponderado exige primero quitar los pesos o ajustarlos en bloque.
  - Se agregó `ValidationPipe` a todo `TaskController` (no tenía; tech-debt de C05) además de a los endpoints nuevos. `KeyResultController` sigue sin él.
  - `UpdateTaskDto.weightBp` acepta `null` (solo válido para tareas de proyecto; en una tarea de KR responde 422).
  - Errores de las tareas de proyecto (fechas fuera del proyecto) son 422 (`TaskOutsideProject`, `TaskDatesInvalid`); el camino KR conserva sus 409.
  - El recálculo de cachés derivados no emite audit propio (igual que el camino KR); se audita la mutación (`task.*`, `project.*`).
  - `legacy_key_result_id` sin FK a `okr.key_result` (se elimina en el contract, solo da trazabilidad e idempotencia).
  - `chk_task_weight_bp` quedó duplicada con `chk_task_weight` preexistente (a tech-debt). Item nuevo en TODO.md: validar proyectos y tareas al editar fechas de un período (D7), no está en ninguna corrida.
  - `prisma format` reordenó el alineado de campos del schema (diff más ruidoso de lo necesario). Hay que buildear `okr-domain`, `shared-types` y `prisma-tenant-extension` antes del typecheck del api.
- Preguntas abiertas (respondidas por Pedro el 2026-10-07; 2 y 3 aplicadas en este mismo commit con amend):
  - ✅ Un objetivo sin unidad no admite proyectos (422 `ObjectiveWithoutOrgUnit`): queda así.
  - ✅ Borrar un proyecto se lleva sus tareas: `DELETE okr/projects/:id` responde 200 con `DeleteProjectResultDto` (`deletedTaskCount`, `deletedTaskIds`), hace soft delete de las tareas vivas en la misma transacción y emite un `task.deleted` por tarea; `project.deleted` lleva `deletedTaskIds`. El warning previo lo muestra la UI (C09) con `taskCount`. Sigue el 422 `WeightSumInvalid` si el borrado deja un grupo ponderado con suma ≠ 10000: hay que redistribuir primero (confirmado por Pedro).
  - ✅ Cambiar las fechas de un proyecto que deja tareas afuera: "debería ser un limitante pero no hace limitar ahora". Se quitó el 422; queda en TODO.md (media). Crear o mover una tarea fuera del proyecto sigue dando 422.
  - ✅ `owner_user_id`: se valida como miembro y por defecto queda `null`.
  - ✅ `keyResultId` y `weightBp` nullables en la tarea: se mantiene el modelo de ADR-0009 (tarea → proyecto, KR deprecado hasta F10, pesos opcionales por RN-P6). C09 tiene que contemplar los `null`.

## 2026-10-07 · C07 · backend-dev · feature/plan-f3-proyectos
- Hecho: `okr-domain` con pesos opcionales (RN-P6/P7): `weightMode` (`weighted` | `unweighted` | `mixed`), `validateWeightSumInvariant` acepta grupos sin pesos y devuelve `reason: 'mixed'` para los mixtos, y `projectSumAfterDelete` contempla grupos sin pesos. Helper único `aggregateProgressBp` (vacío → 0; ponderado → `Math.trunc(Σw·p/10000)`; simple → `Math.trunc(Σp/n)`; mixto → `MixedWeightGroupError`), del que delegan `computeKrProgress`, `computeObjectiveProgress` y las nuevas `computeProjectProgress` y `computeExecutionProgress` (RN-P8). Nuevo `planned.ts` con `plannedTaskProgressBp` y `plannedProgress(tasks, at)` (RN-P9). Tests de propiedades y unitarios nuevos; los tests existentes quedaron sin cambios.
- Commit: este commit (`feat(okr-domain): pesos opcionales, avance de gestión y avance planificado`)
- Verificación: `pnpm --filter okr-domain test` → 8 archivos, 95 tests OK; `pnpm --filter okr-domain typecheck` → OK; build de okr-domain + `pnpm --filter api typecheck` → OK (el camino KR compila sin cambios en api).
- Pendiente / desvíos: ninguno. Decisiones de implementación que no fijan reglas de negocio: con suma incorrecta se mantiene la forma de retorno anterior (`{ok:false, actual, expected}`) para no romper a los consumidores. En un grupo sin pesos, `projectSumAfterDelete` devuelve 10000 si quedan hermanos (0 si queda vacío). Un `weightBp = 0` cuenta como peso presente.
- Preguntas abiertas:
  - Tarea de duración cero (`startsAt = endsAt`) en el avance planificado: se tomó 0 antes del fin y 100 desde el fin. La SPEC no lo define porque la fórmula se indefine. ✅ Pedro lo aprueba (2026-10-07).
  - Antes del inicio el avance planificado es 0 y después del fin es 100 (la fórmula acotada a 0–100, igual que el progreso de indicadores en RN-P8). ✅ Pedro lo aprueba (2026-10-07).

## 2026-10-07 · Fix · backend-dev · fix/core-orgid-tenant-check
- Hecho: guard común `OrgParamGuard` (`common/guards`) que compara `:orgId` del path con el tenant del request (lee `request.authContext`, ALS solo como fallback) y responde 403 `TenantMismatch`. Aplicado a `OrgUnitController`, `MemberController` (incluido `PATCH members/:userId/scope`), `OrganizationModuleController` (nuevo: tampoco tenía chequeo), `StrategicPlanController` y `MetricController`; se borraron los `assertOrgParam` locales de planning y metrics. No exceptúa superadmin (igual que antes en planning/metrics). Tests: 9 del guard y 9 de controllers con un harness HTTP (`common/testing/tenant-http-harness.ts`).
- Commit: este commit (`fix(core): validar :orgId del path contra el tenant del request`)
- Verificación: `prisma:generate && pnpm typecheck` → 5/5 OK; `pnpm --filter api test` → 29 archivos, 252 tests OK; `pnpm --filter api lint` → 1 error y 3 warnings preexistentes, ninguno nuevo; e2e `core-member` y `core-module-enablement` → 6 fallas, idénticas en `main` (rotas en `POST /orgs`, a tech-debt).
- Pendiente / desvíos: `PeriodController` y `OrganizationController` quedan sin cubrir: no tienen `TenantGuard` (TODO ADR-0004), así que el guard no aplica sin cambiar la política de acceso. Item `[B]` nuevo en TODO.md.
- Preguntas abiertas: ✅ `PeriodController`: Pedro lo deja en TODO.md con prioridad media (2026-10-07). Mergeado (PR #10).

## 2026-10-07 · C06 · frontend-dev · feature/plan-f2-estructura
- Hecho: Configuración → pestaña "Estructura" (`features/org-structure`): árbol de unidades con ABM, visión y misión, alcance por miembro (`PATCH members/:userId/scope`) y mensajes en español para los 409/422 tipados. Página "Plan de gobierno" (`/plan`, `features/strategic-plan`): estado vacío si 404, crear/editar plan (PUT), ABM de ejes con `objectiveCount` y warning ámbar al borrar un eje con objetivos. Selectores de unidad (solo ministry|area) y de eje ("Sin eje") en el dialog de crear/editar Objetivo. Diccionario `lib/labels.ts` con el glosario.
- Commit: este commit (`feat(web): pantallas de estructura y plan de gobierno`)
- Verificación: `pnpm --filter web typecheck` no existe (sin script en web) → se corrió `tsc --noEmit` en `apps/web` → sin errores; `pnpm --filter web lint` → 0 errores, 2 warnings preexistentes.
- Pendiente / desvíos:
  - Los ejes muestran solo `objectiveCount`: el backend todavía no expone las dos lecturas agregadas ni las unidades por eje (SPEC §5.2).
  - El filtro global de errores del api descarta `members` del 409 `OrgUnitHasMembers` y el código de dominio llega como prefijo del `message`. El front parsea el prefijo (`lib/api-errors.ts`) y deduce los miembros bloqueantes de la lista cargada. Bug en TODO.md.
  - Carpetas `features/*` según CLAUDE.md (lo existente usa `components/<area>`). Reglas de UX (profundidad ≤ 4, hijos por kind) duplicadas en `tree.ts` solo para filtrar opciones; la fuente de verdad es la API.
  - Web sin script `typecheck` ni Vitest; `MemberItem` vs `MemberDto` en la página Miembros: los dos en tech-debt.
  - Smoke de Pedro en el deploy (2026-10-07): OK, estructura de San Carrillo creada y todo lo pedido verificado. Fase 2 mergeada (PR #9).
- Preguntas abiertas (resueltas por Pedro el 2026-10-07, ítems en TODO.md):
  - ✅ Permisos en la UI: sí, `/me` expone los permisos y la UI oculta o deshabilita la escritura según eso.
  - ✅ `GET members` sin `core:member:manage`: es lo esperado, pero la sección de alcance tiene que mostrar el error explícito (qué permiso falta) para que un admin lo pueda corregir.
  - ✅ La unidad del objetivo es obligatoria.
  - ✅ El plan queda en `/plan`, con ítem propio en la navegación.
  - ✅ Las fechas del mandato se envían como medianoche UTC.

## 2026-10-07 · C05 · backend-dev · feature/plan-f2-estructura
- Hecho: schema `planning` con `strategic_plan` (CHECK de `status`, CHECK fin > inicio del mandato, unique parcial `uq_strategic_plan_active`) y `axis` (soft delete, `order`). `okr.objective` suma `org_unit_id` (nullable) y `axis_id` con FKs RESTRICT. Módulo Nest `planning` (`orgs/:orgId/strategic-plan`: GET/PUT del plan activo y ABM de ejes en `/axes`), auditoría de toda mutación (`strategic_plan.*`, `axis.*`, y `orgUnitId`/`axisId` en `objective.created/updated`). Create/update de Objective aceptan `orgUnitId` y `axisId`; la validación va por puertos nuevos en `common/contracts`: `ORG_UNIT_LOOKUP` (impl. `core`, RN-P3: misma org y kind ministry|area, si no 422 `OrgUnitNotFound`/`OrgUnitKindInvalid`), `ACTIVE_AXIS_LOOKUP` (impl. `planning`: eje vivo del plan activo de la misma org, si no 422 `AxisNotInActivePlan`) y `AXIS_OBJECTIVE_COUNTER` y `AXIS_OBJECTIVE_UNASSIGNER` (impl. `okr`). El stub de `ORG_UNIT_OBJECTIVE_COUNTER` se reemplazó por un count real (movido a "Resuelto" en tech-debt). Permisos: lectura `okr:read`; escritura `planning:plan:manage` (nuevo, solo org-admin). DTOs en `shared-types/planning` (subpath nuevo, agregado a `exports`, al script de build y al `paths` del api).
- Commit: este commit (`feat(okr): plan de gobierno, ejes y vínculos del objetivo`)
- Verificación: `prisma:generate && pnpm typecheck && pnpm --filter api test` → 25 archivos, 234 tests OK; `pnpm --filter api lint` → 1 error preexistente en `task.service.spec.ts`, ninguno nuevo; `psql \d planning.strategic_plan`, `\d planning.axis`, `\d okr.objective` → CHECKs, índice único parcial, columnas y FKs presentes; `prisma migrate diff` solo muestra el drift viejo. Smoke con la app compilada contra una DB descartable (`gp_smoke`, ya borrada): 404 sin plan, 422 sin plan al crear eje, 422 rango de mandato, upsert, 400 por body inválido/campos extra, 403 `TenantMismatch`, 403 para `org-user` en escritura, objetivo con unidad central → 422, con unidad/eje inexistente → 422, eje borrado → 422, borrar unidad con objetivos → 409, quitar eje con `axisId: null`, eventos en `audit.event`.
- Pendiente / desvíos:
  - Migración escrita a mano (`20261007000002_strategic_plan_axis`) y aplicada con `migrate deploy`, igual que en C04. No toca `audit.event`.
  - Rutas con `:orgId` en el path (consistente con `org-units`), pero con chequeo `TenantMismatch` contra el tenant del request. Al hacerlo se vio que `OrgUnitController` y `MemberController` (C04) **no** lo tienen: un org-admin de la org A podría operar sobre la org B mandando header A y path B. No se tocó C04; quedó en TODO.md (recomiendo prioridad alta).
  - `ObjectiveController` create/update no tenía `ValidationPipe` (los decoradores de class-validator no corrían). Se lo agregué ahí porque se tocaron esos DTOs; en `KeyResultController` y `TaskController` sigue faltando (tech-debt).
  - `ObjectiveSummaryDto` suma `orgUnitId` y `axisId` (campos requeridos en la respuesta, nullable). El `objective.created` del audit ahora los incluye.
  - `okr` sigue sin exigir unidad en create (nullable hasta la fase migrate, como pedía la corrida). No se agregaron `result/execution_progress_cached_bp`.
  - El `OrgUnit` central rechaza objetivos (RN-P3) también en update; el update no permite dejar el objetivo sin unidad (`orgUnitId` no acepta null).
  - Hay que buildear `shared-types` y `prisma-tenant-extension` después de editarlos (typecheck del api depende de sus `dist`); `StrategicPlan` y `Axis` se agregaron a `TENANT_SCOPED_MODELS`.
- Preguntas abiertas (todas resueltas por Pedro el 2026-10-07 y aplicadas en este mismo commit con amend):
  - ✅ Permiso del plan y los ejes: queda `planning:plan:manage` (solo org-admin, superadmin por wildcard), sin exigir alcance `null`. "Lo que sea más simple, hoy no es bloqueante ni crítico."
  - ✅ Borrar un eje con objetivos: el DELETE hace el soft delete y deja `axis_id = null` en sus objetivos, en la misma transacción, por el puerto `AXIS_OBJECTIVE_UNASSIGNER` (implementa `okr`). `axis.deleted` lleva `unassignedObjectiveIds` y cada objetivo emite su `objective.updated` (`axisId` → null). El DELETE responde 200 con `unassignedObjectiveCount` y `unassignedObjectiveIds`; `AxisDto.objectiveCount` permite el warning destacado previo en C06 (línea agregada al paso 2 de C06 en plan.md).
  - ✅ Archivar o cambiar el plan activo: no hay endpoint. Para cuando se agregue: 409 mientras haya ejes con objetivos (ítem en TODO.md, media). Al editar un objetivo, el eje solo se revalida si cambia.
  - ✅ GET del plan sin plan activo: 404 `StrategicPlanNotFound` (C06 lo trata como estado vacío; el listado de ejes sin plan devuelve `[]`). Crear un eje sin plan: 422 `StrategicPlanRequired`.
  - Sin consulta, por conservador: el upsert es un PUT completo y un PUT sin cambios no genera evento.

## 2026-10-07 · C04 · backend-dev · feature/plan-f2-estructura
- Hecho: `core.org_unit` (CHECK de `kind`, CHECK central ⇔ raíz, unique parcial `uq_org_unit_central_root`) y `user_organization_role.org_unit_id` (nullable, FK). ABM del árbol en `core` (`orgs/:orgId/org-units`, permiso `core:org-unit:manage`) con profundidad ≤ 4, sin ciclos, jerarquía por `kind` (422 `OrgUnitInvalidParentKind`) y sin borrar con hijos, objetivos o miembros (el 409 `OrgUnitHasMembers` lista `userId` y `displayName`). Endpoint `PATCH members/:userId/scope` (RN-P19). La raíz central se crea siempre en `OrganizationService.create` (RN-P1), y la migración hace un backfill idempotente para todas las orgs. Auditoría de toda mutación. Puerto `ORG_UNIT_OBJECTIVE_COUNTER` en `common/contracts` con stub en `okr` hasta C05.
- Commit: este commit (`feat(core): OrgUnit y alcance de membresía`)
- Verificación: `prisma:generate && pnpm typecheck && pnpm --filter api test` → 19 archivos, 191 tests OK; `psql \d core.org_unit` → CHECKs, índice parcial y FKs presentes; `pnpm --filter api lint` → 1 error preexistente en `task.service.spec.ts` (ya en tech-debt), ninguno nuevo.
- Pendiente / desvíos:
  - Fase 0 no estaba hecha en el LXC. Con el OK de Pedro se preparó así: Postgres `gestion_publica_postgres` en `127.0.0.1:5433` (el 5432 lo ocupa `comandapp-db`), `apps/api/.env` desde `.env.example` con ese puerto, `pnpm install` y migraciones. La línea base dio verde.
  - `prisma migrate dev` no corre de forma no interactiva y detecta un drift viejo en `role_permission`. La migración se escribió a mano y se aplicó con `migrate deploy`.
  - ✅ Resuelto (Pedro aprobó el usuario de sistema, 2026-10-07; ocultarlo de los listados del superadmin quedó en TODO.md, prioridad baja). El actor del backfill es `system:migration` (ADR-0009 D6). Como `audit.event.actor_id` tiene FK a `core.user`, la migración inserta un usuario de sistema (`id = auth0_sub = system:migration`, email `system-migration@system.invalid`) con `ON CONFLICT DO NOTHING`.
  - Dev tiene 0 orgs. El backfill se probó con 2 orgs dentro de una transacción con ROLLBACK, corrido dos veces: quedó 1 raíz por org y la segunda corrida no insertó nada.
  - El stub del puerto devuelve 0 (está en tech-debt, prioridad alta, se cierra en C05).
  - Hay que buildear `shared-types` después de editarlo porque el typecheck del api depende de su `dist`.
- Preguntas abiertas (todas resueltas por Pedro el 2026-10-07 y aplicadas en este mismo commit con amend):
  - ✅ Jerarquía por `kind`: `central` solo puede ser raíz. Hijos permitidos: central → ministry|area, ministry → ministry|area, area → area. Cualquier otra combinación da 422, validado en create y en move.
  - ✅ Se confirma el 409 al borrar una unidad con miembros asignados. La respuesta incluye la lista de miembros afectados (`userId`, `displayName`).
  - ✅ La raíz central se crea siempre, con o sin `okr`: al crear la org, de forma idempotente, y con backfill para todas las orgs existentes. RN-P1 de la SPEC quedó actualizada.
  - ✅ Alcanza con setear el alcance aparte por ahora. Elegir unidad al invitar y definir el alcance por defecto quedan en TODO.md (media) y en plan.md C19.

## 2026-10-07 · C03 · architect · feature/plan-f1-adr
- Hecho: guardrails de agentes alineados con ADR-0009. `CLAUDE.md`: regla 4 (jerarquía = `OrgUnit`), regla 5 (período configurable por org), regla 12 (se permiten `plan.md`, `bitacora.md` y `docs/features/*`), regla 15 nueva (validaciones entre módulos por puertos en `common/contracts`, eventos solo post-commit), notas de dominio con 5 niveles, dos lecturas y pesos todo-o-nada, y sección "Glosario UI ↔ código". `AGENTS.md`: reglas de dominio reescritas (modelo, pesos, dos lecturas, `linkMode`, período), patrón de comunicación entre módulos, tests y gotchas sin KR.
- Commit: este commit (`docs: guardrails de agentes para planificación de gobierno`)
- Verificación: `grep -n "OrgUnit\|common/contracts\|Glosario" CLAUDE.md AGENTS.md` → OK; `git diff --stat` → solo CLAUDE.md, AGENTS.md, bitacora.md
- Pendiente / desvíos: plan.md pedía "regla 5 (período anual)"; se aplicó período configurable por org porque ADR-0009 D7 (posterior, decisión D-c de Pedro) lo reemplaza. También se actualizó la línea "Primer módulo funcional" de la Descripción de `CLAUDE.md`, que seguía describiendo la cascada OKR.
- Preguntas abiertas: ninguna nueva. Fin de la Fase 1: PR abierto para revisión y merge de Pedro.

## 2026-10-07 · C02 · architect · feature/plan-f1-adr
- Hecho: ADR-0009 (`docs/adr/0009-planificacion-gobierno-5-niveles.md`, Proposed): vertical declarado, reorientación en el mismo repo, modelo y nombres finales (schema `planning` nuevo; `okr` no se renombra), pesos todo-o-nada, dos lecturas, expand → migrate → contract y decisiones D-a…D-d de Pedro. ADR-0006 lleva "Amended by: 0009". SPEC alineada (períodos configurables, RN-P3, `linkMode`, `Project.progressMode`, RN-P14b).
- Commit: este commit (`docs(okr): ADR-0009 planificación de gobierno en 5 niveles`)
- Verificación: `ls docs/adr` + `grep "Amended by"` + `wc -l` ADR-0009 + `grep linkMode|configurable` en la SPEC → OK
- Pendiente / desvíos: decisiones de diseño propias del architect, a revisar por Pedro: validaciones sincrónicas entre módulos por puertos con token en `apps/api/src/common/contracts/` (`INDICATOR_LINK_READER`, `PROJECT_LINK_READER`, `PERIOD_RANGE_CHECKER_*`) en lugar de `emitAsync` (ajuste de Pedro: sin listener, `emitAsync` pasa en silencio); eventos de dominio solo post-commit; `Project.sourceObjectiveIndicatorId`; unicidad `(objective_id, metric_id)` y `metric.period_id = objective.period_id`; dependencia nueva `@nestjs/event-emitter`.
- Preguntas abiertas: PA-1…PA-5 quedan como Open questions del ADR con el default de la SPEC. Migración resuelta por Pedro en ADR-0009 D6: idempotencia con `legacy_key_result_id` y actor `system:migration`.

## 2026-10-07 · C01 · architect · feature/plan-f1-adr
- Hecho: discovery de impacto de la reorientación a 5 niveles: mapa de uso de `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `progressCachedBp` y `weightBp` (schema, API, paquetes, web), tests afectados, tabla archivo → cambio → fase y 15 riesgos no contemplados por la SPEC.
- Commit: este commit (`docs(okr): discovery de impacto de planificación de gobierno`)
- Verificación: `wc -l docs/features/planificacion-gobierno-impacto.md` → 85 líneas (máx. 150)
- Pendiente / desvíos: ninguno. Sin cambios de código.
- Preguntas abiertas (para ADR-0009 / Pedro):
  - ~~copiloto IA usa KR y bloquea el contract (F10): ¿adaptar antes, deshabilitar o postergar?~~ ✅ Resuelta en ADR-0009 D9 (D-a).
  - ~~sentido de la dependencia `okr` ↔ `metrics` (hoy metrics → okr; RN-P13 la invierte);~~ ✅ Resuelta en ADR-0009 D5 (D-b).
  - ~~qué hacer en la migración con objetivos y métricas en períodos trimestrales (RN-P3 pide anual);~~ ✅ Resuelta en ADR-0009 D7 (D-c).
  - ~~regla de verdad entre base/meta/dirección de `Metric` y de `ObjectiveIndicator`;~~ ✅ Resuelta en ADR-0009 D8 (D-d).
  - ~~mecanismo de idempotencia del script de migración y actor de los eventos `migration.*`.~~ ✅ Resuelta en ADR-0009 D6 (`legacy_key_result_id`, `system:migration`).

## 2026-10-07 · Decisión · Pedro (con Claude) · —
- Hecho: tras la demo con consultores de sector público se decide reorientar el dominio de OKR al modelo de planificación de gobierno de 5 niveles: Visión → Ejes → Visión/Misión por unidad → Objetivos estratégicos con indicadores → Proyectos y tareas.
- Se descartan el fork y el módulo paralelo; se reorienta el dominio en el mismo repo. El sector público pasa a ser el vertical declarado (ADR-0006 D2.5; se formaliza en ADR-0009).
- Feedback de origen:
  - falta de trazabilidad entre objetivo e indicador;
  - el avance de gestión no impacta en el indicador (deseable solo en indicadores lineales);
  - el avance automático del indicador hacia el KR no tiene utilidad;
  - la ponderación debería ser opcional;
  - falta definir cómo se instrumenta por nivel;
  - no está claro qué impacto tiene la frecuencia;
  - falta poder marcar la curva esperada.
- Artefactos: `docs/features/planificacion-gobierno.md` (SPEC), `plan.md`.
- Preguntas abiertas: PA-1…PA-5 en la SPEC §8.
