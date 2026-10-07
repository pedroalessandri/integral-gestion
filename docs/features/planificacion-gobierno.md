# Planificación de gobierno — Análisis funcional y alcance

**Estado**: Borrador para ADR-0009 · **Fecha**: 2026-10-07 · **Owner**: Pedro Alessandri
**Origen**: feedback de un equipo de consultores de sector público tras la demo de Gestión Integral (planilla `Ordenamiento_Objetivos_Indicadores.xlsx` + diagrama de 5 niveles).
**Reemplaza conceptualmente**: la cadena Objetivo → KR → Tarea de `docs/specs/okr-module.md` y el vínculo KR↔indicador de `docs/features/indicadores-okr.md`.

---

## 1. Decisión de producto

1. El sector público (municipios, ciudades, provincias) pasa a ser el **vertical principal declarado** del producto. Se usa la excepción prevista en ADR-0006 D2.5 ("Supuesto de vertical declarado"). ADR-0009 lo formaliza.
2. **No se hace un fork ni un módulo paralelo.** El dominio central de Gestión Integral se reorienta al modelo de 5 niveles en el mismo repo. Multi-tenant, auth, audit, métricas, Gantt y copiloto se reutilizan.
3. La metodología OKR deja de ser el modelo base. El "KR" desaparece como concepto de dominio. Sus dos usos actuales se separan en dos entidades con semántica propia: **Indicador del objetivo** (medición) y **Proyecto** (ejecución).
4. Supuesto a confirmar por Pedro: **no hay clientes con datos reales en producción**. Railway solo tiene datos demo, así que se permiten migraciones con transformación de datos y el reemplazo del seed.

## 2. Los 5 niveles

| Nivel | Término (UI) | Actor dueño | Qué tiene asociado | Temporalidad | Medición |
|---|---|---|---|---|---|
| N1 | Visión general de gobierno | Unidad central | — | Mandato | No se mide |
| N2 | Eje (opcional) | Unidad central | Descripción del eje | Mandato | No se mide (agrega) |
| N3 | Visión y misión | Ministerio / Área | — | Mandato | No se mide |
| N4 | Objetivo estratégico | Ministerio / Área | 1+ indicadores con línea base, meta e indicador | Período configurable por org | Según frecuencia de cada indicador |
| N5 | Proyecto → Tareas (Gantt) | Ministerio / Área | 1+ tareas | Período configurable por org | Tareas revisadas diaria/semanal/mensualmente |

Ejemplo canónico (seed demo "Municipalidad de San Carrillo"):

- **N1**: "Transformar San Carrillo en una municipalidad con más espacios verdes, inclusiva, segura y con oportunidades de desarrollo económico".
- **N2**: Eje "Transformación Urbana + Lindo San Carrillo".
- **N3**: Secretaría de Desarrollo Urbano, con su visión y su misión.
- **N4**:
  - Obj. 1 "Generar más espacios verdes": indicador = cantidad de espacios verdes, línea base 10, meta 30, mensual.
  - Obj. 2 "Generar más ciclovías": indicador = km de ciclovías, línea base 5, meta 35, mensual.
- **N5**:
  - Proyecto "Espacio verde X", con la tarea "Comprar terreno".
  - Proyecto "Ciclovía Av. Y", con la tarea "Asfaltar".

Un **eje** es transversal: agrupa objetivos de una o más unidades (ej.: oferta educativa + salida laboral).

## 3. Modelo de dominio objetivo

