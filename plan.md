# plan.md — Reorientación a Planificación de gobierno (5 niveles)

**Spec de referencia**: `docs/features/planificacion-gobierno.md` (en adelante, **SPEC**).
**Bitácora**: `bitacora.md` (una entrada por corrida).
**Estado**: Fases 1–10 completas · Fase 12 (sector privado) en curso antes de seguir la Fase 11 · actualizado 2026-10-11.

---

## Cómo se ejecuta este plan

- Cada corrida (`Cxx`) es **una sesión nueva de Claude Code con un solo subagente**. Produce 1–2 artefactos y termina en `WAITING FOR APPROVAL`.
- Hay **una rama por fase** (`feature/plan-fN-<slug>`): las corridas de una misma fase commitean en esa rama. Al cerrar la fase, el agente pushea la rama y abre el PR (ver punto siguiente); Pedro revisa `git diff main..HEAD --stat` y mergea. Después hace `git pull` de main antes de la fase siguiente.
- Los agentes commitean. En la última corrida de cada fase (la marcada con 🔍), después del commit, el agente hace git push -u origin <rama> y gh pr create --base main --fill, y devuelve la URL del PR. Nunca mergea; el merge lo hace Pedro.
- Fail-fast: si un paso falla 2 veces, el agente se detiene y reporta. No reintenta con otra estrategia.
- Verificación de DB: `docker exec <pg> psql …`, no levantar la app y usar curl.
- Smoke manual: lo hace Pedro después de cada corrida marcada con 🔍, nunca dentro de la corrida.
- Si una corrida trae una decisión no cubierta por la SPEC, el agente no la inventa: la anota en "Preguntas abiertas" de `bitacora.md` y sigue con lo que sí está definido, o se detiene si bloquea.

### Prompt estándar (copiar, completar `<…>` y pegar)

```
Rol: <subagente>. Corrida <Cxx> de plan.md.
1. Leer CLAUDE.md, la sección <Cxx> de plan.md y las secciones de docs/features/planificacion-gobierno.md que esa corrida cita.
2. Verificar que estás en la rama <rama> (crearla desde main si es la primera corrida de la fase). git status limpio.
3. Ejecutar los pasos de <Cxx> en orden.
4. Correr las verificaciones listadas en <Cxx>.
5. Agregar una entrada en bitacora.md (formato del archivo).
6. Commit con mensaje en /tmp/<cxx>.txt (heredoc). Push solo si es la última corrida de la fase (paso 8).
7. Output: solo el hash del commit y la salida de las verificaciones (tail -20).
8. Si es la última corrida de la fase: push + gh pr create según 'Cómo se ejecuta este plan'. Output: URL del PR.
9. Escribir WAITING FOR APPROVAL y detenerte.
```

Si el agente se traba (más de 2 horas, o vueltas sin avance): Ctrl+C, revisar `git status` y `git log -3`, y relanzar la corrida con un prompt más chico (solo los pasos faltantes).

---

## Fase 0 — Preparación (Pedro, sin agente)

- [ ] En WSL: pushear todo lo pendiente (`git status`, `git log origin/main..`). Borrar las ramas remotas ya mergeadas.
- [ ] En el LXC:
  - clonar el repo y usar Node ≥ 20;
  - `corepack enable && pnpm install`;
  - `gh auth login` y `claude` logueado.
- [ ] Postgres local en Docker dentro del LXC, con `.env` apuntando ahí (**nunca a Railway**). Correr `pnpm --filter api prisma:migrate:deploy` y el seed demo actual.
- [ ] `pnpm typecheck && pnpm test` en verde antes de empezar (línea base).
- [ ] Claude Code dentro de `tmux new -s gi` para que sobreviva a las desconexiones.
- [ ] Mergear a main el PR con `plan.md`, `bitacora.md` y la SPEC.
- [ ] Responder las preguntas PA-1…PA-5 de la SPEC §8 (se pueden ir respondiendo; PA-1 bloquea la Fase 5).

---

## Fase 1 — Decisión y guardrails · rama `feature/plan-f1-adr`

