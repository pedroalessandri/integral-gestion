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

## 2026-10-07 · Fix · backend-dev · fix/core-orgid-tenant-check
- Hecho: guard común `OrgParamGuard` (`common/guards`) que compara `:orgId` del path con el tenant del request (lee `request.authContext`, ALS solo como fallback) y responde 403 `TenantMismatch`. Aplicado a `OrgUnitController`, `MemberController` (incluido `PATCH members/:userId/scope`), `OrganizationModuleController` (nuevo: tampoco tenía chequeo), `StrategicPlanController` y `MetricController`; se borraron los `assertOrgParam` locales de planning y metrics. No exceptúa superadmin (igual que antes en planning/metrics). Tests: 9 del guard y 9 de controllers con un harness HTTP (`common/testing/tenant-http-harness.ts`).
- Commit: este commit (`fix(core): validar :orgId del path contra el tenant del request`)
- Verificación: `prisma:generate && pnpm typecheck` → 5/5 OK; `pnpm --filter api test` → 29 archivos, 252 tests OK; `pnpm --filter api lint` → 1 error y 3 warnings preexistentes, ninguno nuevo; e2e `core-member` y `core-module-enablement` → 6 fallas, idénticas en `main` (rotas en `POST /orgs`, a tech-debt).
- Pendiente / desvíos: `PeriodController` y `OrganizationController` quedan sin cubrir: no tienen `TenantGuard` (TODO ADR-0004), así que el guard no aplica sin cambiar la política de acceso. Item `[B]` nuevo en TODO.md.
- Preguntas abiertas: ¿`PeriodController` con `TenantGuard` + `core:period:manage` y en qué prioridad?

## 2026-10-07 · C06 · frontend-dev · feature/plan-f2-estructura
- Hecho: Configuración → pestaña "Estructura" (`features/org-structure`): árbol de unidades con ABM, visión y misión, alcance por miembro (`PATCH members/:userId/scope`) y mensajes en español para los 409/422 tipados. Página "Plan de gobierno" (`/plan`, `features/strategic-plan`): estado vacío si 404, crear/editar plan (PUT), ABM de ejes con `objectiveCount` y warning ámbar al borrar un eje con objetivos. Selectores de unidad (solo ministry|area) y de eje ("Sin eje") en el dialog de crear/editar Objetivo. Diccionario `lib/labels.ts` con el glosario.
- Commit: este commit (`feat(web): pantallas de estructura y plan de gobierno`)
- Verificación: `pnpm --filter web typecheck` no existe (sin script en web) → se corrió `tsc --noEmit` en `apps/web` → sin errores; `pnpm --filter web lint` → 0 errores, 2 warnings preexistentes.
- Pendiente / desvíos:
  - Los ejes muestran solo `objectiveCount`: el backend todavía no expone las dos lecturas agregadas ni las unidades por eje (SPEC §5.2).
  - El filtro global de errores del api descarta `members` del 409 `OrgUnitHasMembers` y el código de dominio llega como prefijo del `message`. El front parsea el prefijo (`lib/api-errors.ts`) y deduce los miembros bloqueantes de la lista cargada. Bug en TODO.md.
  - Carpetas `features/*` según CLAUDE.md (lo existente usa `components/<area>`). Reglas de UX (profundidad ≤ 4, hijos por kind) duplicadas en `tree.ts` solo para filtrar opciones; la fuente de verdad es la API.
  - Web sin script `typecheck` ni Vitest; `MemberItem` vs `MemberDto` en la página Miembros: los dos en tech-debt.
  - Sin smoke en navegador (lo hace Pedro).
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
