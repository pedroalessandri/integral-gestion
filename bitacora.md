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
