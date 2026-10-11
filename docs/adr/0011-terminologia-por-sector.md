# 0011 — Terminología por sector de la organización

**Status**: Accepted (2026-10-11)
**Supersedes**: none. **Superseded by**: none.
**Amends**: 0009 (glosario de UI: deja de ser único y pasa a depender del sector de la org), 0010 (D5: regla de las descripciones de herramientas).
**Date**: 2026-10-11
**Author**: architect subagent
**Spec**: N/A — iniciado por pedido de Pedro (Fase 12 de `plan.md`, corrida C29). Contexto: [ADR-0006](./0006-domain-agnostic-platform.md) D2, [ADR-0009](./0009-planificacion-gobierno-5-niveles.md) D1 y glosario, [ADR-0010](./0010-conector-mcp.md) D5.

---

## Contexto y problema

Pedro quiere mostrarle el producto a empresas con un seed de una fábrica de electrodomésticos ("Lumbre Electrodomésticos S.A.", planta en Rosario, C31) **sin que aparezca vocabulario de gobierno**. Además quiere dejar listo el producto para organizaciones sin fines de lucro (fundaciones, asociaciones civiles, cooperativas). Hoy la UI habla de "Plan de gobierno", "mandato", "Ministerio / Secretaría" y "ciudadanos", porque ADR-0009 adoptó el glosario de planificación de gobierno como el único glosario de UI.

ADR-0006 D2.2 ya pedía que la nomenclatura que varía según el tipo de organización fuera configurable en `core.organization`, y ADR-0009 dejó las etiquetas centralizadas "para poder configurarlas por org más adelante". Este ADR ejecuta esa previsión.

**Decisión ya tomada por Pedro (plan.md, Fase 12, opción C)**: terminología por organización con **diccionarios fijos por sector**, elegidos por un campo de la organización. **Sin editor de etiquetas** por ahora. Los sectores son tres: público (el actual), privado y sin fines de lucro (Pedro, 2026-10-11).

### Hechos verificados en el código (2026-10-11)

| Tema | Estado actual | Consecuencia |
|---|---|---|
| Diccionario | `apps/web/src/lib/labels.ts`: un `LABELS` `as const` más 20 constantes temáticas (`ORG_UNIT_KIND_LABELS`, `PLANNING_TREE_LABELS`, `EXECUTIVE_GANTT_LABELS`, `CONTRIBUTION_*`, `SEMAPHORE_LABELS`, etc.). Todo es estático y no sabe nada de la org. | Hay que separar lo que depende del sector de lo que no. |
| Importadores | **50 archivos** importan `@/lib/labels`. Solo **unos 20** usan claves que dependen del sector (`LABELS.plan`, `ORG_UNIT_KIND_LABELS`, `PLANNING_TREE_LABELS.subtitle/noPlan/noPlanHint`, `INDICATOR_KIND_LABELS`). | La migración puede limitarse a esos ~20 archivos. El resto no se toca. |
| Textos de gobierno **dentro** del diccionario | `plan` ("Plan de gobierno", "Visión general de gobierno"), `ORG_UNIT_KIND_LABELS.ministry` ("Ministerio / Secretaría"), `PLANNING_TREE_LABELS.subtitle/noPlan/noPlanHint` y los hints de `INDICATOR_KIND_LABELS` ("km, obras", "alfabetización"). | Pasan al diccionario público, y cada uno de los otros sectores tiene los suyos. |
| Textos de gobierno **fuera** del diccionario | **27 líneas en 11 archivos** (ver la tabla de abajo), más el ícono `Landmark` (edificio de gobierno) en el estado vacío del plan. | Todas pasan al diccionario en C30. |
| "Eje" | Aparece en el diccionario y hardcodeado en 4 archivos (`strategic-plan-panel`, `axis-form-dialog`, `delete-axis-dialog`, `useStrategicPlan`). | **Es igual en los tres sectores** (D4), así que queda compartido y esos textos no se mueven. |
| Org activa en la web | Cookie `activeOrgId` (`lib/active-org.ts`, `set-active-org-action.ts`). El layout `(app)/layout.tsx` llama a `GET /api/v1/me` y calcula `effectiveOrgId`. `AppShell` (client) recibe `me.orgs[]` (con `enabledModules`) y guarda `activeOrgId` en su estado. Al cambiar de org se llama a `setActiveOrgAction` y después a `router.refresh()`. | `me.orgs[]` es el canal natural para el sector: llega al server (layout) y al client (AppShell) sin requests nuevos. |
| Mensajes de error | `features/planning/error-messages.ts` arma el texto **dentro de las server actions** (`failure(info)`, 36 usos en 12 archivos). Seis códigos tienen vocabulario de gobierno: `OrgUnitInvalidParentKind`, `OrgUnitKindInvalid`, `AxisNotInActivePlan`, `StrategicPlanRequired`, `StrategicPlanNotFound` y `MandateRangeInvalid`. El `ActionFailure` ya incluye `code`, y los hooks de mutación pasan por `useActionRunner` (client, 7 hooks). | El texto de cada sector se puede resolver en el cliente a partir de `code`, sin tocar las 36 llamadas. |
| `Organization` (Prisma) | En `core.organization`, `status` es `VarChar(10)` + CHECK, igual que `OrgUnit.kind`, `Project.progressMode` y el resto de los discriminadores. **El schema no tiene ningún `enum` de Prisma.** | La convención del repo es `VarChar` + CHECK + unión TS en `shared-types`. |
| `PATCH /api/v1/orgs/:id` | Pasa por `TenantGuard` + `OrgIdParamGuard` + `@Permissions('core:org-unit:manage')` + `assertCentralScope` (C20b). Lo usa el org-admin central para editar nombre, misión, visión, valores y contexto, y emite `organization.updated`. Crear, activar y desactivar orgs pasa por `SuperadminOnlyGuard`. | El sector no debería entrar por este endpoint, porque lo puede usar el org-admin. |
| Copiloto (`modules/ai`) | `objective-prompts.ts` no tiene vocabulario de gobierno: es neutro, con sesgo empresarial (ventas, clientes, sucursales). Todavía dice "OKR" y asume trimestres; esa deuda ya está en `TODO.md` ("Adaptar copiloto de IA al modelo de planificación"). Los mensajes de cuota dicen "organización". | No se toca (D5). |
| Catálogo | Las descripciones de módulos son neutras desde `20261009000002_catalog_texts_without_kr`. **Pero** el módulo `okr` se sigue llamando **"OKR"** (esa migración solo cambió la descripción), y ese nombre se ve en el dashboard (`module-chip.tsx`) y en el panel de Módulos. Tres permisos dicen "(planificación de gobierno)" en la descripción: `core:org-unit:manage`, `core:org-unit:vision:write` y `planning:plan:manage`. | Se neutraliza en la migración de C30. |
| Resto de la API | Solo hay vocabulario de gobierno en comentarios de código y en el seed (`seed-demo.ts`, San Carrillo). Los mensajes de excepción de `planning` están en inglés técnico (`StrategicPlanNotFound: ...`) y la web los traduce por código. | La API no cambia de comportamiento, salvo por el campo nuevo. |
| MCP (ADR-0010) | Todavía no está implementado (C26 pendiente). D5 dice que las descripciones usan los términos de UI del glosario, y la tabla de herramientas describe `ver_arbol_planificacion` como "Plan de gobierno: ejes, unidades...". | Hay que enmendar D5 antes de C26. |
| Tests e2e | No hay configuración de Playwright en el repo. La web solo tiene Vitest (sin testing-library). | El guard contra regresiones tiene que ser un test de Vitest. |