### C01 — Discovery de impacto (architect, solo lectura de código)
- Artefacto: `docs/features/planificacion-gobierno-impacto.md` (máx. 150 líneas).
- Pasos:
  1. Mapear en schema, services, controllers, DTOs (`shared-types`) y pantallas web todo lo que toca `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `progressCachedBp` y `weightBp`.
  2. Listar los tests afectados (`okr-domain`, `metrics-domain`, specs de services).
  3. Armar una tabla "archivo → cambio esperado → fase del plan".
  4. Listar los riesgos que la SPEC no contempla.
- Verificación: `wc -l` del doc.

### C02 — ADR-0009 (architect)
- Artefacto: `docs/adr/0009-planificacion-gobierno-5-niveles.md`.
- Contenido:
  - el supuesto de vertical declarado (ADR-0006 D2.5);
  - la decisión de reorientar el dominio en el mismo repo (alternativas descartadas: fork y módulo paralelo);
  - el modelo de SPEC §3;
  - las dos lecturas de avance;
  - expand → migrate → contract;
  - los nombres finales de tablas y schemas (puede ajustar los de la SPEC, justificando).
- Agregar en ADR-0006 una línea "Amended by: 0009" (única edición permitida a un ADR viejo).

### C03 — Guardrails de agentes (architect)
- Artefactos: `CLAUDE.md` y `AGENTS.md`.
- Cambios:
  - Reemplazar la regla 4 ("no introducir jerarquía organizacional") por: "La jerarquía es `OrgUnit` según ADR-0009; no agregar otra".
  - Actualizar la regla 5 (período anual) y la regla 12 (se permiten `plan.md`, `bitacora.md` y `docs/features/*`).
  - Reescribir las "Notas de dominio" con los 5 niveles, las dos lecturas (prohibido fusionarlas en un número) y la ponderación todo-o-nada.
  - Agregar una sección "Glosario UI ↔ código" (Objetivo estratégico = `Objective`, Indicador = `ObjectiveIndicator`/`Metric`, etc.).
- 🔍 Pedro revisa y mergea la Fase 1.

---

## Fase 2 — Estructura (N1–N3) · rama `feature/plan-f2-estructura`

### C04 — OrgUnit + alcance de membresía (backend-dev)
- SPEC §3.1 (`OrgUnit`, `UserOrganizationRole.orgUnitId`), RN-P1.
- Pasos:
  1. Migración Prisma de `core.org_unit` (CHECK de `kind` y unique parcial de la raíz central) y de la columna `org_unit_id` en la membresía.
  2. Service y controller de ABM del árbol, con validación de profundidad ≤ 4, sin ciclos y sin borrar unidades con hijos u objetivos.
  3. Creación automática de la raíz central al habilitar el módulo.
  4. Auditoría de toda mutación.
- Verificación:
  - `pnpm --filter api prisma:generate && pnpm typecheck && pnpm --filter api test`;
  - `psql`: `\d core.org_unit`.

### C05 — StrategicPlan + Axis + vínculos del Objective (backend-dev)
- SPEC §3.1, RN-P2, RN-P3.
- Pasos:
  1. Schema `planning` con `strategic_plan` y `axis`.
  2. Columnas `org_unit_id` (nullable por ahora) y `axis_id` en `okr.objective`.
  3. Endpoints: plan vigente (get/upsert), ABM de ejes y asignación de unidad y eje en create/update de Objective.
  4. DTOs en `shared-types`.
- Verificación: idem C04.

### C06 — Pantallas Estructura y Plan de gobierno (frontend-dev)
- SPEC §5.1, §5.2.
- Pasos:
  1. Configuración → Estructura: árbol, visión y misión, y alcance por miembro.
  2. Página "Plan de gobierno": visión y ejes. Borrar eje: confirmación con warning destacado si tiene objetivos (`objectiveCount`); se desasignan.
  3. Selectores de unidad y eje en el dialog de Objetivo.
  4. Diccionario de etiquetas `lib/labels.ts`.
- Verificación: `pnpm --filter web typecheck && pnpm --filter web lint`.
- 🔍 Pedro: crear la estructura de San Carrillo a mano. Merge de la Fase 2.

---

## Fase 3 — Ejecución (N5) · rama `feature/plan-f3-proyectos`

### C07 — Dominio puro: pesos opcionales + avance de gestión (backend-dev o qa-engineer)
- SPEC RN-P6, RN-P7, RN-P8 (gestión), RN-P9 (planificado por fechas).
- Pasos en `packages/okr-domain`:
  1. `invariants`: aceptar grupos sin pesos.
  2. `cascade`: promedio simple si no hay pesos.
  3. Nuevo `plannedProgress(tasks, at)`.
  4. Tests de propiedades: todos los hermanos al 100% dan 100; sin pesos es igual a la media; el ponderado respeta los pesos.
- Verificación: `pnpm --filter okr-domain test`.

### C08 — Project + Task.projectId (backend-dev)
- SPEC §3.1, RN-P4, RN-P5, RN-P8.
- Pasos:
  1. `okr.project`, y `task.project_id` + `task.key_result_id` nullable + `task.weight_bp` nullable.
  2. ABM de proyectos.
  3. Tareas creables bajo proyecto.
  4. Recálculo: tarea → proyecto → `executionProgressCachedBp` del objetivo. **El camino KR existente sigue funcionando.**
- Verificación: typecheck + test api + `psql` del recálculo con un caso a mano.

### C09 — UI de proyectos (frontend-dev)
- SPEC §5.4 (pestaña Proyectos), §5.6.
- Pasos: ficha de objetivo con la pestaña Proyectos, ficha de proyecto con tareas, Gantt y pesos opcionales (toggle "ponderar"), y la barra "Avance de gestión" en el encabezado del objetivo.
- 🔍 Pedro: el objetivo "Ciclovías" con 2 proyectos y tareas. Merge de la Fase 3.

---

## Fase 4 — Medición (N4) · rama `feature/plan-f4-indicadores`

### C10 — Extensión de Metric (backend-dev)
- SPEC §3.1 (`Metric`), RN-P15, RN-P16.
- Pasos:
  1. Frecuencias `quarterly`, `semiannual` y `annual` en el CHECK y en `metrics-domain/buckets.ts` (con tests).
  2. Columnas `kind`, `source` y `description`.
  3. DTOs.
- Verificación: `pnpm --filter metrics-domain test && pnpm --filter api test`.

### C11 — ObjectiveIndicator + avance de resultado (backend-dev)
- SPEC §3.1, RN-P8 (resultado), RN-P11.
- Pasos:
  1. Tabla `metrics.objective_indicator`.
  2. ABM (crear con métrica existente o nueva en un solo paso).
  3. Hook: carga de `MetricEntry` → recálculo del indicador → `resultProgressCachedBp` del objetivo.
  4. Aplicar los pesos opcionales.
  5. RN-P12: el update de `Metric` rechaza `kind` `output` → `outcome` (422) si algún `ObjectiveIndicator` de la métrica es `execution_feeds_indicator`.
- Verificación: typecheck + test + `psql`.

### C12 — UI de indicadores (frontend-dev)
- SPEC §5.4 (pestaña Indicadores), §5.5 (sin editor de curva todavía).
- Pasos: editor de indicador (tipo, frecuencia, fuente, base, meta y peso), pestaña con el gráfico real vs. esperado lineal y la carga, y la barra "Avance de resultado" junto a la de gestión.
- 🔍 Pedro: cargar 3 buckets y ver las dos barras moverse por separado. Merge de la Fase 4.

---

## Fase 5 — Migración + demo · rama `feature/plan-f5-migracion` · **requiere PA-1 respondida**

### C13 — Script de migración + seed San Carrillo (backend-dev)
- SPEC §6.
- Artefactos:
  - `apps/api/src/database/migrate-to-planning.ts`: idempotente, con `--dry-run` que imprime los conteos.
  - `seed-demo.ts` reescrito.
- Verificación: correr el script contra la DB local con el seed viejo; con `psql`, contar KR vs. indicadores + proyectos creados. Luego correr el seed nuevo sobre la DB vacía.
- 🔍 Pedro:
  1. `pg_dump` de Railway.
  2. Mergear.
  3. Deploy.
  4. Correr `--dry-run` y después real contra Railway.
  5. Smoke de demo completo.

---

## Fase 6 — Curvas, vencidos y desvíos · rama `feature/plan-f6-curvas`

### C14 — Dominio puro de curvas y desvíos (backend-dev)
- SPEC RN-P9, RN-P15 (vencidos), RN-P17.
- `metrics-domain`:
  1. `expectedCurve(mode, …)` para `linear` (existente), `manual` (interpolación entre puntos) y `from_projects` (escalonada).
  2. `deviation(actual, expected)`.
  3. `semaphore(dev, thresholds)`.
  4. `pendingBuckets(entries, buckets, today, graceDays)`.
  5. Tests.

### C15 — Persistencia y API (backend-dev)
- `metrics.indicator_target_point`, `expectedCurveMode` en `ObjectiveIndicator`, validación de que el último punto sea igual a la meta.
- Endpoint de estado del indicador: esperado a la fecha, desvío, semáforo y buckets pendientes.
- Endpoint de estado del objetivo: las dos lecturas con su desvío.

### C16 — UI de curvas y semáforos (frontend-dev)
- Editor de puntos (modo manual), curva superpuesta en el gráfico, semáforos y badge "carga pendiente" en el objetivo y en los listados.
- 🔍 Pedro: indicador `outcome` semestral con curva manual. Merge de la Fase 6.

---

## Fase 7 — Aportes de proyectos a indicadores · rama `feature/plan-f7-aportes`

### C17 — ProjectContribution + hook (backend-dev)
- SPEC RN-P12, RN-P13, RN-P14.
- Pasos:
  1. Tabla y ABM, con validación de que el indicador sea `output`.
  2. Hook "el proyecto llega al 100%" → `MetricEntry` automático; "baja del 100%" → entry compensatorio.
  3. Modo de curva `from_projects` habilitado.
  4. Tests de integración del ida y vuelta.
  5. RN-P12: extender el bloqueo de `kind` `output` → `outcome` a métricas cuyos indicadores tengan `ProjectContribution`.

### C18 — UI de aportes (frontend-dev)
- Sección "Aporta a indicador" en la ficha de proyecto, distinción visual de las cargas automáticas y aviso "los aportes no alcanzan la meta".
- 🔍 Pedro: completar "Ciclovía Av. Y" → +4 km en el indicador. Merge de la Fase 7.

---

## Fase 8 — Permisos por unidad · rama `feature/plan-f8-alcance`

### C19 — Guard o servicio de alcance (backend-dev)
- SPEC RN-P19, RN-P20, RN-P21.
- Pasos:
  1. Resolver los descendientes de la unidad (CTE recursiva, cacheada por request).
  2. Aplicar en toda mutación de `Objective`, `ObjectiveIndicator`, `Project`, `Task`, `MetricEntry`, `OrgUnit` y `Axis`.
  3. Leer de `request.authContext`.
  4. Tests de integración por rol × alcance.
  5. Elegir unidad al invitar (`inviteByEmail` con `orgUnitId`) y decidir el alcance por defecto de un miembro nuevo (hoy `null` = toda la org). Viene de C04; ver TODO.md.

### C20 — Revisión de seguridad (security-reviewer)
- Revisar el diff de la Fase 8 y de las Fases 2–7 contra tenant scoping y alcance.
- Artefacto: reporte en `bitacora.md`. Los hallazgos críticos generan una corrida C20b.
- 🔍 Pedro: usuario de área sin permiso de editar otra área. Merge de la Fase 8.

---

## Fase 9 — Tableros · rama `feature/plan-f9-tableros`

### C21 — Árbol de planificación y tableros por eje y unidad (frontend-dev, + endpoint agregado por backend-dev si hace falta)
- SPEC §5.3, RN-P10.

### C22 — Vista ejecutiva Objetivo → Proyecto → Tarea (frontend-dev)
- SPEC §5.7.
- 🔍 Pedro: demo completa. Merge de la Fase 9.

---

## Fase 10 — Contract · rama `feature/plan-f10-contract`

### C23 — Eliminar KR (backend-dev)
- Drop de `KeyResult`, `MetricKrLink`, `Task.keyResultId` y `Objective.progressCachedBp`, de los endpoints `/key-results*`, del código muerto y de sus tests.
- `Objective.orgUnitId` y `Task.projectId` pasan a NOT NULL.

### C24 — Limpieza del front (frontend-dev)
- Pantallas y componentes de KR, y referencias de "KR" en el copy.
- `TODO.md`: agregar "[F] Adaptar copiloto de IA al modelo de planificación".
- 🔍 Pedro: smoke de regresión completo. Merge.

---

## Fase 11 — Conector para asistentes de IA (MCP) · rama `feature/plan-f11-conector-mcp`

Objetivo: que un usuario pueda consultar y cargar el plan desde Claude o ChatGPT con su propia identidad, con los mismos permisos, alcance por unidad y auditoría que en la web. Un solo servidor MCP remoto sirve a los dos clientes. Decisiones en ADR-0010.

### C25 — ADR-0010 del conector MCP (architect)
- Dónde vive el servidor (módulo de la API o app aparte), transporte, autenticación OAuth con Auth0 y su relación con `AuthGuard`, elección de la organización activa, catálogo de herramientas (lectura y escritura), confirmaciones, límites de uso, auditoría y qué datos salen hacia el proveedor del modelo.
- Artefacto: `docs/adr/0010-conector-mcp.md` con preguntas abiertas para Pedro.

### C25b — Prerrequisitos del conector (backend-dev)
- Pedro (2026-10-12): primero solo Claude; ChatGPT queda para después. Se toman las recomendaciones del ADR-0010 en sus preguntas abiertas, salvo el dominio: en el demo el recurso usa la URL de Railway (el dominio propio va con la infra de producción).
- Throttler por usuario y no por IP (`CustomThrottlerGuard`), `X-Request-Id` validado como UUID y `ModuleEnabledGuard` en los controllers que lo tienen pendiente (ítems de TODO.md).

### C26 — MVP de consultas (backend-dev)
- Servidor MCP con OAuth y las herramientas de lectura del ADR (objetivos con sus dos lecturas, árbol de planificación, proyectos atrasados, serie de indicador).
- Tests de integración: cada herramienta respeta tenant y alcance por unidad.
- Spike al inicio: qué acepta el tenant de Auth0 (parámetro `resource`, DCR o cliente pre-registrado para Claude) y la URL de callback de Claude.
- 🔍 Pedro: conectar el demo a Claude y consultar el plan de las tres orgs.

### C27 — Herramientas de carga (backend-dev)
- Escrituras del ADR (carga de indicador, avance de tarea, alta de proyecto y tarea), marcadas como destructivas para que el cliente pida confirmación, con auditoría y sin borrados.

### C28 — Revisión de seguridad del conector (security-reviewer)
- Revisar el diff de la Fase 11: tokens, audiencia, tenant scoping, alcance, inyección de prompts vía datos y límites de uso. Hallazgos críticos → C28b.
- 🔍 Pedro: carga real desde Claude. Merge de la Fase 11. ChatGPT queda para una fase posterior.

---

## Fase 12 — Sector privado: terminología por organización y seed de una fábrica · rama `feature/plan-f12-sector-privado`

Pedro (2026-10-11): la plataforma tiene que poder mostrarse al sector privado (ADR-0006). Se ejecuta **antes** de C26–C28 de la Fase 11. La rama sale de `feature/plan-f11-conector-mcp`, así que su PR incluye también el ADR-0010 (C25, solo documentación).

Decisión de Pedro: opción C, terminología por organización. Tres diccionarios fijos (sector público, sector privado y organizaciones sin fines de lucro) elegidos por un campo de la organización; sin editor de etiquetas por ahora (ADR-0011, Accepted).

### C29 — ADR-0011 terminología por sector (architect)
- Campo de la organización, valor por defecto, quién lo cambia y dónde, cómo llega a la web, cómo se resuelve el diccionario (`lib/labels.ts`) en server y client components, qué pasa con el copy de los prompts del copiloto, los textos del catálogo y las descripciones de las herramientas MCP (ADR-0010).
- Diccionario privado propuesto completo (plan, visión, ejes, tipos de unidad, tablero).
- Artefacto: `docs/adr/0011-terminologia-por-sector.md` con preguntas abiertas.

### C30 — Terminología por sector (backend-dev + frontend-dev)
- Migración del campo, exposición en la API y selector en Configuración.
- `labels.ts` con los tres diccionarios y su resolución por org activa; ningún texto de gobierno hardcodeado fuera del diccionario.
- Tests: la org privada no muestra "gobierno" en las pantallas principales.

### C31 — Seed "Lumbre Electrodomésticos S.A." (backend-dev)
- Segunda org del demo, sector privado, planta en Rosario: plan estratégico 2026–2028, estructura (Dirección General → direcciones → áreas), 5 ejes, 7 objetivos con indicadores (OEE, reclamos en garantía a la baja, participación online, NPS, modelos inverter con `from_projects` y aportes, kWh por unidad, accidentes con baja) y proyectos con tareas. Sin tocar la org de San Carrillo.
- 🔍 Pedro: recorrer las dos orgs con el selector. Merge de la Fase 12.

---

## Fase 12b — Seed de una organización sin fines de lucro · rama `feature/plan-f12b-seed-ong`

Pedro (2026-10-12): sumar al demo una tercera org, del sector `nonprofit` (ADR-0011 D8 lo había diferido).

### C32 — Seed "Fundación Semillero del Sur" (backend-dev)
- ONG ficticia de inclusión laboral y educativa de jóvenes, con sede en Córdoba. Sector `nonprofit`, sin tocar San Carrillo ni Lumbre.
- Plan estratégico institucional, estructura (Dirección Ejecutiva → áreas → programas), ejes, 6 objetivos con indicadores (jóvenes capacitados con `from_projects` y aportes, inserción laboral, terminalidad educativa, donantes recurrentes, emprendimientos activos, voluntariado) y proyectos con tareas.
- 🔍 Pedro: recorrer las tres orgs con el selector. Merge.

---

## Backlog posterior (fuera de este plan)

Objetivos plurianuales · etiquetas configurables por org · copiloto IA sobre el nuevo modelo · notificaciones de cargas vencidas · lectura restringida por unidad · presupuesto de proyectos · portal de transparencia.
