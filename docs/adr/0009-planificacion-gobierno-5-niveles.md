# 0009 — Planificación de gobierno en 5 niveles: reorientación del dominio OKR

**Status**: Proposed
**Supersedes**: none (amends ADR-0006 D2.5). **Superseded by**: none.
**Date**: 2026-10-07
**Author**: architect subagent
**Spec**: [`docs/features/planificacion-gobierno.md`](../features/planificacion-gobierno.md) (SPEC). Insumo: [`planificacion-gobierno-impacto.md`](../features/planificacion-gobierno-impacto.md) (C01).

---

## Contexto y problema

Tras la demo con consultores de sector público (bitácora 2026-10-07), el modelo Objetivo → KR → Tarea no representa cómo planifica un gobierno: falta trazabilidad objetivo ↔ indicador, el avance de gestión no impacta en el indicador, el avance automático indicador → KR no aporta, la ponderación obligatoria estorba y no hay curva esperada ni noción de frecuencia útil. La SPEC propone un modelo de 5 niveles (Visión → Ejes → Visión/misión por unidad → Objetivos con indicadores → Proyectos y tareas) con dos lecturas de avance.

El discovery C01 encontró 15 riesgos que la SPEC no resuelve; los más estructurales son el copiloto IA atado a KR, la dependencia circular `okr` ↔ `metrics`, los períodos trimestrales y la duplicación de base/meta entre `Metric` y el vínculo con el objetivo. Este ADR fija el modelo y resuelve esos puntos con decisiones del owner (D-a…D-d).

---

## Supuesto de vertical declarado (ADR-0006 D2.5)

El sector público (municipios, ciudades, provincias) pasa a ser el **vertical principal declarado**, con aprobación del product owner (Pedro, 2026-10-07). Alcance del supuesto:

- **Sí asume el vertical**: la metodología de 5 niveles (plan de gobierno, mandato, ejes, unidades central/ministerio/área), el seed demo y el glosario de UI.
- **No asume el vertical** (sigue rigiendo ADR-0006 D2): multi-tenant, auth, audit, métricas sueltas (Módulo 1), Gantt, períodos (100% configurables por org, D7) y etiquetas de UI centralizadas en un diccionario para poder configurarlas por org más adelante.

ADR-0006 se enmienda con la línea "Amended by: 0009". El resto de ADR-0006 sigue vigente.

---

## Decisión

### D1 — Reorientar el dominio en el mismo repo

Se reorienta el dominio OKR al modelo de 5 niveles dentro del monorepo actual, reutilizando core, auth, audit, metrics, Gantt y copiloto. El concepto "Key Result" desaparece del dominio y sus dos usos se separan: **indicador del objetivo** (medición) y **proyecto** (ejecución).

Los identificadores técnicos `okr` (módulo Nest, schema Postgres, paquete `okr-domain`) **no se renombran**: igual que ADR-0008, un rename parcial cuesta más que la deuda de naming. La UI usa el glosario nuevo; el código mantiene `okr` como nombre técnico del módulo de planificación.

### D2 — Modelo de dominio y nombres finales

```
Organization
 ├── core.org_unit (árbol, N3: visión, misión)
 ├── planning.strategic_plan (N1, 1 activo) └── planning.axis (N2, 0..n)
 ├── core.period (rango configurable por org, D7)
 └── okr.objective (N4: periodId, orgUnitId, axisId?)
      ├── metrics.objective_indicator (1..n) → metrics.metric → metrics.metric_entry
      │      └── metrics.indicator_target_point (curva manual)
      └── okr.project (N5, 0..n) └── okr.task (1..n)
             └── metrics.project_contribution (0..n, solo execution_feeds_indicator)
```