```
Organization (tenant = municipio)
 ├── OrgUnit (árbol) ─ central → ministerio/secretaría → área/dirección …   [N3: visión, misión]
 ├── StrategicPlan (1 vigente) ─ visión de gobierno, mandato inicio–fin      [N1]
 │    └── Axis (0..n, opcional) ─ nombre, descripción, orden                 [N2]
 ├── Period (configurable por org) ─ label libre, ej. "2027"
 └── Objective ─ periodId, orgUnitId, axisId?                                [N4]
      ├── ObjectiveIndicator (1..n) ─ metricId, línea base, meta, peso?, curva esperada, linkMode
      │      └── Metric (serie) ─ unidad, dirección, frecuencia, tipo, fuente
      │             └── MetricEntry (incrementos por bucket)
      └── Project (0..n) ─ orgUnitId, owner, fechas, peso?, progressMode     [N5]
             ├── Task (1..n) ─ fechas (Gantt), avance, peso?
             └── ProjectContribution (0..n) ─ aporte a un ObjectiveIndicator (solo lineales)
```

### 3.1 Entidades nuevas y cambios (dirección para el ADR; el architect puede ajustar nombres)

| Entidad | Schema | Estado | Campos clave |
|---|---|---|---|
| `OrgUnit` | `core` | **Nueva** | `organizationId`, `parentId?`, `kind` (`central`\|`ministry`\|`area`), `name`, `vision?`, `mission?`, `order`, `deletedAt`. Una sola raíz `central` por org. Profundidad máx. 4 |
| `UserOrganizationRole.orgUnitId` | `core` | **Columna nueva** | Nullable. `null` = alcance toda la org. Si se setea, el alcance de escritura es esa unidad y sus descendientes |
| `StrategicPlan` | `planning` (nuevo) | **Nueva** | `organizationId`, `title`, `vision` (text), `mandateStartsAt`, `mandateEndsAt`, `status` (`active`\|`archived`). Máx. 1 `active` por org |
| `Axis` | `planning` | **Nueva** | `strategicPlanId`, `organizationId`, `name`, `description` (text), `order`, `deletedAt` |
| `Objective` | `okr` | **Columnas nuevas** | `orgUnitId` (obligatorio tras la migración), `axisId?`, `resultProgressCachedBp`, `executionProgressCachedBp`. `progressCachedBp` queda deprecado |
| `Project` | `okr` | **Nueva** | `objectiveId`, `organizationId`, `orgUnitId`, `title`, `description?`, `ownerUserId?`, `weightBp?` (nullable), `startsAt`, `endsAt`, `progressMode` (`from_tasks` default \| `from_indicator`), `sourceObjectiveIndicatorId?` (si `from_indicator`), `progressCachedBp`, `deletedAt` |
| `Task` | `okr` | **Cambio** | Nueva `projectId`. `keyResultId` pasa a nullable y luego se elimina. `weightBp` pasa a nullable |
| `ObjectiveIndicator` | `metrics` | **Nueva** (reemplaza `MetricKrLink`) | `objectiveId`, `metricId`, `organizationId`, `baselineValue`, `targetValue`, `direction`, `weightBp?`, `expectedCurveMode` (`linear`\|`manual`\|`from_projects`), `linkMode` (`independent` default \| `execution_feeds_indicator` \| `indicator_feeds_execution`), `progressCachedBp` |
| `IndicatorTargetPoint` | `metrics` | **Nueva** | `objectiveIndicatorId`, `bucketDate`, `expectedValue` (acumulado esperado). Solo si `expectedCurveMode = manual` |
| `ProjectContribution` | `metrics` | **Nueva** | `projectId`, `objectiveIndicatorId`, `contributionValue` (Decimal), `appliedEntryId?` |
| `Metric` | `metrics` | **Cambio** | `frequency` suma `quarterly`\|`semiannual`\|`annual`. Columnas nuevas: `kind` (`output`\|`outcome`), `source?` (fuente del dato), `description?` (fórmula/definición) |
| `MetricObjectiveContext` | `metrics` | Sin cambio | Sigue siendo "indicador de contexto": se ve en el objetivo, sin meta y sin impacto en el avance |
| `KeyResult`, `MetricKrLink` | `okr`, `metrics` | **Deprecadas** → se eliminan en la última fase | — |

Convenciones vigentes que se mantienen: Decimal para valores, basis points para pesos y avances, soft-delete, `organizationId` en toda tabla, audit append-only en toda mutación, FKs cross-schema por SQL crudo.