#### Textos de gobierno hardcodeados fuera de `labels.ts`

| Archivo | Líneas | Texto |
|---|---|---|
| `app/(app)/plan/page.tsx` | 24 | "Para ver el plan de gobierno, primero elegí..." |
| `features/strategic-plan/components/strategic-plan-panel.tsx` | 67–70, 97 | ícono `Landmark`; "Aún no hay plan de gobierno"; "...período del mandato..."; "Crear plan de gobierno"; "Mandato: ..." |
| `features/strategic-plan/components/plan-form-dialog.tsx` | 51, 61, 72, 79, 89, 100 | "...del mandato"; placeholder "Plan de gobierno 2026-2029"; "Hacia dónde va el gobierno durante este mandato..."; "Inicio/Fin del mandato"; error de rango |
| `features/strategic-plan/components/axis-select.tsx` | 36 | "Podés crearlos en Plan de gobierno." |
| `features/planning/error-messages.ts` | 12, 22–25, 57 | ministerio/secretaría, área/dirección, plan de gobierno, mandato |
| `components/orgs/org-context-form.tsx` | 69, 82, 95 | placeholders con "ciudadanos", "servicios públicos digitales", "respeto por el ciudadano" |
| `components/orgs/create-org-button.tsx` | 246, 263 | placeholders "Ministerio de Salud", "ej-ministerio-salud" |
| `features/org-structure/components/org-unit-form-dialog.tsx` | 102 | placeholder "Secretaría de Obras Públicas" |
| `features/indicators/components/indicator-form-dialog.tsx` | 285 | placeholder "Registro de obras de la Secretaría" |
| `components/metrics/metric-form-dialog.tsx` | 260 | ídem |
| `components/objectives/create-objective-button.tsx` | 174 | placeholder "Mejorar atención ciudadana" |

Hay un falso positivo que conviene reescribir para que el guard de D7 no lo marque: en `indicator-form-dialog.tsx:487`, "se interpola entre los vecinos" usa "vecinos" en el sentido de intervalos contiguos.

### Preguntas a responder

1. ¿Qué campo, con qué tipo, default y migración?
2. ¿Quién cambia el sector y desde dónde?
3. ¿Cómo llega el sector a la web y cómo se resuelve el diccionario en server y client components sin reescribir los 50 importadores?
4. ¿Cuál es el diccionario de cada sector, término por término?
5. ¿Qué pasa con el copiloto, el catálogo y el conector MCP?
6. ¿Cómo evitamos que vuelvan los textos hardcodeados?
7. ¿Qué cambia en el seed?

### Supuestos declarados

- El sector **solo cambia etiquetas**. No cambia reglas de dominio, permisos, módulos ni cálculos. Todas las organizaciones usan el mismo modelo de 5 niveles (ADR-0009).
- Los **datos cargados por usuarios** (nombres de unidades, títulos del plan, descripciones) no se traducen. Si una org pública pasa a privada, su "Secretaría de Obras" sigue llamándose así.
- El locale sigue siendo `es-AR` (ADR-0006 D3). Esto no es i18n.

---

## Decisión

Vamos a agregar a `core.organization` una columna **`sector`** (`'public' | 'private' | 'nonprofit'`, default `'public'`). La define **solo el superadmin**, al crear la org, y la puede cambiar después desde Configuración. El sector viaja a la web dentro de `GET /me` (`orgs[].sector`) y en el detalle de la org.

La web separa `labels.ts` en dos partes:

- **etiquetas compartidas**, cuyos importadores no cambian;
- **etiquetas por sector**: tres diccionarios con el mismo tipo, completos por construcción. Los server components las obtienen con `getLabels()` y los client components con `useLabels()` (provider en `AppShell`).

Los términos núcleo de cada sector (plan, visión del plan, vigencia y tipos de unidad) viven en `shared-types`, para que el conector MCP use los mismos que la UI.

Del lado de la API: el catálogo se neutraliza, el copiloto no se toca, y las descripciones de MCP pasan a ser neutras, con la terminología de la org viajando en los datos.

Un test de Vitest impide que vuelvan textos de gobierno fuera del diccionario público.

---

## Decisiones de diseño

### D1 — Campo `Organization.sector`

- **Nombre**: `sector` (columna `sector` en `core.organization`). Valores: `'public'` (sector público), `'private'` (empresas) y `'nonprofit'` (organizaciones sin fines de lucro: fundaciones, asociaciones civiles, cooperativas).
- **Tipo**: `String @db.VarChar(10) @default("public")` con `CHECK (sector IN ('public','private','nonprofit'))` en la migración (`'nonprofit'` tiene 9 caracteres, así que `VarChar(10)` alcanza), más la unión `OrganizationSector = 'public' | 'private' | 'nonprofit'` en `packages/shared-types/src/core`. **No** se usa un `enum` de Prisma:
  - el schema no tiene ningún `enum`; todos los discriminadores son `VarChar` + CHECK, y un `enum` solo para este campo rompería la convención;
  - agregar un valor a un enum de Postgres requiere un `ALTER TYPE ... ADD VALUE` que no se revierte limpio, y Prisma lo maneja peor que un cambio de CHECK.
- **Default `'public'` y migración sin backfill**: `ADD COLUMN sector VARCHAR(10) NOT NULL DEFAULT 'public'`. En Postgres 11 o posterior es un cambio de metadata: no reescribe filas y no hace falta ningún `UPDATE`. Todas las orgs existentes quedan en `public`, que es exactamente el comportamiento de hoy.
- **Extensible**: sumar otro sector consiste en ampliar el CHECK y la unión TS y escribir su diccionario. El tipo de D3 obliga a que el diccionario nuevo esté completo.

### D2 — Quién lo cambia y dónde: solo el superadmin

- **Al crear la org**: `POST /api/v1/orgs` (que ya pasa por `SuperadminOnlyGuard`) acepta un `sector` opcional, con default `'public'`. El diálogo "Crear organización" suma un selector "Terminología" con tres opciones: **Sector público / Sector privado / Organizaciones sin fines de lucro**.
- **Después**: un endpoint nuevo, `PATCH /api/v1/orgs/:id/sector`, con `SuperadminOnlyGuard`, igual que activar y desactivar. En la web se agrega una tarjeta "Terminología" en la pestaña **General** de Configuración, con el mismo selector. Solo es editable si `isSuperadmin` (la página ya lo calcula). El resto de los miembros la ve en solo lectura ("Esta organización usa la terminología de: Sector privado").
- **Por qué solo el superadmin y no el org-admin**:
  - es una decisión de producto y comercial (qué vertical se le vende a esa org), del mismo tipo que habilitar módulos, que hoy también es solo del superadmin;
  - cambia el vocabulario de **todos** los usuarios de la org de un momento a otro, así que no es una preferencia de un admin;
  - deja la puerta abierta a precios o funciones por vertical sin rediseñar permisos.