| Modelo Prisma | Tabla | Cambio respecto de la SPEC §3.1 |
|---|---|---|
| `OrgUnit` | `core.org_unit` | Sin cambio |
| `UserOrganizationRole.orgUnitId` | `core.user_organization_role.org_unit_id` | Sin cambio |
| `StrategicPlan`, `Axis` | `planning.strategic_plan`, `planning.axis` | Schema nuevo `planning`: N1–N2 no son OKR ni métricas y se habilitan con el módulo de planificación |
| `Objective` | `okr.objective` | + `org_unit_id`, `axis_id`, `result_progress_cached_bp`, `execution_progress_cached_bp`. `progress_cached_bp` deprecado |
| `Project` | `okr.project` | + **`progress_mode`** (`from_tasks` default \| `from_indicator`) y **`source_objective_indicator_id?`** (D5) |
| `Task` | `okr.task` | + `project_id`; `key_result_id` y `weight_bp` nullable |
| `ObjectiveIndicator` | `metrics.objective_indicator` | + **`link_mode`** (D5). Únicos: `(objective_id, metric_id)`. Regla: `metric.period_id = objective.period_id` |
| `IndicatorTargetPoint` | `metrics.indicator_target_point` | Sin cambio |
| `ProjectContribution` | `metrics.project_contribution` | Único `(project_id, objective_indicator_id)` |
| `Metric` | `metrics.metric` | Sin cambio respecto de la SPEC (`kind`, `source`, `description`, frecuencias nuevas) |
| `KeyResult`, `MetricKrLink` | `okr.key_result`, `metrics.metric_kr_link` | Se eliminan en el contract (D6) |

Se mantienen las convenciones vigentes: `Decimal` para valores, basis points para pesos y avances, soft-delete, `organizationId` en toda tabla (y en `tenant-scoped-models.ts`), audit append-only en toda mutación y FKs cross-schema por SQL crudo.

### D3 — Ponderación todo-o-nada

Los pesos son opcionales por grupo de hermanos (indicadores de un objetivo, proyectos de un objetivo, tareas de un proyecto): o todos tienen `weightBp` y suman 10000, o ninguno y se usa promedio simple (RN-P6). Un grupo mixto es imposible por invariante transaccional en el service, no un estado tolerado: el short-circuit a 0 de `recompute.ts` desaparece. El promedio simple usa la misma regla de redondeo que el ponderado (`Math.trunc` sobre bp), definida una sola vez en `okr-domain` y consumida por back y front.

### D4 — Dos lecturas de avance, nunca fusionadas

Cada objetivo expone dos avances independientes (RN-P8): **resultado** (`resultProgressCachedBp`, desde sus indicadores) y **gestión** (`executionProgressCachedBp`, desde sus proyectos). Cada una tiene su desvío contra lo esperado (RN-P9). No existe un número combinado en API, DB ni UI. La agregación por unidad, eje y plan es el promedio simple de los objetivos, por lectura (RN-P10). El flujo indicador → KR automático se elimina (RN-P11).

### D5 — Vínculo gestión ↔ indicador, configurable en ambos sentidos (D-b)

**Código.** `okr` y `metrics` no se importan entre sí (se elimina la dependencia actual `metrics → KeyResultService`). Se comunican por eventos de dominio con `@nestjs/event-emitter` (dependencia liviana, justificada por este ADR):

| Evento | Emisor → oyente | Uso |
|---|---|---|
| `project.completed` / `project.reopened` | `okr` → `metrics` | RN-P13: entry automático y entry compensatorio |
| `indicator.progress_changed` | `metrics` → `okr` | Payload: `objectiveIndicatorId`, `objectiveId`, `progressBp`, `objectiveResultProgressBp`. `okr` actualiza `resultProgressCachedBp` del objetivo y el avance de los proyectos `from_indicator` |

Los eventos de dominio quedan **solo para efectos post-commit**: se emiten después del commit de la transacción que los origina, los oyentes son idempotentes y escriben su propio audit. Los nombres de eventos y sus payloads viven en `shared-types`.

**Validaciones sincrónicas entre módulos: puertos (inversión de dependencias).** Las interfaces y sus tokens de inyección viven en `apps/api/src/common/contracts/`. Cada módulo implementa los puertos sobre lo que le pertenece y el módulo que valida inyecta el token, sin importar al otro:

| Token | Implementa | Inyecta | Uso |
|---|---|---|---|
| `INDICATOR_LINK_READER` | `metrics` | `okr` | Al poner un proyecto en `from_indicator`: el indicador fuente existe, es del mismo objetivo y es `indicator_feeds_execution` |
| `PROJECT_LINK_READER` | `okr` | `metrics` | Al crear un `ProjectContribution`: el proyecto existe, es del mismo objetivo y no toma su avance de ese indicador |
| `PERIOD_RANGE_CHECKER_OKR`, `PERIOD_RANGE_CHECKER_METRICS` | `okr`, `metrics` | `core` | D7: cada uno devuelve sus entidades fuera del rango nuevo (interfaz común `PeriodRangeChecker`) |

- Las implementaciones son de solo lectura y dependen únicamente de `PrismaService`, para no crear ciclos de DI.
- Cada módulo las exporta desde un submódulo `@Global()` de contratos (ej. `OkrContractsModule`) que solo importa `AppModule`.
- Si falta un provider, Nest falla al arrancar. Es preferible a una validación que pasa en silencio.

**Funcional.** `ObjectiveIndicator.linkMode`:

- `independent` (default): sin vínculo con la gestión. Es el modo de los indicadores `outcome`.
- `execution_feeds_indicator`: los proyectos con `ProjectContribution` suman al indicador al completarse (RN-P12/13). Solo `kind = output`. Es requisito de la curva `from_projects`.
- `indicator_feeds_execution`: un `Project` con `progressMode = 'from_indicator'` y `sourceObjectiveIndicatorId` toma su avance del progreso de ese indicador. Sus tareas quedan informativas (mismo criterio que RN-O4 hoy).

Reglas que valida el service (422 si se violan):

1. Un mismo par proyecto ↔ indicador no puede usar los dos sentidos: un proyecto `from_indicator` no puede tener un `ProjectContribution` hacia su indicador fuente.
2. `ProjectContribution` solo se crea sobre indicadores `execution_feeds_indicator`; `sourceObjectiveIndicatorId` solo apunta a indicadores `indicator_feeds_execution` del mismo objetivo.
3. Cambiar el `linkMode` de un indicador con vínculos vigentes se rechaza con la lista de proyectos vinculados.

Como cada indicador tiene un solo `linkMode`, las aristas gestión → indicador e indicador → gestión nunca convergen en el mismo indicador: no puede formarse un ciclo.

### D6 — Migración expand → migrate → contract

1. **Expand** (F2–F4, F6–F7): tablas y columnas nuevas, nullable donde haga falta. Los endpoints `/key-results*` siguen vivos.
2. **Migrate** (F5): script por org según SPEC §6. Requiere PA-1 respondida.
   - **Idempotencia**: columna `legacy_key_result_id` (nullable, unique parcial `WHERE legacy_key_result_id IS NOT NULL`) en `metrics.objective_indicator` y en `okr.project`. El script saltea los KR que ya tienen una fila con ese legacy id. Esto deja además trazabilidad KR → indicador/proyecto.
   - **Actor**: los eventos `migration.*` se registran con `actorId = 'system:migration'`.
