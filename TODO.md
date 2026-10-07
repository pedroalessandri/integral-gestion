# TODO

> Pendientes de desarrollo del proyecto. Items concretos para próximas
> sesiones de trabajo. Cada item tiene contexto suficiente para retomar
> sin re-investigar.

## 🔥 Prioridad alta — próxima sesión

### [B] Los controllers de C04 no validan que el `:orgId` del path coincida con el tenant del request
- Por qué: `OrgUnitController` y `MemberController` (`orgs/:orgId/...`) pasan el `orgId` del path directo al service. `TenantGuard` solo verifica membresía y permisos contra el header `X-Organization-Id`, así que un org-admin de la org A podría operar sobre la org B mandando header A y path B. `MetricController` ya lo resuelve con `assertOrgParam`; el controller de planning de C05 también.
- Posible solución: aplicar el mismo chequeo (`TenantMismatch` 403) en esos controllers, o moverlo a un guard/decorator reutilizable. Con test.
- Origen: C05 (2026-10-07). Pedro lo subió a prioridad alta el 2026-10-07 (aislamiento multi-tenant); resolver antes del merge de la Fase 2.

## 🟡 Prioridad media — próximas semanas

### [B] Loading state del dropdown de responsable
- Por qué: en el dialog de crear/editar Objective, KR y Task, el campo "Responsable" aparece vacío durante ~1 segundo mientras se hace el fetch del listado de members, y después aparece el nombre. Visualmente queda como si el campo no estuviera asignado.
- Posible solución: mostrar un skeleton o disabled+spinner hasta que el fetch resuelva. El estado `loading` ya está en OwnerSelect, solo falta usarlo visualmente.
- Estimado: corrida muy chica (~10 min).

### [B] Kebab menu de tareas queda abierto al cerrar dialog
- Por qué: click en los 3 puntitos abre el DropdownMenu; al elegir una opción se abre un Dialog (ej. Editar); cuando se cierra el Dialog, el DropdownMenu queda visible.
- Estado: el kebab de **key results** (`kr-card-actions.tsx`) ya quedó arreglado en la corrida del Módulo 2 (DropdownMenu controlado). Falta solo el de **tareas** (`task-row-actions.tsx`).
- Posible solución: controlar el state del DropdownMenu desde el padre y forzar `setMenuOpen(false)` en el `onSelect` antes de abrir el Dialog. Patrón típico de shadcn cuando un MenuItem dispara un Dialog.
- Estimado: corrida chica (~15-20 min).

### [F] Elegir unidad al invitar + decidir alcance por defecto (hoy null = toda la org) — resolver en F8/C19
- Por qué: `inviteByEmail` no acepta `orgUnitId`; el alcance se setea después con `PATCH orgs/:orgId/members/:userId/scope`. Hoy un miembro invitado queda con alcance `null` (toda la org, RN-P19) hasta que alguien lo cambie.
- Origen: pregunta abierta de C04 (2026-10-07), Pedro: "alcanza por ahora".
- Resolver en: plan.md F8/C19.

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

### [B] `PeriodController` sin `TenantGuard` ni permisos: cualquier usuario autenticado lista o crea períodos de cualquier org
- Por qué: `GET`/`POST orgs/:orgId/periods` y `GET periods/:id` solo tienen un TODO(ADR-0004): sin `TenantGuard`, sin `PermissionsGuard` y sin tenant scoping. `OrgParamGuard` (fix de `:orgId`) no alcanza ahí porque sin `TenantGuard` no hay org en el contexto. Lo mismo vale para los guards de `OrganizationController` (`orgs/:id`, operaciones de superadmin).
- Posible solución: `TenantGuard` + `OrgParamGuard` + `PermissionsGuard` con `core:period:manage` (lo que dice el TODO de ADR-0004); el front tiene que mandar el header. Cambia la política de acceso: decisión de Pedro.
- Origen: fix de `:orgId` (2026-10-07).

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

## ✅ Recientemente completados (últimos 30 días)

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
