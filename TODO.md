# TODO

> Pendientes de desarrollo del proyecto. Items concretos para próximas
> sesiones de trabajo. Cada item tiene contexto suficiente para retomar
> sin re-investigar.

## 🔥 Prioridad alta — próxima sesión

## 🟡 Prioridad media — próximas semanas

### [F] `MetricEntryDto` sin el título del proyecto de origen de las cargas automáticas
- Por qué: la UI muestra "Aporte del proyecto X" en el historial a partir de los aportes vivos del indicador (`GET indicators/:id/contributions`). Si el aporte ya no existe (proyecto borrado y compensado), o en la vista standalone de métricas (`/metrics/[id]`, sin indicador), la carga automática solo dice "Aporte de un proyecto" (el título queda en el comentario).
- Posible solución: sumar `sourceProjectTitle: string | null` a `MetricEntryDto` (C17 ya tiene `sourceProjectId`).

### [F] Seed demo: sumar `from_projects`, aportes de proyecto y vínculos de gestión cuando existan (F7)
- Por qué: el seed de C13 solo usa lo que existe hoy. La SPEC §6 punto 4 pide un indicador `output` con aportes de proyectos y curva `from_projects`. La curva manual ya está (C15: el `outcome` semestral "Viajes diarios en bicicleta" usa `IndicatorTargetPoint`); falta `ProjectContribution` y `from_projects` (C17), y un proyecto `from_indicator`.
- Posible solución: extender `apps/api/src/database/seed-demo.ts` en la corrida C17.
- Origen: C13 (2026-10-08). Actualizado en C15 (2026-10-08): la curva manual quedó hecha.
- Actualización (C18, 2026-10-08): hecho en `feature/plan-f7-aportes` el indicador "Kilómetros de ciclovía habilitados" con `execution_feeds_indicator` + curva `from_projects` y aportes pendientes de "Ciclovía de la Av. Costanera" (8) y "Bicisendas escolares" (4), que no alcanzan la meta (20). Falta el proyecto `from_indicator` (depende de habilitarlo en `ProjectService`).

### [F] Reconciliar los aportes de proyectos si el oyente falla (consistencia eventual)
- Por qué: el aporte se aplica con el evento `project.completed` / `project.reopened`, post-commit (ADR-0009 D5). Si el oyente de `metrics` falla (DB caída, deploy en el medio), `okr` ya confirmó el avance del proyecto y el indicador queda sin la carga automática (o sin su compensación) hasta el próximo cambio del proyecto. Solo se loguea. `ProjectContributionApplier.reconcileProject` ya es idempotente y reconcilia contra el estado actual del proyecto, así que se puede reintentar sin riesgo.
- Posible solución: un job (cron del módulo `metrics`) o un endpoint admin que recorra los `ProjectContribution` cuyo estado (`appliedEntryId`) no coincide con el avance del proyecto (100 % sin aplicar / aplicado y no al 100 %) y llame a `reconcileProject`.
- Origen: C17 (2026-10-08).

### [F] Semáforos y "carga pendiente" en el listado de objetivos (`GET okr/objectives`)
- Por qué: C16 muestra el semáforo de cada lectura y el badge "carga pendiente" en la ficha del objetivo y en la tarjeta del indicador, pero el listado `/objectives` no los tiene: `ObjectiveSummaryDto` no trae `pendingBucketsCount` ni el estado, y pedir `GET okr/objectives/:id/status` por fila sería un N+1 de requests por render.
- Posible solución (contrato faltante, backend): sumar a los ítems de `GET okr/objectives` un `status` con `{ result: { semaphore, deviationBp, pendingBucketsCount }, execution: { semaphore, deviationBp } }`, o un `GET okr/objectives/status?periodId=` en bloque. Después, en web, usar `SemaphoreBadge` y `PendingLoadBadge` (ya existen en `components/`) en la fila.
- Origen: C16 (2026-10-08).

