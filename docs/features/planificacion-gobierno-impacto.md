# Planificación de gobierno — Discovery de impacto (C01)

**Fecha**: 2026-10-07 · **Rol**: architect · **Insumo de**: ADR-0009 (C02)
**Alcance**: solo lectura de código. Mapea lo que toca `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `progressCachedBp` y `weightBp` contra la SPEC (`planificacion-gobierno.md` §3, §4, §6).

## 1. Mapa de uso actual

**Schema / DB** (`apps/api/prisma/schema.prisma` + migraciones)
- `okr.objective.progress_cached_bp`; `okr.key_result` (`weight_bp`, `progress_cached_bp`, `progress_mode` con CHECK); `okr.task` (`key_result_id` NOT NULL, `weight_bp` NOT NULL, fechas contra `Period`).
- `metrics.metric_kr_link` (`key_result_id` UNIQUE, FK cross-schema a `okr.key_result` en SQL crudo, mig. `20260709000004`).
- `metrics.metric.frequency` con CHECK `weekly|biweekly|monthly` (mig. `20260709000001`). `Metric` cuelga de `Period`.
- `Organization`/`User` tienen relaciones inversas `keyResults`, `metricKrLinks`, `ownedKeyResults`.

**API — módulo okr**: `key-result.controller/service` (CRUD, rebalanceo, `attachAutomaticKr`/`detachAutomaticKr`/`applyAutomaticKrProgress`), `task.controller/service` (cuelga de KR), `objective.service` (lectura con KRs anidados + Gantt), `recompute.ts` (Task → KR → Objective, short-circuit a 0 si la suma ≠ 10000), DTOs `create/update-key-result`, `rebalance-kr-weights`, `create/update-task`. `okr/index.ts` exporta `KeyResultService` como API pública.
**API — módulo metrics**: `metric-link.controller/service` (upsert/patch/remove del link, hook de recompute tras cada `MetricEntry` vía `KeyResultService`), `metric.service` (lee links para bloquear borrado/edición), DTOs `upsert/update-metric-kr-link`.
**API — otros**: `core/period.service` (soft-delete en cascada Objective → KR → Task), `ai/` (`draft.dto`, `validate.dto`, `ai.service` generan y validan KRs con pesos), `database/seed-demo.ts` (KRs, tareas, `metricKrLink`).
**Paquetes**: `okr-domain` (`cascade.ts`, `invariants.ts`, `types.ts`: suma 10000 obligatoria), `metrics-domain` (`progress.ts` con `computeAutomaticKrProgressBp`, `buckets.ts` solo 3 frecuencias, `expected.ts` solo lineal), `prisma-tenant-extension/tenant-scoped-models.ts` (lista `KeyResult`, `Task`, `MetricKrLink`), `shared-types` (`okr/key-result.dto`, `task.dto`, `objective.dto`, `objective-gantt.dto`, `rebalance.dto`, `metrics/metric-link.dto`, `audit/domain-event.ts` con eventos `key_result.*` y `metric_kr_link.*`).
**Web**: `objectives/page.tsx`, `objectives/[id]/page.tsx`, `kr-section-menu.tsx`; `components/objectives/` (`actions.ts`, `create-kr-button`, `create-task-button`, `kr-automatic-progress`, `kr-card-actions`, `kr-metric-link-dialog`, `rebalance-weights-dialog`, `task-row-actions`); `components/gantt/` (`gantt-chart`, `gantt-row`); `components/ai/` (`ai-suggest-panel`, `smart-feedback-panel`).

## 2. Tests afectados

| Suite | Archivo | Motivo |
|---|---|---|
| okr-domain | `cascade.test.ts`, `cascade.property.test.ts` | Suma 10000 obligatoria → pesos opcionales (RN-P6), promedio simple |
| okr-domain | `invariants.test.ts`, `invariants.property.test.ts` | Invariante todo-o-nada por grupo de hermanos |
| metrics-domain | `progress.test.ts`, `progress.property.test.ts` | `computeAutomaticKrProgressBp` se elimina (RN-P11); `progressBp`/`deviationBp` se reusan |
| metrics-domain | `buckets.test.ts` | Frecuencias `quarterly|semiannual|annual` (RN-P15) |
| metrics-domain | `expected.test.ts` | Curvas `manual` y `from_projects` (RN-P17) |
| api unit | `objective.service.spec.ts`, `task.service.spec.ts` | Dos lecturas, `projectId`, fechas contra proyecto |
| api unit | `metric-link.service.spec.ts`, `metric.service.spec.ts` | Link KR → `ObjectiveIndicator` |
| api unit | `period.service.spec.ts` | Cascada de soft-delete a Project/ObjectiveIndicator |
| api unit | `module-enablement.service.spec.ts` | Alta automática de la raíz `central` (RN-P1) |
| api e2e | `metrics-okr-link.e2e-spec.ts` | Se reescribe para `ObjectiveIndicator`; se borra en contract |
| api e2e | `core-period.e2e-spec.ts`, `core-member.e2e-spec.ts` | Cascada de borrado; alcance `orgUnitId` en membresía |
| paquetes | `prisma-tenant-extension/test/*.test.ts`, `shared-types/test/smoke.test.ts` | Modelos tenant-scoped nuevos; exports de DTOs |

No hay tests de componentes web ni e2e de Playwright sobre KR hoy: la UI nueva no tiene red de seguridad.

## 3. Archivo → cambio esperado → fase

| Archivo | Cambio esperado | Fase |
|---|---|---|
| `prisma/schema.prisma` + migración | `core.org_unit`, `UserOrganizationRole.orgUnitId` | F2 (C04) |
| `prisma/schema.prisma` + migración | schema `planning` (`strategic_plan`, `axis`); `Objective.orgUnitId?`, `axisId?` | F2 (C05) |
| `core/module-enablement.service.ts` | Crear raíz `central` al habilitar | F2 (C04) |
| `prisma-tenant-extension/tenant-scoped-models.ts` | Sumar `OrgUnit`, `StrategicPlan`, `Axis`, `Project`, `ObjectiveIndicator`, `IndicatorTargetPoint`, `ProjectContribution` | F2–F7 |
| `shared-types/src/audit/domain-event.ts` | Eventos `org_unit.*`, `strategic_plan.*`, `axis.*`, `project.*`, `objective_indicator.*`, `project_contribution.*`, `migration.*` | F2–F7 |
| `shared-types/src/auth/permission-keys.ts` + migración seed | Permisos de estructura, plan, proyecto | F2–F3 |
| `web/lib/labels.ts` (nuevo), pantallas de configuración | Estructura, plan, selectores en dialog de Objetivo | F2 (C06) |
| `okr-domain/{cascade,invariants,types}.ts` | Pesos nullable, todo-o-nada, promedio simple, avance de gestión | F3 (C07) |
| `schema.prisma` + migración | `okr.project`; `Task.projectId`; `Task.keyResultId` y `weightBp` nullable | F3 (C08) |
| `okr/services/{task,objective}.service.ts`, `recompute.ts` | Cascada Task → Project → `executionProgressCachedBp` | F3 (C08) |
| `okr/dto/*task*.dto.ts`, `shared-types/okr/task.dto.ts` | `projectId`, `weightBp?` | F3 (C08) |
| `web/components/objectives/*task*`, ficha de proyecto | UI de proyectos y tareas | F3 (C09) |
| `metrics-domain/{types,buckets}.ts`, CHECK `frequency` | Frecuencias nuevas; `Metric.kind/source/description` | F4 (C10) |
| `metrics/services/metric-link.service.ts` → `objective-indicator.service.ts` | Indicador del objetivo + `resultProgressCachedBp`; hook post-`MetricEntry` sin pasar por KR | F4 (C11) |
| `metrics-domain/progress.ts` | Quitar `computeAutomaticKrProgressBp` | F4 (C11) |
| `web/components/objectives/kr-metric-link-dialog.tsx`, `kr-automatic-progress.tsx` | Reemplazo por editor de indicador | F4 (C12) |
| script de migración (nuevo), `database/seed-demo.ts` | KR → Indicator/Project; seed San Carrillo | F5 (C13) |
| `metrics-domain/expected.ts` + `IndicatorTargetPoint` | Curvas `manual` y `from_projects`, desvíos, carga vencida | F6 |
| `ProjectContribution` + hook en `task/project` service | Entry automático y compensatorio (RN-P13) | F7 |
| guard/servicio de alcance, `shared-types/auth/auth-context.ts` | `orgUnitId` en `AuthContext`; RBAC ∧ alcance | F8 |
| `web/components/gantt/*`, `shared-types/okr/objective-gantt.dto.ts` | Objetivo → Proyecto → Tarea | F9 (C22) |
| `okr/{controllers,services,dto}/key-result*`, `rebalance-kr-weights.dto.ts`, `metric-kr-link` DTOs/controller | Eliminar | F10 (C23) |
| `core/period.service.ts` | Cascada sin KR | F3 + F10 |
| `web/.../kr-section-menu.tsx`, `create-kr-button`, `kr-card-actions`, `rebalance-weights-dialog` | Eliminar / reemplazar | F10 (C24) |
| `ai/{dto,services}` | Siguen usando KR (fuera de alcance, SPEC §7) | Bloquea F10 |

## 4. Riesgos que la SPEC no contempla

1. **Copiloto IA bloquea el contract.** `ai.service`, `draft.dto` y `validate.dto` generan KRs con pesos. La SPEC lo deja fuera de alcance, pero F10 elimina `KeyResult`: o se adapta antes, o se deshabilita el copiloto, o el contract se posterga.
2. **Dependencia circular entre módulos Nest.** Hoy `metrics` depende de `okr` (`KeyResultService`). Con `ObjectiveIndicator` en `metrics` escribiendo `resultProgressCachedBp` en `okr` y `ProjectContribution` (RN-P13) creando `MetricEntry` desde `okr`, la dependencia queda en ambas direcciones. Hace falta definir el sentido (eventos de dominio, `forwardRef` o mover el caché) en ADR-0009.
3. **Períodos trimestrales existentes.** `Period` no tiene `kind`; el código y la doc asumen Q. La SPEC pide anual (RN-P3) pero §6 no dice qué hacer con objetivos y métricas en períodos trimestrales (¿se fusionan en un período anual o quedan como están?).
4. **`Metric` ligado a `Period`.** Un `ObjectiveIndicator` debe exigir `metric.periodId = objective.periodId`; la SPEC no lo dice. Tampoco define unicidad `(objectiveId, metricId)` ni si una métrica puede medir objetivos de varias unidades.
5. **Duplicación de base/meta/dirección.** `Metric` y `ObjectiveIndicator` las tienen ambos; falta la regla de cuál manda y si cambiar una propaga a la otra.
6. **Short-circuit actual a 0.** `recompute.ts` devuelve 0 si la suma ≠ 10000. Con todo-o-nada, un grupo mixto (unos con peso, otros sin) debe ser imposible por invariante transaccional, no tolerado. Faltan reglas para alta/baja de un hermano en un grupo ponderado (¿se pide peso? ¿se re-reparte?).
7. **Redondeo del promedio simple.** Hoy la fórmula ponderada usa `Math.trunc`; el promedio simple (Σ/n) necesita la misma regla explícita en `okr-domain` para que la agregación por unidad/eje (RN-P10) sea reproducible entre back y front.
8. **Fechas de tarea.** Hoy se validan contra `Period`; RN-P5 pide contra `Project`. Editar las fechas de un proyecto puede dejar tareas afuera: falta definir si se bloquea o se ajusta.
9. **RN-P13 y carga vencida.** El entry automático usa el bucket de la fecha de cierre: si el proyecto cierra fuera del período de la métrica, el bucket no existe. El entry compensatorio negativo también puede caer en otro bucket que el original.
10. **Idempotencia del script de migración.** Los ids son `cuid`; sin una tabla de correspondencia (`krId → indicatorId/projectId`) o una marca en la fila, re-ejecutar duplica. La SPEC pide idempotencia pero no define el mecanismo.
11. **Auditoría de la migración.** `domain-event.ts` es una unión cerrada (41 variantes, ADR-0002); `migration.*` requiere ampliarla, y el actor de esos eventos (usuario de sistema) no existe.
12. **`AuthContext` sin alcance de unidad.** RN-P21 necesita `orgUnitId` (y los descendientes) en el contexto; hoy no se carga en `me.service`/guards, y el árbol se resuelve por query recursiva en cada request.
13. **Endpoints `/key-results*` en uso por la web durante F3–F9.** Con `Task.keyResultId` nullable, los endpoints viejos pueden crear tareas sin proyecto y viceversa; hace falta definir qué endpoints quedan de solo lectura durante la convivencia.
14. **Tenant extension.** Cada modelo nuevo que no se sume a `tenant-scoped-models.ts` queda sin filtrado por `organizationId`; `OrgUnit` y `Axis` en schemas distintos de `okr` son fáciles de olvidar.
15. **Sin tests de UI.** No hay tests web ni Playwright sobre la ficha de objetivo; el reemplazo de pantallas (F3–F10) no tiene regresión automática.