- **Por qué un endpoint aparte y no un campo más en `PATCH orgs/:id`**: ese endpoint lo usa el org-admin central (C20b). Agregarle un campo que solo puede tocar el superadmin obligaría a chequear el rol dentro del service (autorización fuera del guard) y a explicar un 403 parcial. Con un endpoint propio, la autorización queda en el guard y el audit tiene una acción específica.
- **Cambio con datos cargados**: está permitido. Cambiar el sector no modifica ninguna fila de negocio. El selector avisa: "Solo cambian las etiquetas de la interfaz. Los nombres que cargaron los usuarios (unidades, plan, objetivos) no se modifican". La UI cambia en el próximo render (D3).

### D3 — Cómo llega a la web y cómo se resuelve el diccionario

**Transporte del sector**

- `MeDto.orgs[]` suma `sector: OrganizationSector`. `MeService` ya lee la fila de la org en los dos caminos (superadmin y miembro), así que no hay queries nuevas.
- `OrganizationSummaryDto` y `OrganizationDetailDto` suman `sector` (se usan en la lista de orgs del superadmin y en Configuración).
- **No** se agrega una cookie de sector: se desincronizaría cuando el superadmin lo cambia, y `/me` ya se pide en cada render del layout.

**Estructura de `lib/labels`** (C30)

```
apps/web/src/lib/labels/
├── index.ts              # barrel: re-exporta shared.ts (mismo path '@/lib/labels')
├── shared.ts             # todo lo que no depende del sector (nombres de export actuales)
├── sector-labels.ts      # tipo SectorLabels + getSectorLabels(sector)
├── sector/public.ts      # diccionario público (el texto actual)
├── sector/private.ts     # diccionario privado
├── sector/nonprofit.ts   # diccionario sin fines de lucro
├── server.ts             # getLabels(): server-only
└── labels-provider.tsx   # 'use client': LabelsProvider + useLabels()
```

- **Compartido** (`shared.ts`): conserva exactamente los nombres de export actuales para todo lo que no depende del sector:
  - `SEMAPHORE_LABELS`, `DEVIATION_LABELS`, `PENDING_LOAD_LABELS` y `EXPECTED_CURVE_MODE_LABELS`;
  - `LINK_MODE_*`, `CONTRIBUTION_*`, `AUTOMATIC_ENTRY_LABELS`, `LINKED_PROJECT_LINK_LABELS` y `FROM_PROJECTS_UNAVAILABLE_LABELS`;
  - `INVITE_SCOPE_LABELS` y `SCOPE_WHOLE_ORG_LABEL`;
  - `EXECUTIVE_GANTT_LABELS` completo, `NO_AXIS_LABEL` y `LABELS.axis`, porque "Eje" es igual en los tres sectores;
  - las claves compartidas de `LABELS`: objetivo, indicador, proyecto, tarea, período, unidad, avances, ponderación, etc.

  **Unos 30 de los 50 importadores no cambian**: el path `@/lib/labels` sigue resolviendo al barrel.
- **Por sector**: las claves que dependen del sector **se quitan** del export estático y pasan a `SectorLabels`: `LABELS.plan`, `ORG_UNIT_KIND_LABELS`, `PLANNING_TREE_LABELS.subtitle/noPlan/noPlanHint` y los hints de `INDICATOR_KIND_LABELS`. Quitarlas es a propósito: **el type-check se convierte en la lista de migración**, porque cada uso viejo deja de compilar. Así no puede quedar, por olvido, un uso que muestre el término público en una org de otro sector. Mantenerlas como alias del diccionario público sería una fuga silenciosa.
- **Tipo y completitud**: `SectorLabels` es una interfaz explícita (strings y funciones de formato, no literales). `sector/public.ts`, `sector/private.ts` y `sector/nonprofit.ts` hacen `satisfies SectorLabels`, así que si a alguno le falta una clave, no compila. `getSectorLabels` usa un `Record<OrganizationSector, SectorLabels>`, que tampoco compila si falta un sector.
- **Server components**: `getLabels()` (en `server.ts`, marcado `server-only`) hace tres cosas:
  1. lee la cookie `activeOrgId`;
  2. obtiene `/me` con una función envuelta en `React.cache`; el layout pasa a usar la misma función, así que `/me` se pide **una sola vez por request** aunque lo necesiten el layout y la página;
  3. devuelve `{ ...SHARED, ...getSectorLabels(sector) }`.

  Si no hay org activa o `/me` falla, devuelve `public`, que es el estado anterior a elegir una org y no muestra datos de negocio.
- **Client components**: `AppShell` (que ya es client y ya maneja `activeOrgId`) envuelve `children` en `<LabelsProvider sector={activeOrg?.sector ?? 'public'}>`, y `useLabels()` devuelve el diccionario combinado. Al cambiar de org en el selector, el sector cambia en el acto en el cliente, y el `router.refresh()` que ya existe vuelve a renderizar los server components con el sector nuevo.
- **Funciones puras que hoy leen etiquetas** (por ejemplo `planning-tree-view.ts`, que usa `L.noPlan`) pasan a recibirlas por parámetro, y siguen siendo testeables sin React.
- **Mensajes de error de las server actions**: `failure(info)` no cambia de firma (36 usos).
  - Los 6 códigos con vocabulario de sector se reescriben en `error-messages.ts` con un **texto neutro de respaldo**, por ejemplo "El eje elegido no pertenece al plan vigente" o "El fin de la vigencia tiene que ser posterior al inicio".
  - La versión de cada sector va en `SectorLabels.errors`, y `useActionRunner` (client) muestra `labels.errors[code] ?? result.error`.
  - Los pocos lugares que muestran `result.error` sin pasar por `useActionRunner` quedan con el texto neutro, que no tiene vocabulario de gobierno.
- **Íconos**: el ícono del estado vacío del plan pasa a ser uno neutro para los tres sectores (por ejemplo `Flag`, de lucide). No se modelan íconos por sector.

**Estrategia de migración de los usos (C30)**, en este orden y compilando en cada paso:

1. Crear la estructura con `public.ts` igual al texto actual, `private.ts` y `nonprofit.ts` completos y `shared.ts` con lo compartido. Agregar `sector` a los DTOs y a `/me`.
2. Agregar el provider en `AppShell` y `getLabels()` con `/me` cacheado.
3. Quitar las claves por sector del export estático y corregir cada error de compilación (unos 20 archivos):
   - server components: `await getLabels()`;
   - client components: `useLabels()`;
   - funciones puras: reciben las etiquetas por parámetro.
4. Mover al diccionario los 27 textos hardcodeados de la tabla del Contexto.
5. Activar el test de D7.

### D4 — Diccionarios por sector, término por término

**Igual en los tres sectores** (queda en `shared.ts`):