### [F] Umbrales del semáforo configurables por organización
- Por qué: RN-P9 fija 10 y 25 puntos por defecto y dice que serán configurables por org en una fase posterior. Hoy son la constante `DEFAULT_SEMAPHORE_THRESHOLDS` de `deviation-domain`.
- Posible solución: columnas o tabla de settings por org y pasar `SemaphoreThresholds` a `semaphore()` desde `IndicatorStatusService`.
- Origen: C15 (2026-10-08).

### [F] Edición completa de tareas de proyecto: falta `GET okr/tasks/:id` o ampliar `TaskSummaryDto`
- Por qué: la lista `GET okr/projects/:id/tasks` devuelve `TaskSummaryDto` (sin `description` ni `ownerUserId`) y no existe `GET tasks/:id`. La ficha de proyecto (C09) solo permite editar título y fechas de una tarea; descripción y responsable se fijan al crearla.
- Posible solución: sumar `description` y `ownerUserId` al resumen de tareas de proyecto, o exponer `GET okr/tasks/:id`.
- Origen: C09 (2026-10-07).

### [B] Loading state del dropdown de responsable
- Por qué: en el dialog de crear/editar Objective, KR y Task, el campo "Responsable" aparece vacío durante ~1 segundo mientras se hace el fetch del listado de members, y después aparece el nombre. Visualmente queda como si el campo no estuviera asignado.
- Posible solución: mostrar un skeleton o disabled+spinner hasta que el fetch resuelva. El estado `loading` ya está en OwnerSelect, solo falta usarlo visualmente.
- Estimado: corrida muy chica (~10 min).

### [B] Kebab menu de tareas queda abierto al cerrar dialog
- Por qué: click en los 3 puntitos abre el DropdownMenu; al elegir una opción se abre un Dialog (ej. Editar); cuando se cierra el Dialog, el DropdownMenu queda visible.
- Estado: el kebab de **key results** (`kr-card-actions.tsx`) ya quedó arreglado en la corrida del Módulo 2 (DropdownMenu controlado). Falta solo el de **tareas** (`task-row-actions.tsx`).
- Posible solución: controlar el state del DropdownMenu desde el padre y forzar `setMenuOpen(false)` en el `onSelect` antes de abrir el Dialog. Patrón típico de shadcn cuando un MenuItem dispara un Dialog.
- Estimado: corrida chica (~15-20 min).

### [F] Archivar o cambiar el plan activo (hoy no hay endpoint)
- Por qué: C05 solo hace upsert del plan activo. Decisión de Pedro (2026-10-07) para cuando se agregue: 409 mientras haya ejes con objetivos; hay que definir qué pasa con `axis_id` de los objetivos al cambiar de plan.
- Origen: pregunta abierta de C05.

### [B] El filtro global de errores descarta `members` del 409 `OrgUnitHasMembers` y el código viaja como prefijo del mensaje
- Por qué: `HttpExceptionFilter` devuelve solo `{ statusCode, message, error }` con `error` = nombre de la clase (`ConflictException`), así que `shared-types` (`ErrorResponseDto.details`) y la bitácora de C04 prometen un detalle que no llega. El front parsea el código del prefijo del `message` ("Codigo: detalle") y deduce los miembros bloqueantes de la lista de miembros cargada.
- Posible solución: que el filtro propague el código de dominio en `error` y el resto de las propiedades del response en `details`. Con test.
- Origen: C06 (2026-10-07).

### [F] `/me` expone permisos y la UI oculta la escritura sin permiso
- Por qué: hoy los botones de escritura de Estructura y Plan de gobierno se ven siempre y un 403 aparece recién al guardar. Pedro (2026-10-07): exponer los permisos en `/me` y usarlos en la UI (`core:org-unit:manage`, `planning:plan:manage`, etc.).
- Origen: pregunta abierta de C06.

### [F] Error explícito en la sección de alcance cuando falta `core:member:manage`
- Por qué: `GET members` pide `core:member:manage`; sin ese permiso la sección de alcance de Estructura muestra un error genérico. Pedro (2026-10-07): es lo esperado, pero el mensaje tiene que decir qué permiso falta para que un admin lo corrija.
- Origen: pregunta abierta de C06.