## 4. Reglas de negocio (RN-P)

### Estructura
- **RN-P1**: Toda org tiene exactamente una `OrgUnit` raíz de tipo `central`, sin importar qué módulos tenga habilitados. Se crea automáticamente (de forma idempotente) al crear la organización, y la migración la crea para las organizaciones existentes (backfill).
- **RN-P2**: Un `StrategicPlan` activo por org. Los ejes pertenecen a un plan. Un objetivo puede tener 0 o 1 eje.
- **RN-P3**: Todo `Objective` pertenece a exactamente un `Period` y una `OrgUnit` de tipo `ministry` o `area`. Se mantiene la regla de período único. El `Period` es configurable por org (ADR-0009 D7): no impone duración (anual, semestral, cuatrimestral, plurianual) y su label es libre. Sus fechas se pueden editar; si el rango nuevo deja afuera proyectos, tareas o cargas, se rechaza con 422 y la lista de entidades afectadas, y si se acepta se recalculan los buckets. Los períodos existentes no se migran.
- **RN-P4**: Un `Project` pertenece a un objetivo. Hereda la unidad del objetivo por defecto, pero puede ser una sub-unidad de esa unidad. Sus fechas deben caer dentro del período del objetivo.
- **RN-P5**: Las tareas cuelgan de un proyecto. Las fechas de la tarea deben caer dentro de las del proyecto.

### Ponderación opcional (pedido explícito del feedback)
- **RN-P6**: Los pesos son **todo o nada por grupo de hermanos**: o todos los hermanos tienen `weightBp` y suman 10000, o ninguno tiene peso y se usa promedio simple. Aplica a indicadores dentro de un objetivo, proyectos dentro de un objetivo y tareas dentro de un proyecto.
- **RN-P7**: Al pasar un grupo de "sin pesos" a "con pesos", la UI propone un reparto equitativo editable. Se adapta `okr-domain/invariants.ts`, que hoy exige siempre la suma 10000.

### Dos lecturas de avance (respuesta a "avance de gestión vs. indicador")
- **RN-P8**: Cada objetivo expone **dos avances independientes** y no se fusionan en un número único:
  - **Avance de resultado** (`resultProgressCachedBp`): promedio (ponderado o simple) del progreso de sus indicadores. Progreso del indicador = interpolación `(actual − base)/(meta − base)` según la dirección, acotada a 0–100. Se reutiliza `metrics-domain/progress.ts`.
  - **Avance de gestión** (`executionProgressCachedBp`): promedio (ponderado o simple) del progreso de sus proyectos. Progreso del proyecto = promedio de sus tareas.
- **RN-P9**: Cada lectura tiene su **desvío contra lo esperado a la fecha**:
  - Resultado: valor real contra la curva esperada del indicador al último bucket cargado.
  - Gestión: avance real contra el avance planificado por fechas, donde una tarea "debería" estar en `(hoy − inicio)/(fin − inicio)`.
  - Semáforo por desvío, con umbrales por defecto de 10 y 25 puntos (configurables por org en una fase posterior).
- **RN-P10**: La agregación hacia arriba (unidad, eje, plan) es el promedio simple de los objetivos, en ambas lecturas por separado.
- **RN-P11**: El flujo **indicador → avance automático** de la metodología anterior se elimina. El indicador ya no "alimenta" a un KR: es la medida del objetivo.