- **Planificación**: Eje / Ejes / Sin eje / Todos los ejes / Por ejes, Avance por eje y el resto de los textos con "eje", Objetivo estratégico.
- **Medición**: Indicador, Carga de indicador, Curva esperada, Indicador de contexto, Indicadores de gestión, semáforo, desvío.
- **Ejecución**: Proyecto, Tarea, Aporte de proyecto a indicador, ponderación, aportes.
- **Avances**: Avance de resultado, Avance de gestión.
- **Estructura y alcance**: Período, Unidad/Unidades, Estructura, Visión y Misión de la unidad, Miembro, Alcance, Toda la organización.
- **Vistas**: Árbol de planificación, Vista ejecutiva.

**Por sector** (`SectorLabels`):

| Clave | Público (actual) | Privado | Sin fines de lucro |
|---|---|---|---|
| `plan.singular` (N1, nav, título) | Plan de gobierno | Plan estratégico | Plan estratégico institucional |
| `plan.vision` | Visión general de gobierno | Visión estratégica | Visión institucional |
| `plan.term` (vigencia del plan) | Mandato | Vigencia | Vigencia |
| `plan.termStart` / `plan.termEnd` | Inicio del mandato / Fin del mandato | Inicio de la vigencia / Fin de la vigencia | Inicio de la vigencia / Fin de la vigencia |
| `plan.termRange(desde, hasta)` | Mandato: {desde} al {hasta} | Vigencia: {desde} al {hasta} | Vigencia: {desde} al {hasta} |
| `plan.formDescription` | Es la visión general de gobierno del mandato. Solo hay un plan vigente por organización. | Es la visión estratégica de la empresa para el horizonte del plan. Solo hay un plan vigente por organización. | Es la visión institucional de la organización para el horizonte del plan. Solo hay un plan vigente por organización. |
| `plan.titlePlaceholder` | Ej: Plan de gobierno 2026-2029 | Ej: Plan estratégico 2026-2028 | Ej: Plan estratégico institucional 2026-2028 |
| `plan.visionPlaceholder` | Hacia dónde va el gobierno durante este mandato... | Hacia dónde va la empresa en los próximos años... | Qué cambio busca la organización en su comunidad en los próximos años... |
| `plan.empty` (título / descripción / CTA) | Aún no hay plan de gobierno / Creá el plan con la visión general y el período del mandato... / Crear plan de gobierno | Aún no hay plan estratégico / Creá el plan con la visión estratégica y su vigencia... / Crear plan estratégico | Aún no hay plan estratégico institucional / Creá el plan con la visión institucional y su vigencia... / Crear plan estratégico institucional |
| `plan.noOrg` | Para ver el plan de gobierno, primero elegí una organización... | Para ver el plan estratégico, primero elegí una organización... | Para ver el plan estratégico institucional, primero elegí una organización... |
| `orgUnitKind.central` | Central | Dirección General | Dirección Ejecutiva |
| `orgUnitKind.ministry` | Ministerio / Secretaría | Dirección | Área |
| `orgUnitKind.area` | Área / Dirección | Área | Programa |
| `planningTree.subtitle` | Cómo avanza el plan de gobierno, por eje o por unidad. El resultado y la gestión se leen por separado. | Cómo avanza el plan estratégico, por eje o por unidad. (ídem) | Cómo avanza el plan estratégico institucional, por eje o por unidad. (ídem) |
| `planningTree.noPlan` / `noPlanHint` | Sin plan de gobierno activo / ...Creá el plan en Plan de gobierno para agruparlos por eje. | Sin plan estratégico activo / ...Creá el plan en Plan estratégico para agruparlos por eje. | Sin plan estratégico institucional activo / ...Creá el plan en Plan estratégico institucional para agruparlos por eje. |
| `plan.axisCreateHint` (axis-select) | Podés crearlos en Plan de gobierno. | Podés crearlos en Plan estratégico. | Podés crearlos en Plan estratégico institucional. |
| `indicatorKind.output.hint` | lo que se entrega (km, obras, cantidad) | lo que se entrega (unidades producidas, entregas, cantidad) | lo que se entrega (personas alcanzadas, talleres dictados, cantidad) |
| `indicatorKind.outcome.hint` | el cambio que se busca (alfabetización, calidad) | el cambio que se busca (satisfacción, calidad, participación) | el cambio que se busca (inserción laboral, donantes recurrentes, calidad de vida) |
| `placeholders.orgName` / `orgSlug` | Ej: Ministerio de Salud / ej-ministerio-salud | Ej: Lumbre Electrodomésticos / ej-lumbre | Ej: Fundación Puentes / ej-fundacion-puentes |
| `placeholders.unitName` | Ej: Secretaría de Obras Públicas | Ej: Dirección Industrial | Ej: Programa de Empleo Joven |
| `placeholders.metricSource` | Ej: Registro de obras de la Secretaría | Ej: Sistema de gestión de planta | Ej: Registro de beneficiarios del programa |
| `placeholders.objectiveTitle` | Ej: Mejorar atención ciudadana | Ej: Reducir los reclamos en garantía | Ej: Ampliar el alcance de los talleres en la comunidad |
| `placeholders.orgMission` | ...ciudadanos... servicios públicos... | Ej: Fabricar electrodomésticos confiables y eficientes para los hogares de la región... | Ej: Acompañar a jóvenes de la comunidad en su inserción laboral... |
| `placeholders.orgVision` | ...servicios públicos digitales... | Ej: Ser la marca de electrodomésticos preferida del país... | Ej: Una comunidad donde cada joven accede a un trabajo digno... |
| `placeholders.orgValues` | ...respeto por el ciudadano... | Ej: Calidad, seguridad, eficiencia, respeto por el cliente... | Ej: Compromiso, transparencia, solidaridad, respeto por la comunidad... |
| `errors.OrgUnitInvalidParentKind` | ...Una unidad central o un ministerio admiten ministerios y áreas; un área solo admite áreas. | ...La Dirección General o una dirección admiten direcciones y áreas; un área solo admite áreas. | ...La Dirección Ejecutiva o un área admiten áreas y programas; un programa solo admite programas. |
| `errors.OrgUnitKindInvalid` | ...a un ministerio/secretaría o a un área/dirección, no a la unidad central. | ...a una dirección o a un área, no a la Dirección General. | ...a un área o a un programa, no a la Dirección Ejecutiva. |
| `errors.AxisNotInActivePlan` / `StrategicPlanRequired` / `StrategicPlanNotFound` | ...plan de gobierno... | ...plan estratégico... | ...plan estratégico institucional... |
| `errors.MandateRangeInvalid` | El fin del mandato tiene que ser posterior al inicio. | El fin de la vigencia tiene que ser posterior al inicio. | El fin de la vigencia tiene que ser posterior al inicio. |

Notas:

- **"Eje" es compartido**: es un término corriente en planes estratégicos de empresas y de ONGs, así que los textos con "eje" no se duplican por sector.
- **Tipos de unidad**:
  - **Privado**: en el público, "Dirección" aparece como sinónimo de área; en el privado, "Dirección" es el tipo `ministry`. No hay conflicto, porque cada org ve un solo diccionario.
  - **Sin fines de lucro**: la **Dirección Ejecutiva** es la unidad que conduce la operación y es dueña del plan. La Comisión Directiva o el Consejo de Administración es un órgano de gobierno institucional y no ejecuta objetivos, por eso no se usa para `central`. Debajo van las **Áreas** (programas sociales, desarrollo de fondos, administración) y, dentro de ellas, los **Programas**: unidades estables con equipo, visión y misión propias (por ejemplo "Programa de Empleo Joven"), distintas de los *proyectos* (N5), que tienen inicio y fin. Esta elección queda como la única pregunta abierta.
- **"Avance de gestión" e "Indicadores de gestión" son iguales en los tres sectores**: "gestión" es vocabulario corriente en empresas y en ONGs.
- **"Plan estratégico institucional"**: es largo en la navegación lateral (`w-64`). Si no entra en una línea, C30 puede usar un `plan.navLabel` más corto ("Plan institucional") sin cambiar el título de la página.
- El texto exacto de cada frase larga lo fija C30 siguiendo esta tabla. Este ADR fija los términos.

**Términos núcleo compartidos con la API**: `plan.singular`, `plan.vision`, `plan.term` y `orgUnitKind.*` se definen una sola vez en `packages/shared-types/src/core/sector-terms.ts` (`SECTOR_TERMS: Record<OrganizationSector, SectorTerms>`, datos puros, sin React), y los diccionarios de la web los reutilizan. Así, el conector MCP usa exactamente las mismas palabras que la UI.

### D5 — Lado API: copiloto, catálogo y MCP

**Copiloto (`modules/ai`)**: **no se toca** en la Fase 12. Sus prompts no tienen vocabulario de gobierno. Lo pendiente del copiloto (todavía dice "OKR", asume trimestres y no conoce el modelo de 5 niveles) sigue en `TODO.md`. Rige una regla desde ahora: los prompts no pueden tener vocabulario de un sector, y el test de D7 lo controla.

**Catálogo**: se **neutraliza**, no se parametriza, porque el catálogo es global y no conoce orgs. Se hace en la migración de C30, con el mismo criterio que `20261009000002_catalog_texts_without_kr`: un UPDATE idempotente sobre `core.module` y `auth.permission`, nunca sobre `audit.event`.

- `core.module` `okr`: el `name` pasa de "OKR" a "Planificación". Hoy ese nombre se ve en el dashboard y en el panel de Módulos.
- `auth.permission`: se saca "(planificación de gobierno)" de las descripciones de `core:org-unit:manage`, `core:org-unit:vision:write` y `planning:plan:manage`.

**Conector MCP (enmienda a ADR-0010 D5)**:

- **Las descripciones de herramientas y las `instructions` son neutras.** Para los términos que dependen del sector se usan formas genéricas: "el plan de la organización" o "las unidades de la estructura". Los términos compartidos (Objetivo estratégico, Eje, Indicador, Proyecto, Tarea, Período, Avance de resultado, Avance de gestión) se mantienen como dice ADR-0010.
- **Los datos traen la terminología de la org**: `listar_organizaciones` y `ver_arbol_planificacion` devuelven `terminologia: { sector, plan, visionPlan, vigencia, tiposUnidad: { central, ministry, area } }`, tomado de `SECTOR_TERMS`. En cada unidad, `tipo` conserva el código y se agrega `tipoEtiqueta`.
- `instructions` suma una regla: "Al responder, usá los términos de `terminologia` de la organización".
- El test de `tool-registry` de ADR-0010 ("descripción sin KR/OKR") se extiende con la lista de términos de sector de D7.

**Mensajes de error de la API**: no cambian. Los de `planning` son códigos con texto técnico en inglés, y la web los traduce por código (D3).

### D6 — Superficies sin cambio

- No cambian las reglas de dominio, los cálculos (`okr-domain`, `deviation-domain`, `metrics-domain`), los permisos, los módulos ni el tenant scoping.
- Los identificadores técnicos (`StrategicPlan`, `Axis`, `OrgUnit.kind = 'ministry'`, `mandateStartsAt`) no se renombran (ADR-0009 D1). El glosario UI ↔ código de `CLAUDE.md` suma una columna por sector; lo actualiza C30.

### D7 — Guard contra textos hardcodeados

Se agrega un test de Vitest en `apps/web` (`src/lib/labels/sector-terms.guard.test.ts`) y otro equivalente en `apps/api`. El test controla tres cosas:

1. **Escaneo del código fuente**:
   - recorre `apps/web/src/**/*.{ts,tsx}`, excluyendo `*.test.*`, `lib/labels/sector/public.ts` y `components/ui/**`;
   - quita los comentarios (`//...`, `/* ... */`) con una regex simple;
   - falla si encuentra, sin distinguir mayúsculas, alguno de estos términos: `gobierno`, `mandato`, `ministeri`, `secretar[ií]a`, `municip`, `ciudadan`, `vecin(o|al)`, `intendent`, `concejo`, `servicios? p[uú]blicos?`.

   El mensaje del fallo indica archivo, línea y término, y pide "movelo al diccionario de sector (`lib/labels/sector/*`)". En `apps/api`, el mismo escaneo cubre `src/modules/ai/prompts/**`, `src/modules/mcp/**` (cuando exista) y `src/database/seed-demo-lumbre.ts`, sin excepciones de archivo.
2. **Diccionarios no públicos limpios**: recorre en profundidad `getSectorLabels('private')` y `getSectorLabels('nonprofit')`, invoca las funciones con argumentos de ejemplo y verifica que ningún texto tenga esos términos. Hace lo mismo con `SECTOR_TERMS.private` y `SECTOR_TERMS.nonprofit`.
3. **Completitud**: la garantiza el tipo (`satisfies SectorLabels` en los tres diccionarios). Un test mínimo verifica además, en runtime, que los tres diccionarios tengan el mismo conjunto de claves, para cubrir claves opcionales que el tipo no fuerza.

La lista de términos vive en una constante compartida por los tests (`FORBIDDEN_PUBLIC_SECTOR_TERMS`). Si algún día un sector tiene términos que no pueden aparecer en otro, se generaliza a "términos exclusivos de cada sector".

Se prefiere un test a una regla de ESLint (`no-restricted-syntax` sobre `Literal`, `JSXText` y `TemplateElement`) por tres motivos: un mismo test cubre la web y la API, corre en `pnpm test` (obligatorio antes de cerrar una tarea) y no requiere tocar la configuración compartida de ESLint. Ver A4.

### D8 — Seed

- **San Carrillo** (`seed-org-demo`): lleva `sector: 'public'` explícito en el `create` y en el `update` del upsert, para que el seed sea determinista aunque alguien lo cambie a mano.
- **Lumbre Electrodomésticos S.A.** (C31): es una org nueva (`id: 'seed-org-lumbre'`, `slug: 'lumbre'`) con `sector: 'private'` y el contenido que describe `plan.md` C31:
  - estructura: Dirección General → direcciones → áreas;
  - plan estratégico 2026–2028, con su vigencia en `mandateStartsAt/EndsAt`;
  - **5 ejes** en `Axis`;
  - 7 objetivos con indicadores, y proyectos con tareas.