### [F] Unidad obligatoria en el Objetivo
- Por qué: Pedro (2026-10-07): la unidad del objetivo es obligatoria. Hoy el selector la deja vacía al crear y `CreateObjectiveDto.orgUnitId` es opcional. Requerirla en create (UI + DTO); la columna sigue nullable hasta la fase migrate por los objetivos existentes (plan.md), y el NOT NULL va con el contract.
- Origen: pregunta abierta de C06.

### [F] Validar proyectos y tareas al editar las fechas de un período (ADR-0009 D7, RN-P3)
- Por qué: D7 pide que editar un período con un rango que deja afuera proyectos, tareas o cargas responda 422 con la lista (puertos `PERIOD_RANGE_CHECKER_OKR` / `_METRICS`). C08 crea los proyectos y tareas que hay que chequear, pero el puerto y el chequeo en `PeriodService` no están en ninguna corrida del plan.
- Posible solución: puerto en `common/contracts` que implementa `okr` (proyectos y tareas fuera del rango nuevo) e inyecta `core`; el de `metrics` va con F4.
- Origen: C08 (2026-10-07).

### [F] Limitar el cambio de fechas de un proyecto que deja tareas afuera (RN-P5)
- Por qué: Pedro (2026-10-07): "debería ser un limitante pero no hace limitar ahora". Hoy `PATCH okr/projects/:id` acepta un rango nuevo aunque deje tareas fuera del proyecto (crear o mover una tarea fuera del proyecto sí da 422).
- Posible solución: 422 `ProjectDatesExcludeTasks` con la lista de tareas afectadas, como pide D7 para los períodos.
- Origen: pregunta abierta de C08.

### [F] Cambiar el `linkMode` o borrar un indicador con proyectos vinculados: 422 con la lista (ADR-0009 D5, regla 3)
- Por qué: C11 valida `execution_feeds_indicator` solo para métricas `output` (RN-P14b) pero todavía no puede validar vínculos vigentes: `ProjectContribution` llega en C17 y `from_indicator` en F7. Hoy se puede cambiar el `linkMode` o borrar un indicador sin chequear proyectos que lo usan (`okr.project.source_objective_indicator_id` ya tiene FK, pero nadie lo setea todavía).
- Posible solución: puerto `INDICATOR_LINK_READER` / `PROJECT_LINK_READER` (ADR-0009 D5) con la lista de proyectos vinculados; 422 en `update` (cambio de `linkMode`) y en `softDelete` de `ObjectiveIndicatorService`. Va con C17 / F7.
- Origen: C11 (2026-10-08).
- Actualización (C17, 2026-10-08): hecho el lado de los aportes (`PROJECT_LINK_READER` implementado por `okr`; `ObjectiveIndicatorService.update` y `softDelete` rechazan con 422 `IndicatorHasLinkedProjects` y `details.projects`; también consulta los proyectos `from_indicator` por `findLiveProjectsBySourceIndicator`). Falta el otro sentido: el puerto `INDICATOR_LINK_READER` (lo implementa `metrics`, lo inyecta `okr`) y habilitar `progressMode = 'from_indicator'` en `ProjectService` (hoy `ProjectProgressModeNotSupported`), con el recálculo de esos proyectos en `IndicatorProgressListener` (ver el `TODO(F7)` del oyente).

### [F] Borrar un objetivo no da de baja sus ObjectiveIndicator
- Por qué: `ObjectiveService.softDelete` no toca `metrics.objective_indicator`. C11 lo resuelve de lectura (los puertos filtran objetivos vivos, así que un indicador de un objetivo borrado no bloquea borrar la métrica ni cambiar su `kind`), pero las filas quedan vivas.
- Posible solución: puerto en `common/contracts` (implementa `metrics`, inyecta `okr`) que da de baja los indicadores del objetivo en la misma transacción, con su `objective_indicator.deleted`.
- Origen: C11 (2026-10-08).