### Gestión que impacta en el indicador (solo indicadores lineales)
- **RN-P12**: Un indicador `kind = output` (producto: km, cantidad de obras) puede recibir **aportes de proyectos** (`ProjectContribution`). Un indicador `kind = outcome` (resultado: alfabetización, calidad educativa) **no admite aportes** y se carga solo manualmente.
- **RN-P13**: Cuando un proyecto llega al 100%, el sistema crea un `MetricEntry` con `incrementValue = contributionValue`. El entry se fecha en el bucket de la fecha de cierre, con el comentario "Aporte automático — Proyecto X" y queda auditado. Si el proyecto baja del 100%, se crea un entry compensatorio negativo; nunca se borra. Esto encaja con RN-C5 (incrementos) y RN-C6 (correcciones).
- **RN-P14**: La carga manual sobre un indicador con aportes sigue permitida (convivencia). La UI distingue visualmente las cargas automáticas de las manuales.
- **RN-P14b** (ADR-0009 D5): `ObjectiveIndicator.linkMode` define el vínculo con la gestión:
  - `independent` (default): sin vínculo (indicadores `outcome`).
  - `execution_feeds_indicator`: los proyectos con `ProjectContribution` suman al indicador (RN-P12/13). Solo `kind = output`.
  - `indicator_feeds_execution`: un `Project` con `progressMode = 'from_indicator'` toma su avance del progreso de ese indicador en lugar de sus tareas, que quedan informativas (como RN-O4).
  - Un mismo par proyecto ↔ indicador no puede usar los dos sentidos a la vez. Se valida en el service.

### Frecuencia (respuesta a "¿en qué impacta la frecuencia?")
- **RN-P15**: La frecuencia del `Metric` define:
  1. Los buckets de carga (RN-C4, extendido a trimestral, semestral y anual).
  2. La granularidad de la curva esperada.
  3. El eje del gráfico.
  4. La detección de **carga vencida**: un bucket cerrado hace más de `N` días sin entry da estado "pendiente de carga" en el indicador, en el objetivo y en los tableros. `N` vale 10 por defecto, como constante en esta fase.
- **RN-P16**: La frecuencia sigue siendo inmutable tras crear el indicador (RN-C3).

### Curva de progreso esperada (respuesta a "¿cómo marco la curva?")
- **RN-P17**: Hay tres modos por `ObjectiveIndicator`:
  - `linear` (default): de la línea base a la meta entre el inicio y el fin del período. Comportamiento actual (RN-C8).
  - `manual`: el usuario define metas intermedias (acumulado esperado) por bucket en `IndicatorTargetPoint`. El último punto debe ser igual a la meta. Los buckets sin punto se interpolan linealmente entre puntos.
  - `from_projects`: solo para `output` con aportes. Es una curva escalonada: en cada `endsAt` planificado de un proyecto con aporte, el esperado sube en `contributionValue`. Si la suma de aportes no llega a la meta, se avisa en la UI.
- **RN-P18**: Esta regla reemplaza RN-C8 ("siempre lineal, no configurable") para los indicadores vinculados a un objetivo. El `Metric` suelto del Módulo 1 sigue lineal.

### Instrumentación por nivel (respuesta a "¿cómo se instrumenta según el nivel?")
- **RN-P19**: Los usuarios con alcance `null` (unidad central) administran N1 y N2, el árbol de unidades y ven y editan todo.
- **RN-P20**: Un usuario con alcance en una unidad **lee toda la org** (transparencia intra-gobierno) y **escribe solo en su unidad y sus descendientes**: visión y misión de su unidad, objetivos, indicadores, proyectos, tareas y cargas. Si se quiere lectura restringida, es una opción futura.
- **RN-P21**: El permiso se evalúa como RBAC actual (rol) ∧ alcance de unidad. El chequeo vive en un guard o servicio reutilizable, nunca en los controllers. Lee de `request.authContext` según la regla de guards de `CLAUDE.md`.

## 5. Vistas (frontend)

1. **Configuración → Estructura**: ABM del árbol de unidades (central/admin), con visión y misión por unidad. Asignación de alcance de unidad a cada miembro.
2. **Plan de gobierno**: visión (N1) y ABM de ejes (N2). Cada eje muestra sus objetivos y unidades con las dos lecturas agregadas.
3. **Árbol de planificación**: Plan → Ejes / Unidades → Objetivos, con dos barras por nodo (resultado y gestión), semáforo y "cargas pendientes". Filtros por eje, unidad y período.
4. **Ficha de objetivo**: encabezado con las dos lecturas y sus desvíos.
   - Pestaña Indicadores: gráfico real vs. esperado, carga y estado de buckets.
   - Pestaña Proyectos: lista y Gantt de proyecto→tareas.
   - Pestaña Contexto: indicadores de contexto.