- **Organización del seed**: `seed-demo.ts` pasa a orquestar dos archivos, `seed-demo-san-carrillo.ts` (el contenido actual, sin cambios) y `seed-demo-lumbre.ts`. El escaneo de D7 incluye `seed-demo-lumbre.ts`, así que el contenido de la org privada tampoco puede tener vocabulario de gobierno.
- **Sin seed de ONG por ahora** (queda en Diferido).
- **Usuarios**: mismo criterio que San Carrillo. El superadmin ve las dos orgs gracias al bypass de `/me`.

---

## Modelo de datos

> Shape ilustrativo, no es una migración ejecutable.

```prisma
model Organization {
  // ... columnas actuales sin cambios ...
  /// 'public' | 'private' | 'nonprofit'. Elige el diccionario de terminología de la UI (ADR-0011). CHECK en la migración.
  sector              String    @default("public") @db.VarChar(10)
  // ...
  @@schema("core")
}
```

- Schema `core`: `NOT NULL DEFAULT 'public'` y `CHECK (sector IN ('public','private','nonprofit'))`.
- Sin índice: ninguna consulta de negocio filtra por sector; solo se lee junto con la org.
- Este cambio no involucra pesos ni porcentajes. Nada de `Float`.
- `organizationId`: el campo **es** de la organización; no hay entidades de negocio nuevas.

**Datos de catálogo** (en la misma migración, con UPDATE idempotente): el `core.module.name` de `okr` y tres descripciones de `auth.permission` (D5).

---

## Contrato (API)

| Método + path | Propósito | Request / Response (`shared-types/core`) | Códigos | Guards |
|---|---|---|---|---|
| `GET /api/v1/me` (existente) | Suma el sector de cada org | `MeDto.orgs[].sector: OrganizationSector` | 200, 401 | `AuthGuard` (sin cambio; cross-org por diseño, ADR-0002 D6) |
| `GET /api/v1/orgs` (existente) | Lista de orgs del superadmin, con su sector | `OrganizationSummaryDto.sector` | 200, 401, 403 | `SuperadminOnlyGuard` |
| `GET /api/v1/orgs/:id` (existente) | Detalle de la org, con su sector | `OrganizationDetailDto.sector` | 200, 401, 403, 404 | `TenantGuard` + `OrgIdParamGuard` |
| `POST /api/v1/orgs` (existente) | Alta con sector opcional | `CreateOrganizationDto.sector?: OrganizationSector` (default `'public'`), validado con `@IsIn(['public','private','nonprofit'])` | 201, 400, 401, 403, 409 | `SuperadminOnlyGuard` |
| `PATCH /api/v1/orgs/:id/sector` (**nuevo**) | Cambiar la terminología de la org | Request: `UpdateOrganizationSectorDto { sector: OrganizationSector }` (`@IsIn` con los tres valores). Response: `OrganizationDetailDto` | 200, 400 (valor inválido), 401, 403 (`SuperadminRequired`), 404 | `SuperadminOnlyGuard`, que lee `request.authContext` primero y usa el ALS solo como fallback, según `CLAUDE.md` |
| `PATCH /api/v1/orgs/:id` (existente) | **Sin cambios**: `UpdateOrganizationDto` **no** acepta `sector`, y `whitelist: true` lo descarta | — | — | Igual que hoy |

Si el valor nuevo es igual al actual, `PATCH .../sector` responde 200 sin escribir ni auditar (es idempotente).

---

## Boundaries de módulo

- **Dueño**: `core` (`OrganizationService`, `OrganizationController`, `MeService`). No hay módulo nuevo.
- **Superficie pública**: `core/index.ts` no cambia. El tipo `OrganizationSector` y `SECTOR_TERMS` se exportan desde `@gestion-publica/shared-types/core`, un subpath que ya existe.
- **Consumidores**: `mcp` (C26) obtiene el sector de lo que ya consume según ADR-0010 (`MeService` exportado y el resultado de `TenantMembershipResolver` o el detalle de la org) y toma los términos de `shared-types`. **No** consulta `core.organization` por su cuenta.
- **Prohibido**:
  - importar `../core/services/organization.service` u otros internos de `core` desde `mcp` o `ai`;
  - duplicar en la API los términos de sector fuera de `shared-types`;
  - que `shared-types` importe algo de React o de la web.
- **Web**: los componentes de presentación reciben las etiquetas del hook o del helper. No deciden el sector por su cuenta: no leen cookies ni `/me`.

---

## Matemática de avance

**No aplica.** El sector no participa en ningún cálculo. No cambian las cascadas de `okr-domain`, los desvíos y semáforos de `deviation-domain`, las curvas de `metrics-domain` ni los agregados por unidad y por eje, y no se agregan funciones a `packages/okr-domain`. La única lógica nueva es de presentación (elegir el diccionario) y vive en la web.

---

## Auth0 → RBAC local

- **Claims consumidos**: los de siempre (`sub`, `email`). El sector **no** viaja en el token ni en claims de Auth0: se resuelve en cada request desde la DB, vía `/me`. Por eso un cambio de sector rige en el próximo render, sin volver a iniciar sesión.
- **Permisos**:
  - leer el sector: cualquier usuario autenticado, para sus propias orgs (`/me`), y cualquier miembro de la org (`GET orgs/:id`);
  - cambiarlo: solo el superadmin (`SuperadminOnlyGuard`). **No** se agrega un permiso RBAC nuevo (por ejemplo `core:org:sector:write`), porque ningún rol de org debería tenerlo y sería un permiso vacío. Es el mismo criterio que la habilitación de módulos.
- **Default deny**: el endpoint nuevo tiene un guard explícito, y como `UpdateOrganizationDto` no acepta `sector`, el org-admin no puede cambiarlo por el endpoint existente.

---

## Tenant scoping

- `sector` es un atributo de `core.organization`, no una entidad de negocio con `organizationId`. Se lee en dos lugares:
  - en `/me`, con `prismaService.raw` como hoy (cross-org por diseño: solo las orgs del usuario, o todas si es superadmin);
  - en `GET orgs/:id`, bajo `TenantGuard` + `OrgIdParamGuard` (el `:id` tiene que coincidir con la org del header).
- `PATCH orgs/:id/sector` es solo para el superadmin, igual que `activate` y `deactivate`, que tampoco pasan por `TenantGuard`. Escribe solo la fila `:id`.
- En la web, el sector sale **de la org activa** (`effectiveOrgId` en el layout, `activeOrgId` en `AppShell`). Nunca se mezclan diccionarios de dos orgs en una misma pantalla.
- En MCP, el sector sale de la org que se resuelve en cada llamada (ADR-0010 D4), nunca de un parámetro libre.
- Ninguna consulta de negocio cambia ni pierde su filtro por `organizationId`.

---

## Eventos de auditoría

Todos son **INSERTs** en `audit.event`. No hay `UPDATE` ni `DELETE` sobre esa tabla, ni backfill.