### [B] `PeriodController` sin `TenantGuard` ni permisos: cualquier usuario autenticado lista o crea períodos de cualquier org
- Por qué: `GET`/`POST orgs/:orgId/periods` y `GET periods/:id` solo tienen un TODO(ADR-0004): sin `TenantGuard`, sin `PermissionsGuard` y sin tenant scoping. `OrgParamGuard` (fix de `:orgId`) no alcanza ahí porque sin `TenantGuard` no hay org en el contexto. Lo mismo vale para los guards de `OrganizationController` (`orgs/:id`, operaciones de superadmin).
- Posible solución: `TenantGuard` + `OrgParamGuard` + `PermissionsGuard` con `core:period:manage` (lo que dice el TODO de ADR-0004); el front tiene que mandar el header. Cambia la política de acceso: decisión de Pedro.
- Origen: fix de `:orgId` (2026-10-07).
- Actualización (C20, 2026-10-08): **crítico**. También están abiertos `POST periods/:id/open|close` (se puede cerrar el período de otra org y trabar todas sus escrituras) y todo el ABM de `orgs` (crear, editar, desactivar). `closePeriod` busca por id con `prisma.raw` sin org. Va en C20b.

### [B] Vincular una métrica existente a un objetivo propio la captura o traba a otras unidades (C20 #2, alta)
- Por qué: `ObjectiveIndicatorService.create` con `metricId` no exige poder escribir la métrica. Un usuario de la unidad B vincula una métrica sin objetivos (solo central) y pasa a poder cargarla y editarla; o vincula una métrica de la unidad A y desde ahí ni A ni B pueden cargarla (la regla exige todas las unidades).
- Posible solución: exigir `assertCanWriteMetric` (o alcance central) para vincular una métrica existente. Va en C20b.
- Origen: C20 (2026-10-08).

### [B] Controllers de indicadores y aportes sin `ModuleEnabledGuard`; métrica inline sin `metrics:write` (C20 #3, media)
- Por qué: `ObjectiveIndicatorController` y `ProjectContributionController` (módulo `metrics`) no usan `@RequiresModule`. `POST okr/objectives/:id/indicators` con `metric` inline crea una `Metric` con solo `okr:write`, aunque la org tenga el módulo deshabilitado.
- Posible solución: `ModuleEnabledGuard` en esos controllers o exigir `metrics:write` con `metric` inline.
- Origen: C20 (2026-10-08).

### [B] Borrar un objetivo deja vivos proyectos, indicadores y aportes (C20 #4, media)
- Por qué: `ObjectiveService.softDelete` solo cuenta KRs. Los proyectos huérfanos pueden seguir disparando cargas automáticas (sospecha) y la métrica deja de contar ese objetivo en `assertCanWriteMetric`. Amplía el ítem "Borrar un objetivo no da de baja sus ObjectiveIndicator".
- Posible solución: 409 si hay hijos vivos, o cascada con audit y compensación; `findLiveProject` y el applier verifican el objetivo vivo.
- Origen: C20 (2026-10-08).

### [B] `@Body()` sin `ValidationPipe` en KR y rebalance; no hay pipe global (C20 #5, media)
- Por qué: `key-result.controller.ts` y `objective.controller.ts` (rebalance) reciben el body sin validar; un body malformado da 500 en vez de 400. Sin mass assignment (los services eligen campos).
- Posible solución: `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` global en `main.ts`.
- Origen: C20 (2026-10-08).

### [B] Hallazgos bajos de la revisión de seguridad C20
- `PermissionsGuard` deja pasar sin `@Permissions` (fail-open): exigir `@Permissions` o `@Public` explícito.
- `ownerUserId` de tareas y KRs sin validar membresía (500 vs. 200 sirve de oráculo de ids).
- Mover un objetivo de unidad deja proyectos fuera del subárbol nuevo (RN-P4).
- Server actions de web interpolan ids en la URL sin `encodeURIComponent`.
- `pg_advisory_xact_lock(hashtext(objectiveId))` sin prefijo de org.
- `DevAuthMiddleware` activo si falta `NODE_ENV`: fallar el arranque si falta o si `AUTH0_*` es placeholder.
- Origen: C20 (2026-10-08). Prioridad: baja salvo que Pedro diga otra cosa.