3. **Contract** (F10): se eliminan `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `Objective.progressCachedBp`, las columnas `legacy_key_result_id`, los endpoints `/key-results*` y `metrics-domain.computeAutomaticKrProgressBp`.

### D7 — Períodos 100% configurables por organización (D-c)

`core.period` no impone duración: cada org define períodos anuales, semestrales, cuatrimestrales, plurianuales o los que necesite. El label es libre (columna `code` existente, sin formato). Las reglas son:

- `startsAt < endsAt`. Un objetivo sigue perteneciendo a exactamente un período.
- Las fechas se pueden editar en cualquier momento. Si el rango nuevo deja afuera proyectos, tareas o cargas de indicadores, se rechaza con **422** y la lista de entidades afectadas. `core` junta esa lista con los puertos `PERIOD_RANGE_CHECKER_OKR` y `PERIOD_RANGE_CHECKER_METRICS` (D5).
- Si el cambio se acepta, los buckets de los indicadores del período se recalculan a partir del rango nuevo.
- Los períodos existentes (trimestrales) **no se migran**. El seed demo usa períodos anuales solo como ejemplo.

### D8 — Base y meta: manda `ObjectiveIndicator` (D-d)

La fuente de verdad de base, meta y dirección para el avance del objetivo es `ObjectiveIndicator`. Si el indicador se crea desde un objetivo, `Metric` toma esos valores como iniciales. Después no se sincronizan: los valores de `Metric` solo rigen en la vista standalone del Módulo 1.

### D9 — Copiloto IA en el contract (D-a)

En F10 se desactivan las operaciones del copiloto sobre `key_result` y `objective` queda como única entidad soportada (DTOs `draft`/`validate` sin el target KR). La adaptación del copiloto a indicadores queda en el backlog: el ítem `[F]` en `TODO.md` se agrega en la corrida de F10.

---

## Consecuencias

### Positivas
- El dominio refleja el modelo de planificación que usa el vertical: trazabilidad objetivo → indicador → proyecto → tarea.
- `okr` y `metrics` quedan desacoplados en código; la dependencia circular desaparece.
- La configurabilidad de períodos y del vínculo gestión ↔ indicador mantiene el producto usable fuera del vertical.

### Negativas / trade-offs aceptados
- Consistencia eventual entre `metrics` y los cachés de avance de `okr`: si un oyente falla, el caché queda desfasado hasta el próximo evento o un recompute manual.
- El nombre técnico `okr` deja de describir el dominio; se mitiga con el glosario UI ↔ código (C03).
- Convivencia F3–F9 con endpoints de KR vivos: más superficie y más estados posibles hasta el contract.
- Los puertos de `common/contracts` son un acoplamiento por interfaz: cambiar un contrato toca a quien implementa y a quien inyecta.

---

## Alternativas consideradas

### A1 — Fork del repo para el vertical público
Descartada: duplica auth, audit, multi-tenant y deploy, y obliga a portar cada fix a dos repos sin clientes que lo justifiquen.

### A2 — Módulo paralelo (`planning`) que conviva con OKR
Descartada: dos modelos de objetivo con dos cascadas y dos UIs. PA-5 asume que ningún tenant necesita OKR clásico; mantenerlo sería costo sin usuario.

### A3 — `forwardRef` entre `okr` y `metrics`
Descartada: oculta el ciclo en lugar de cortarlo y rompe la regla de boundaries de `CLAUDE.md`.

### A4 — Validaciones sincrónicas por `emitAsync` (`@nestjs/event-emitter`)
Descartada: si no hay ningún listener registrado, `emitAsync` devuelve `[]` y la validación pasa en silencio. Además, el contrato no lo verifica el compilador ni el arranque de Nest. Los puertos con token (D5) hacen que un provider faltante falle al arrancar.

### A5 — Mover los cachés de avance a un módulo agregador
Descartada por ahora: agrega un tercer módulo para un cálculo que los eventos ya resuelven.

---

## Open questions

Preguntas de la SPEC §8. Mientras no haya respuesta, rige el default de la SPEC.

- **PA-1** — ¿No hay clientes con datos reales en producción? Default: no los hay; se permite migración con transformación y reemplazo del seed. **Bloquea F5.**
- **PA-2** — ¿Lectura de toda la org para usuarios de unidad (RN-P20)? Default: sí; la lectura restringida es una opción futura.
- **PA-3** — ¿Aporte al 100% o proporcional? Default: al 100% (RN-P13).
- **PA-4** — ¿Umbrales de semáforo? Default: 10 y 25 puntos.
- **PA-5** — ¿Algún tenant necesita OKR clásico? Default: no.


---

## Referencias cruzadas

- [ADR 0001](./0001-okr-module-foundation.md) — cascada OKR que este ADR reemplaza.
- [ADR 0005](./0005-ai-copilot-module.md) — copiloto; alcance recortado en D9.
- [ADR 0006](./0006-domain-agnostic-platform.md) — enmendado por este ADR (D2.5).
- [ADR 0008](./0008-naming-and-rename-roadmap.md) — criterio de no renombrar parcialmente, aplicado al identificador `okr` (D1).
- `docs/features/indicadores-okr.md` — RN-O4, criterio reutilizado en `indicator_feeds_execution`.
- `plan.md` — fases F1–F10.