| Mutación | Acción | Payload (`diff`) | Notas |
|---|---|---|---|
| Alta de org (`POST /orgs`) | `organization.created` (existente) | `after` suma `sector` | La acción no cambia. |
| Cambio de sector (`PATCH /orgs/:id/sector`) | `organization.sector_changed` (**nueva**) | `{ before: { sector }, after: { sector } }` | `entityType: 'core.organization'`, `entityId: id`, actor = superadmin. No se emite si el valor no cambia. Volver al valor anterior genera otro evento; no edita el primero. |
| `PATCH /orgs/:id` | `organization.updated` (existente) | Sin cambios (no incluye `sector`) | — |
| Migración de catálogo (D5) | — | — | Son datos de catálogo sembrados por migración, igual que en `20261009000002`. No son mutaciones de usuario y no van a `audit.event`. |
| Seed | Igual que hoy | — | El seed mantiene su criterio de audit. |

---

## Alternativas consideradas

### A1 — Editor de etiquetas por organización (tabla `core.organization_label`)
Cada org sobrescribe las etiquetas que quiera.
**Descartada por ahora** (decisión de Pedro). Necesita UI de edición, validar la concordancia de género y número en las frases largas, un fallback por clave y tests de completitud por org. Para el objetivo comercial alcanza con tres diccionarios fijos. Queda en el backlog ("etiquetas configurables por org"). El diseño de D3 (diccionario tipado y resuelto según la org activa) se puede extender con overrides sin cambiar a los consumidores.

### A2 — Neutralizar todo (un solo diccionario sin vocabulario de ningún sector)
Por ejemplo "Plan", "Unidad nivel 1/2/3".
**Descartada**: el producto pierde lo que ADR-0009 buscó para cada sector (que un municipio, una empresa o una fundación reconozcan su propio lenguaje), y los términos genéricos suenan a software, no a planificación. Además, Pedro decidió explícitamente que la terminología sea por sector.

### A3 — Un build o un deploy de la web por vertical
**Descartada**: multiplica deploys, dominios y pipelines, y no permite mostrar varias orgs con el mismo login y el mismo selector, que es justamente el demo de C31.

### A4 — Regla de ESLint en lugar del test de Vitest
Usar `no-restricted-syntax` con selectores sobre `Literal`, `JSXText` y `TemplateElement`.
**Descartada como mecanismo principal**. Tiene ventajas: ignora los comentarios sin trabajo extra y avisa en el editor. Pero no cubre la API con la misma configuración, es más difícil escribir y mantener la regex en selectores de AST, y tocar `config-eslint` afecta a todo el monorepo. Se puede sumar más adelante como ayuda en el editor; el test sigue siendo la fuente de verdad.

### A5 — Guardar el sector en una cookie (`activeOrgSector`) además de `activeOrgId`
**Descartada**: serían dos cookies que se desincronizan cuando el superadmin cambia el sector, y un server component no puede escribir cookies para corregirlo. Además, `/me` ya se pide en cada request.

### A6 — Mantener `LABELS.plan` y `ORG_UNIT_KIND_LABELS` como alias del diccionario público
Evitaría tocar unos 20 archivos.
**Descartada**: cada uso olvidado mostraría "Plan de gobierno" en una empresa o en una fundación sin que nada falle. Quitar las claves convierte al type-check en el control de la migración.

### A7 — `enum` de Prisma `OrganizationSector`
**Descartada**: ver D1 (convención del repo y costo de `ALTER TYPE`). La unión TS da la misma seguridad de tipos en la API y en la web.

### A8 — Dos sectores ahora y el tercero más adelante
**Descartada por decisión de Pedro** (2026-10-11): el sector sin fines de lucro se suma ya. El costo marginal es un diccionario más y un valor más en el CHECK, y evita una segunda migración y otra pasada de tests.

---

## Impacto

### Migraciones (shape, no SQL)

1. `core.organization`: `ADD COLUMN sector VARCHAR(10) NOT NULL DEFAULT 'public'` con el CHECK de los tres valores. Sin `UPDATE`.
2. Catálogo, con UPDATE idempotente: en `core.module`, `okr` pasa a `name = 'Planificación'`; las tres descripciones de `auth.permission` quedan sin "(planificación de gobierno)".

### API (C30, backend-dev)

- **`shared-types/core`**:
  - el tipo `OrganizationSector` (tres valores) y `SECTOR_TERMS` (tres entradas);
  - `sector` en `MeDto.orgs[]`, `OrganizationSummaryDto`, `OrganizationDetailDto` y `CreateOrganizationDto`;
  - el DTO nuevo `UpdateOrganizationSectorDto`.
- **`core`**:
  - `MeService` incluye `sector`;
  - `OrganizationService.create` acepta `sector`, y `updateSector` es nuevo y emite su audit;
  - el endpoint `PATCH orgs/:id/sector`;
  - los DTOs con `class-validator` (`@IsIn` con los tres valores).
- **Seed**: `sector: 'public'` explícito en San Carrillo y la división en archivos (D8). Lumbre se agrega en C31.

### Web (C30, frontend-dev)

- `lib/labels/` según D3, con los tres diccionarios, el provider en `AppShell` y `getLabels()` con `/me` cacheado (el layout lo reutiliza).
- Migrar los ~20 usos por sector y los 27 textos hardcodeados, y reescribir el falso positivo de "vecinos".
- `useActionRunner` muestra `labels.errors[code] ?? result.error`, y `error-messages.ts` tiene textos neutros de respaldo.
- Selector de tres opciones en "Crear organización" y tarjeta "Terminología" en Configuración → General, editable solo por el superadmin y con el aviso de D2.
- Badge de sector en la lista de orgs del superadmin.
- Ícono neutro en el estado vacío del plan.

### Tests

- **Unit (Vitest, web)**:
  - el guard de D7: escaneo, diccionarios privado y sin fines de lucro, paridad de claves entre los tres;
  - `getSectorLabels` para los tres valores;
  - las funciones puras de `planning-tree-view` con etiquetas privadas y sin fines de lucro ("Sin plan estratégico activo", "Sin plan estratégico institucional activo");
  - la elección del mensaje por sector a partir de `code` en `useActionRunner`, testeada como función pura.
- **Unit (Vitest, API)**:
  - el escaneo de los prompts, de `mcp/**` y de `seed-demo-lumbre.ts`;
  - `SECTOR_TERMS.private` y `SECTOR_TERMS.nonprofit` sin términos prohibidos;
  - `SECTOR_TERMS` con una entrada por cada valor de `OrganizationSector`.
- **Integración (`apps/api/test`, DB real)**:
  - `PATCH orgs/:id/sector`:
    - el superadmin pasa a `private` y a `nonprofit` y recibe 200, con el evento `organization.sector_changed` con before/after;
    - el org-admin central recibe 403;
    - un valor inválido (p. ej. `'ngo'`) da 400;
    - repetir el mismo valor no genera evento;
  - `PATCH orgs/:id` con `sector` en el body no lo cambia;
  - `POST /orgs`:
    - sin `sector` queda en `public`;
    - con `private` y con `nonprofit` queda con ese valor, y `organization.created.after.sector` lo refleja;
  - `/me` devuelve `sector` por org, tanto en el camino de miembro como en el de superadmin;
  - la migración deja todas las orgs existentes en `public`, y el CHECK rechaza un cuarto valor.