### [F] Serie del indicador con base y meta del indicador (`GET okr/indicators/:id/series`)
- Por qué: `GET metrics/:id/series` arma la curva esperada con la base y la meta de la `Metric`, pero para el objetivo mandan las del `ObjectiveIndicator` (ADR-0009 D8). C12 redibuja la recta esperada en el front (`features/indicators/chart-data.ts`) sobre las fechas que devuelve la API. Además el resumen (`expectedToDate`, `deviationPct`) sale con la base/meta de la métrica, así que la pestaña no lo muestra. El desvío de resultado (RN-P9) y la curva `manual`/`from_projects` (F6) necesitan el cálculo en el backend.
- Actualización (C15, 2026-10-08): `GET okr/indicators/:id/status` ya devuelve esperado a la fecha, desvío, semáforo y buckets vencidos con la base/meta del indicador y su curva; falta la serie completa (puntos esperados por bucket) para graficarla sin recalcular en el front (C16).
- Actualización (C16, 2026-10-08): el gráfico evalúa la curva con `expectedCurve` de `metrics-domain` (la misma función pura del backend, importada en web) sobre las fechas de muestreo de `GET metrics/:id/series` y los puntos de `GET okr/indicators/:id/target-points`. Sigue valiendo pedir el endpoint de serie para que el front no dependa de las fechas de la métrica.
- Posible solución: endpoint de serie por indicador en `metrics` que devuelva `expected`, `actual` y el desvío con los valores del indicador; el front deja de recalcular la recta.
- Origen: C12 (2026-10-08).

### [F] Exponer `linkMode` del indicador en la UI
- Por qué: C12 crea indicadores siempre `independent`: los modos `execution_feeds_indicator` e `indicator_feeds_execution` no tienen efecto visible hasta que existan los aportes de proyecto (C17) y el modo `from_indicator` en el form de proyecto. El tipo `Producto`/`Resultado` ya se puede cargar.
- Posible solución: selector de vínculo en el editor de indicador junto con C17, deshabilitando `execution_feeds_indicator` para `outcome` y mostrando el 422 con la lista de proyectos al cambiarlo.
- Origen: C12 (2026-10-08).

### [R] Renombrar el ítem de menú "Indicadores de gestión" (`/metrics`)
- Por qué: en el modelo nuevo "indicador" es el `ObjectiveIndicator` y "gestión" es el avance de proyectos y tareas; la página `/metrics` es el catálogo de métricas sueltas y el nombre confunde (pasó en la preparación de la demo). Candidatos: "Métricas" o "Catálogo de métricas", vía `lib/labels.ts`.
- Origen: cierre de la Fase 5 (2026-10-08), aprobado por Pedro.

## 🔵 Prioridad baja / cuando haya tiempo

### [R] Convergir CascadeResponse local en (app)/objectives/[id]/page.tsx con ObjectiveCascadeDto
- Por qué: deuda flagueada en la corrida feat/objective-owner-assignment. El detail page usa un type local en lugar del DTO compartido.
- Posible solución: importar ObjectiveCascadeDto desde @gestion-publica/shared-types y borrar el type local.
- Nota (M2): el type local se extendió con `progressMode` + `metricLink` (referenciando `MetricKrLinkDto` del DTO compartido), pero la convergencia total al DTO sigue pendiente.
- Estimado: corrida cortita (~10 min).

### [F] Mostrar avatar de owner en Vista Ejecutiva (Gantt)
- Por qué: la asignación de owner se implementó en listado y detalle, pero no en la Vista Ejecutiva. Out of scope deliberado en la corrida δ.
- Detalles: agregar columna o avatar inline en gantt-row.tsx con el owner del Objective/KR/Task.
- Estimado: corrida chica (~15 min).

### [F] Permitir borrar/desasignar owner desde el detalle del objetivo sin pasar por edit completo
- Por qué: hoy para cambiar owner abrís el dialog de "Editar objetivo" entero. Sería más rápido un click directo.
- Estimado: corrida chica (~15 min).