5. **Editor de indicador del objetivo**: métrica (existente o nueva), tipo, frecuencia, fuente, línea base, meta, peso opcional, modo de curva y editor de puntos (manual).
6. **Ficha de proyecto**: tareas con Gantt, pesos opcionales y aportes a indicadores.
7. **Vista ejecutiva (Gantt existente)**: pasa a Objetivo → Proyecto → Tarea.

Las etiquetas de UI van en un diccionario único (`apps/web/src/lib/labels.ts` o similar) para poder hacerlas configurables por org más adelante sin buscar strings por todo el código.

## 6. Migración desde el modelo actual

Patrón **expand → migrate → contract**:

1. **Expand**: tablas y columnas nuevas, nullable donde haga falta. Las viejas siguen funcionando.
2. **Migrate** (script idempotente, con `pg_dump` previo de Railway). Por cada org:
   1. Crear `OrgUnit` central y una unidad "Sin asignar" (`ministry`). Asignar todos los objetivos a "Sin asignar".
   2. Por cada **KR `automatic` con `MetricKrLink`**: crear un `ObjectiveIndicator` con la misma métrica, base, meta, dirección y peso. Las tareas que colgaban de ese KR (eran informativas por RN-O4) se mueven a un proyecto "Tareas de <KR>".
   3. Por cada **KR `manual`**: crear un `Project` con el título del KR, owner y peso, fechas = min/max de sus tareas (o las del período si no hay tareas). Re-parentar sus tareas.
   4. Recalcular las dos lecturas de todos los objetivos.
   5. Emitir eventos de auditoría `migration.*` por entidad creada.
3. **Contract** (en una fase posterior, cuando el front ya no use KR): eliminar `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `Objective.progressCachedBp` y los endpoints `/key-results*`.
4. **Seed demo**: se reescribe completo con "Municipalidad de San Carrillo": 2 ejes, 3 unidades, 4–6 objetivos, al menos un indicador `outcome` con frecuencia semestral y curva manual, y al menos un indicador `output` con aportes de proyectos y curva `from_projects`.

## 7. Fuera de alcance (esta etapa)

- Objetivos plurianuales con metas anuales encadenadas, y la duplicación de objetivos al período siguiente.
- Presupuesto y ejecución financiera de proyectos.
- Etiquetas configurables por org desde la UI (solo se centralizan en el diccionario).
- Una fórmula combinada de avance (resultado + gestión) en un único número.
- Lectura restringida por unidad.
- Portal público o de transparencia ciudadana.
- Adaptación del copiloto de IA al nuevo modelo (sus prompts siguen hablando de objetivos; los KR se reemplazan por indicadores en una fase posterior).
- Notificaciones (email o Telegram) de cargas vencidas: solo el estado visual.
- Rename técnico `gestion-publica` → `gestion-integral` (ADR-0008 sigue diferido).

## 8. Preguntas abiertas (Pedro)

- **PA-1**: ¿Confirmás que no hay clientes con datos reales en producción? Si los hay, la migración necesita una ventana y una validación con el cliente.
- **PA-2**: ¿La lectura de toda la org para usuarios de unidad (RN-P20) está bien como default?
- **PA-3**: ¿El aporte de un proyecto se aplica al llegar al 100% (RN-P13) o se quiere un aporte proporcional al avance? El 100% es más simple y más honesto para obras.
- **PA-4**: ¿Los umbrales de semáforo de 10 y 25 puntos sirven como default?
- **PA-5**: ¿Hace falta mantener la metodología OKR clásica para algún tenant? Hoy se asume que no.