- **E2E**: no hay Playwright en el repo, y su configuración queda para una corrida aparte. La verificación de pantallas es manual en C31: Pedro recorre las orgs con el selector.

### Otros documentos (los actualiza C30, no este ADR)

- `CLAUDE.md`: el glosario UI ↔ código con una columna por sector.
- ADR-0010: la nota "Amended by: 0011" en el encabezado.
- `plan.md` C31: "5 pilares" pasa a "5 ejes".

---

## Consecuencias

### Positivas

- El demo privado no muestra vocabulario de gobierno, y el test lo sostiene en el tiempo.
- El producto queda listo para ONGs sin otra migración.
- No cambian el dominio, los permisos ni los datos: el riesgo se concentra en la capa de presentación.
- El type-check guía la migración y garantiza que los tres diccionarios estén completos.
- Hay una sola fuente de términos núcleo para la UI y el conector MCP.
- Cumple ADR-0006 D2.2: la nomenclatura que varía según el tipo de organización queda configurable en `core.organization`.

### Negativas / trade-offs aceptados

- Unos 20 archivos de la web cambian de import (de constante estática a `getLabels()` o `useLabels()`), y las funciones puras que usan etiquetas suman un parámetro.
- Las frases largas por sector se escriben tres veces. Con un cuarto sector conviene reevaluar A1.
- Los mensajes de error que no pasan por `useActionRunner` muestran el texto neutro, no el del sector.
- El test de escaneo es por regex: puede dar falsos positivos (se resuelven reescribiendo el texto) y no detecta un término de gobierno armado por concatenación. Es un control razonable, no una garantía formal.
- Los datos cargados por usuarios no se traducen: una org que cambia de sector conserva nombres como "Secretaría de...". El selector lo avisa.
- `getLabels()` depende de `/me`: si `/me` falla, la página cae al diccionario público. Es el mismo estado degradado que hoy, porque el layout ya contempla que `/me` se caiga.
- El diccionario sin fines de lucro no tiene una org de demo que lo ejercite; solo lo cubren los tests de D7 y la paridad de claves.

### Diferido

- Editor de etiquetas por org (A1, backlog).
- Seed de una org sin fines de lucro.
- Sector en el copiloto (junto con el ítem que ya existe en `TODO.md`).
- Playwright y un e2e "la org privada no muestra 'gobierno'".

---

## Conflictos con reglas congeladas

**Ninguno detectado.**

- **Boundaries**: el campo y el endpoint quedan en `core`, y los términos compartidos en `shared-types`. `mcp` no toca internos de `core`.
- **Multi-tenant**: el sector se lee y se escribe sobre la fila de la org, con los guards existentes (`/me`, `TenantGuard` + `OrgIdParamGuard`, `SuperadminOnlyGuard`). Ninguna consulta de negocio cambia.
- **Audit append-only**: hay una acción nueva (`organization.sector_changed`) y un campo más en `organization.created`, siempre con INSERTs. Las migraciones no tocan `audit.event`.
- **Decimales**: no hay pesos ni porcentajes en juego.
- **Dominio**:
  - no cambian los períodos, las dos lecturas, la ponderación, los vínculos ni la jerarquía de `OrgUnit`;
  - un objetivo sigue perteneciendo a exactamente un período;
  - no hay carga directa de `%`.
- **Default deny**: el endpoint nuevo tiene un guard explícito, y el existente descarta el campo.

---

## Preguntas respondidas (Pedro, 2026-10-11)

1. **¿Pilares o Ejes en el privado?** Se mantiene **Eje / Ejes / Sin eje** en todos los sectores. "Eje" es compartido, los textos hardcodeados con "eje" no se mueven por sector y el seed de Lumbre usa "5 ejes".
2. **Tipos de unidad del privado**: **Dirección General / Dirección / Área**. Se descarta "Gerencia".
3. **¿Quién cambia el sector?** **Solo el superadmin**, al crear la org y desde Configuración → General, con un endpoint propio. El org-admin lo ve en solo lectura.
4. **Catálogo**: en la migración de C30, el módulo "OKR" se renombra a **"Planificación"** y se limpian las descripciones de los permisos que dicen "planificación de gobierno".
5. **¿Se puede cambiar el sector con datos cargados?** **Sí.** Solo cambian las etiquetas, y el selector avisa que los nombres cargados por los usuarios no se modifican.
6. **Copiloto**: **no se toca**.
7. **Tercer sector**: **sí, ahora**. Se suma `'nonprofit'` (fundaciones, asociaciones civiles, cooperativas) con su propio diccionario (D1, D2, D3, D4, D7). No tiene seed por ahora.
8. **Preguntas técnicas** (se acepta la recomendación del ADR):
   - `VarChar(10)` + CHECK en lugar de un `enum` de Prisma;
   - los términos núcleo en `shared-types/core/sector-terms.ts`;
   - Vitest en lugar de Playwright (Playwright queda para una corrida aparte);
   - los errores por sector se resuelven por `code` en `useActionRunner`.

## Pregunta abierta

1. **Tipos de unidad para organizaciones sin fines de lucro**: ¿"Dirección Ejecutiva / Área / Programa"?
   - **A favor de "Programa"**: es la palabra que usan las ONGs para sus líneas de trabajo estables, con equipo y misión propias.
   - **El riesgo**: que se confunda con *Proyecto* (N5), que tiene inicio y fin. Además, como un `area` solo admite `area`, quedarían "programas dentro de programas" para los subniveles.
   - **La alternativa**: "Dirección Ejecutiva / Área / Coordinación", sin ambigüedad con los proyectos, pero menos propia del sector.

   *Recomendación*: **Dirección Ejecutiva / Área / Programa**. La distinción con Proyecto la aclara la propia UI, porque los programas aparecen en Estructura y los proyectos dentro de cada objetivo. Si en las primeras demos con ONGs aparece la confusión, se cambia una línea del diccionario y no hay que migrar nada.

---

## Referencias cruzadas

- [ADR 0002](./0002-core-module-foundation.md): `core.organization` y `/me` cross-org (D6).
- [ADR 0005](./0005-ai-copilot-module.md): los prompts del copiloto (sin cambios en este ADR).
- [ADR 0006](./0006-domain-agnostic-platform.md): D2.2, nomenclatura configurable por organización.
- [ADR 0009](./0009-planificacion-gobierno-5-niveles.md): D1 (los nombres técnicos no se renombran) y el glosario de UI, que con este ADR pasa a ser por sector.
- [ADR 0010](./0010-conector-mcp.md): D5, descripciones de herramientas; este ADR las vuelve neutras y agrega `terminologia` en los datos.
- `plan.md`, Fase 12 (C29–C31).
- `apps/web/src/lib/labels.ts`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/planning/error-messages.ts`, `apps/web/src/features/planning/useActionRunner.ts`.