### [B] Excluir usuarios de sistema (auth0_sub LIKE 'system:%') de los listados globales de usuarios del superadmin
- Por qué: la migración de C04 inserta en `core.user` el usuario de sistema `system:migration` (actor de los eventos de backfill, ADR-0009 D6). Si no se filtra, aparece en los listados globales del superadmin.
- Origen: C04 (2026-10-07), aprobado por Pedro.

### [F] Editar el peso de un solo indicador desde su editor
- Por qué: hoy el peso de los indicadores solo se edita en bloque ("Editar pesos"), por la regla todo-o-nada. Un campo "peso" en el editor exige definir cómo se compensan los hermanos para que la suma siga en 10000.
- Origen: C12 (2026-10-08), Pedro lo dejó para el futuro.

## ✅ Recientemente completados (últimos 30 días)

- [F] Unidad obligatoria al invitar (`orgUnitId: string | null`, selector en el front) — mergeado el 8 octubre 2026
- [F] Curva `from_projects` (RN-P17) habilitada con los aportes de proyectos (`ProjectContribution`, carga automática al 100 % y UI de aportes) — mergeado el 8 octubre 2026
- [F] Alcance de unidad para `Metric` (alta standalone solo central; edición/borrado como las cargas) y anti-escalada al cambiar rol / quitar miembros — mergeado el 8 octubre 2026
- [B] Validar `:orgId` del path contra el tenant del request (`OrgParamGuard` en org-units, members, modules, strategic-plan y metrics) — mergeado el 7 octubre 2026
- [F] Módulo 2 "Indicadores en OKRs" completo (backend + frontend): `progress_mode` en KR, vínculo métrica↔KR con progreso automático (interpolación baseline→target), hook de recálculo, contexto a nivel objetivo, y la Pantalla 3 (badge automático, barra sin slider, sin-datos, editar/desvincular). Seed de demo + smoke checklist en docs/features/indicadores-smoke-checklist.md — mergeado el 10 julio 2026
- [F] Módulo 1 "Indicadores de gestión" completo (backend + frontend): schema `metrics`, feature-gating por org (ModuleEnabledGuard), package `metrics-domain`, ABM + carga periódica con curva esperado-vs-real, nav gated y tab "Módulos" en Configuración — mergeado el 9 julio 2026
- [F] Vista Ejecutiva: banda de meses sobre el eje del Gantt (reemplaza el ajuste pedido de formato "d MMM") — mergeado el 11 mayo 2026
- [F] Detalle objetivo: zona peligrosa removida + suma de pesos minimizada cuando balancea — mergeado el 11 mayo 2026
- [F] Vista Ejecutiva Gantt — mergeado el 2 mayo 2026
- [F] Iconos Lucide reemplazando badges + axis anchors en Gantt — mergeado el 2 mayo 2026
- [F] Asignación de owner a Objetivos / KRs / Tasks — mergeado el 2 mayo 2026
- [B] OwnerSelect dropdown mostraba "Sin miembros" — mergeado el 2 mayo 2026
- [F] Vista ejecutiva: análisis funcional separado en docs/features/executive-view.md — mergeado el 2 mayo 2026

## 📚 Notas operativas

### Convenciones de prefijos
- [F] = Feature (funcionalidad nueva)
- [B] = Bug
- [R] = Refactor (deuda específica que merece corrida propia, NO va en docs/tech-debt.md si tiene urgencia o impacto visible)
- [I] = Idea (sin compromiso de hacerlo, capturada para evaluar después)

### Lifecycle
- Se agregan en la sección de prioridad correspondiente.
- Cuando se completan, se mueven a "Recientemente completados" con fecha de merge.
- Items en "Recientemente completados" más viejos a 30 días se borran (el git log mantiene el histórico real).
- Si un item se descarta sin hacerse, se borra de TODO.md (con un comentario en el commit explicando por qué).

### Diferencia con docs/tech-debt.md
- TODO.md: trabajo pendiente con valor visible (features, bugs, ideas).
- tech-debt.md: deuda de código que no afecta funcionalidad (lint, naming, refactors invisibles, missing tests).
- Si dudás, va en TODO.md. tech-debt.md es para items de muy bajo impacto.
