# 0011 — Terminología por sector de la organización

**Status**: Proposed
**Supersedes**: none. **Superseded by**: none.
**Amends**: 0009 (glosario de UI: deja de ser único y pasa a depender del sector de la org), 0010 (D5: regla de las descripciones de herramientas).
**Date**: 2026-10-11
**Author**: architect subagent
**Spec**: N/A — iniciado por pedido de Pedro (Fase 12 de `plan.md`, corrida C29). Contexto: [ADR-0006](./0006-domain-agnostic-platform.md) D2, [ADR-0009](./0009-planificacion-gobierno-5-niveles.md) D1 y glosario, [ADR-0010](./0010-conector-mcp.md) D5.

---

## Contexto y problema

Pedro quiere mostrarle el producto a empresas con un seed de una fábrica de electrodomésticos ("Lumbre Electrodomésticos S.A.", planta en Rosario, C31) **sin que aparezca vocabulario de gobierno**. Hoy la UI habla de "Plan de gobierno", "mandato", "Ministerio / Secretaría" y "ciudadanos", porque ADR-0009 adoptó el glosario de planificación de gobierno como único glosario de UI.

ADR-0006 D2.2 ya pedía que la nomenclatura que varía por tipo de organización sea configurable en `core.organization`, y ADR-0009 dejó las etiquetas centralizadas "para poder configurarlas por org más adelante". Este ADR ejecuta esa previsión.

**Decisión ya tomada por Pedro (plan.md, Fase 12, opción C)**: terminología por organización, con **dos diccionarios fijos** (sector público, el actual, y sector privado), elegidos por un campo de la organización. **Sin editor de etiquetas** por ahora.

### Hechos verificados en el código (2026-10-11)

| Tema | Estado actual | Consecuencia |
|---|---|---|
| Diccionario | `apps/web/src/lib/labels.ts`: un `LABELS` `as const` más 20 constantes temáticas (`ORG_UNIT_KIND_LABELS`, `PLANNING_TREE_LABELS`, `EXECUTIVE_GANTT_LABELS`, `CONTRIBUTION_*`, `SEMAPHORE_LABELS`...). Todo estático, sin noción de org. | Hay que separar lo que depende del sector de lo que no. |
| Importadores | **50 archivos** importan `@/lib/labels`. Solo **~25** usan claves que dependen del sector (`LABELS.plan`, `LABELS.axis`, `ORG_UNIT_KIND_LABELS`, `NO_AXIS_LABEL`, `PLANNING_TREE_LABELS`, `EXECUTIVE_GANTT_LABELS.noAxis/emptyDescription`, `INDICATOR_KIND_LABELS`). | La migración puede limitarse a esos ~25; el resto no se toca. |
| Textos de gobierno **dentro** del diccionario | `plan` ("Plan de gobierno", "Visión general de gobierno"), `ORG_UNIT_KIND_LABELS.ministry` ("Ministerio / Secretaría"), `PLANNING_TREE_LABELS.subtitle/noPlan/noPlanHint`, hints de `INDICATOR_KIND_LABELS` ("km, obras", "alfabetización"). | Pasan al diccionario público; el privado tiene los suyos. |
| Textos de gobierno **fuera** del diccionario | **27 líneas en 11 archivos** (ver tabla abajo), más el ícono `Landmark` (edificio de gobierno) en el estado vacío del plan. Además, **9 líneas en 4 archivos** con "eje" hardcodeado que solo importan si el privado no usa "Eje". | Todas pasan al diccionario en C30. |
| Org activa en la web | Cookie `activeOrgId` (`lib/active-org.ts`, `set-active-org-action.ts`). El layout `(app)/layout.tsx` llama a `GET /api/v1/me` y calcula `effectiveOrgId`; `AppShell` (client) recibe `me.orgs[]` (con `enabledModules`) y mantiene `activeOrgId` en estado. Al cambiar de org: `setActiveOrgAction` + `router.refresh()`. | `me.orgs[]` es el canal natural para el sector: llega al server (layout) y al client (AppShell) sin requests nuevos. |
| Mensajes de error | `features/planning/error-messages.ts` arma el texto **en las server actions** (`failure(info)`, 36 usos en 12 archivos). 6 códigos tienen vocabulario de gobierno (`OrgUnitInvalidParentKind`, `OrgUnitKindInvalid`, `AxisNotInActivePlan`, `StrategicPlanRequired`, `StrategicPlanNotFound`, `MandateRangeInvalid`). El `ActionFailure` ya trae `code`; los hooks de mutación pasan por `useActionRunner` (client, 7 hooks). | El texto por sector se puede resolver en el cliente a partir de `code`, sin tocar las 36 llamadas. |
| `Organization` (Prisma) | `core.organization`: `status` es `VarChar(10)` + CHECK, igual que `OrgUnit.kind`, `Project.progressMode`, etc. **No hay ningún `enum` de Prisma en el schema.** | La convención del repo es `VarChar` + CHECK + unión TS en `shared-types`. |
| `PATCH /api/v1/orgs/:id` | `TenantGuard` + `OrgIdParamGuard` + `@Permissions('core:org-unit:manage')` + `assertCentralScope` (C20b). Lo usa el org-admin central para nombre, misión, visión, valores y contexto. Emite `organization.updated`. Crear, activar y desactivar orgs: `SuperadminOnlyGuard`. | El sector no debería entrar por este endpoint (lo puede usar el org-admin). |
| Copiloto (`modules/ai`) | `objective-prompts.ts` no tiene vocabulario de gobierno: es neutro con sesgo empresarial (ventas, clientes, sucursales) y todavía dice "OKR" y asume trimestres (deuda ya registrada en `TODO.md`: "Adaptar copiloto de IA al modelo de planificación"). Los mensajes de cuota dicen "organización". | No hace falta tocarlo para el demo privado. |
| Catálogo | Descripciones de módulos neutras desde `20261009000002_catalog_texts_without_kr`. **Pero** el módulo `okr` se sigue llamando **"OKR"** (la migración solo cambió la descripción), y ese nombre se ve en el dashboard (`module-chip.tsx`) y en el panel de Módulos. Tres permisos tienen "(planificación de gobierno)" en la descripción (`core:org-unit:manage`, `core:org-unit:vision:write`, `planning:plan:manage`); la web no muestra descripciones de permisos. | Neutralizar en la migración de C30. |
| API, resto | Solo comentarios de código y el seed (`seed-demo.ts`, San Carrillo). Los mensajes de excepción de `planning` están en inglés técnico (`StrategicPlanNotFound: ...`) y la web los traduce por código. | Sin cambios de comportamiento en la API salvo el campo nuevo. |
| MCP (ADR-0010) | Aún no implementado (C26 pendiente). D5 dice que las descripciones usan los términos de UI del glosario; la tabla de herramientas describe `ver_arbol_planificacion` como "Plan de gobierno: ejes, unidades...". | Hay que enmendar D5 antes de C26. |
| Tests e2e | No hay configuración de Playwright en el repo; la web solo tiene Vitest (sin testing-library). | El guard contra regresiones tiene que ser un test de Vitest. |

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

"Eje" hardcodeado (solo relevante si el privado usa "Pilar", ver D4): `strategic-plan-panel.tsx` (123, 146–148), `axis-form-dialog.tsx` (96), `delete-axis-dialog.tsx` (44–45), `useStrategicPlan.ts` (41–42).

Falso positivo a reescribir para que el guard de D7 no lo marque: `indicator-form-dialog.tsx:487` ("se interpola entre los vecinos", vecinos = intervalos contiguos).

### Preguntas a responder

1. ¿Qué campo, con qué tipo, default y migración?
2. ¿Quién cambia el sector y desde dónde?
3. ¿Cómo llega el sector a la web y cómo se resuelve el diccionario en server y client components sin reescribir los 50 importadores?
4. ¿Cuál es el diccionario privado, término por término?
5. ¿Qué pasa con el copiloto, el catálogo y el conector MCP?
6. ¿Cómo evitamos que vuelvan los textos hardcodeados?
7. ¿Qué cambia en el seed?

### Supuestos declarados

- El sector **solo cambia etiquetas**. No cambia reglas de dominio, permisos, módulos ni cálculos. Las dos organizaciones usan el mismo modelo de 5 niveles (ADR-0009).
- Los **datos cargados por usuarios** (nombres de unidades, títulos del plan, descripciones) no se traducen: si una org pública pasa a privada, "Secretaría de Obras" sigue llamándose así.
- El locale sigue siendo `es-AR` (ADR-0006 D3). Esto no es i18n.

---

## Decisión

Vamos a agregar a `core.organization` una columna **`sector`** (`'public' | 'private'`, default `'public'`) que **solo el superadmin** define al crear la org y puede cambiar desde Configuración. El sector viaja a la web dentro de `GET /me` (`orgs[].sector`) y en el detalle de la org. La web separa `labels.ts` en **etiquetas compartidas** (sin cambios para sus importadores) y **etiquetas por sector** (dos diccionarios con el mismo tipo, completos por construcción), que se obtienen con `getLabels()` en server components y con `useLabels()` (provider en `AppShell`) en client components. Los términos núcleo por sector (plan, visión del plan, vigencia, eje, tipos de unidad) viven en `shared-types` para que el conector MCP y, más adelante, el copiloto usen los mismos. El catálogo se neutraliza, el copiloto no se parametriza ahora, y las descripciones MCP pasan a ser neutras, con la terminología de la org viajando en los datos. Un test de Vitest impide que vuelvan los textos de gobierno fuera del diccionario público.

---

## Decisiones de diseño

### D1 — Campo `Organization.sector`

- **Nombre**: `sector` (columna `sector` en `core.organization`). Valores: `'public'` | `'private'`.
- **Tipo**: `String @db.VarChar(10) @default("public")` + `CHECK (sector IN ('public','private'))` en la migración, y la unión `OrganizationSector = 'public' | 'private'` en `packages/shared-types/src/core`. **No** un `enum` de Prisma:
  - el schema no tiene ningún `enum`; todos los discriminadores (`status`, `kind`, `progressMode`, `linkMode`, `origin`...) son `VarChar` + CHECK. Un `enum` solo para este campo rompe la convención;
  - agregar un valor a un enum de Postgres es un `ALTER TYPE ... ADD VALUE` que no se puede revertir con limpieza y que Prisma maneja peor que un cambio de CHECK.
- **Default `'public'` y migración sin backfill**: `ADD COLUMN sector VARCHAR(10) NOT NULL DEFAULT 'public'`. En Postgres ≥ 11 es un cambio de metadata: no reescribe filas y no hace falta ningún `UPDATE`. Todas las orgs existentes quedan `public`, que es exactamente el comportamiento de hoy.
- **Extensible**: sumar un sector (p. ej. `nonprofit`) = ampliar el CHECK, la unión TS y escribir su diccionario. El tipo de D3 obliga a que el diccionario nuevo esté completo.

### D2 — Quién lo cambia y dónde: solo superadmin

- **Al crear la org**: `POST /api/v1/orgs` (ya `SuperadminOnlyGuard`) acepta `sector` opcional (default `'public'`). El diálogo "Crear organización" suma un selector "Terminología: Sector público / Sector privado".
- **Después**: endpoint nuevo `PATCH /api/v1/orgs/:id/sector` con `SuperadminOnlyGuard`, igual que activar y desactivar. En la web, una tarjeta "Terminología" en la pestaña **General** de Configuración, editable solo si `isSuperadmin` (la página ya lo calcula); para el resto de los miembros se muestra en solo lectura ("Esta organización usa la terminología del sector privado").
- **Por qué superadmin y no el org-admin**:
  - es una decisión de producto y comercial (qué vertical se le vende a esa org), del mismo tipo que habilitar módulos, que hoy es solo superadmin;
  - cambia el vocabulario de **todos** los usuarios de la org de un momento a otro; no es una preferencia de un admin;
  - deja la puerta abierta a precios o funciones por vertical sin rediseñar permisos.
- **Por qué un endpoint aparte y no un campo más en `PATCH orgs/:id`**: ese endpoint lo usa el org-admin central (C20b). Mezclar un campo solo-superadmin obligaría a chequear el rol dentro del service (autorización fuera del guard) y a explicar un 403 parcial. Un endpoint propio deja la autorización en el guard y el audit con una acción específica.
- **Sin efectos sobre datos**: cambiar el sector no modifica ninguna fila de negocio. La UI cambia en el próximo render (D3).

### D3 — Cómo llega a la web y cómo se resuelve el diccionario

**Transporte del sector**

- `MeDto.orgs[]` suma `sector: OrganizationSector`. `MeService` ya lee la fila de la org en los dos caminos (superadmin y miembro), así que no hay queries nuevas.
- `OrganizationSummaryDto`/`OrganizationDetailDto` suman `sector` (lista de orgs del superadmin y Configuración).
- **No** se agrega una cookie de sector: se desincronizaría cuando el superadmin lo cambia, y `/me` ya se pide en cada render del layout.

**Estructura de `lib/labels`** (C30)

```
apps/web/src/lib/labels/
├── index.ts              # barrel: re-exporta shared.ts (mismo path '@/lib/labels')
├── shared.ts             # todo lo que no depende del sector (nombres de export actuales)
├── sector-labels.ts      # tipo SectorLabels + getSectorLabels(sector)
├── sector/public.ts      # diccionario público (el texto actual)
├── sector/private.ts     # diccionario privado
├── server.ts             # getLabels(): server-only
└── labels-provider.tsx   # 'use client': LabelsProvider + useLabels()
```

- **Compartido** (`shared.ts`): conserva exactamente los nombres de export actuales para todo lo que no depende del sector: `SEMAPHORE_LABELS`, `DEVIATION_LABELS`, `PENDING_LOAD_LABELS`, `EXPECTED_CURVE_MODE_LABELS`, `LINK_MODE_*`, `CONTRIBUTION_*`, `AUTOMATIC_ENTRY_LABELS`, `INVITE_SCOPE_LABELS`, `SCOPE_WHOLE_ORG_LABEL`, `LINKED_PROJECT_LINK_LABELS`, `FROM_PROJECTS_UNAVAILABLE_LABELS` y las claves compartidas de `LABELS` (objetivo, indicador, proyecto, tarea, período, unidad, avances, ponderación...). **Unos 25 de los 50 importadores no cambian**: el path `@/lib/labels` sigue resolviendo al barrel.
- **Por sector**: las claves que dependen del sector **se quitan** del export estático (`LABELS.plan`, `LABELS.axis`, `ORG_UNIT_KIND_LABELS`, `NO_AXIS_LABEL`, las claves con eje/plan de `PLANNING_TREE_LABELS` y `EXECUTIVE_GANTT_LABELS`, los hints de `INDICATOR_KIND_LABELS`) y pasan a `SectorLabels`. Quitarlas es a propósito: **el type-check se convierte en la lista de migración** (cada uso viejo deja de compilar) y no puede quedar un uso que muestre el término público en una org privada por olvido. Mantenerlas como alias del diccionario público sería una fuga silenciosa.
- **Tipo y completitud**: `SectorLabels` es una interfaz explícita (strings y funciones de formato, no literales). `sector/public.ts` y `sector/private.ts` hacen `satisfies SectorLabels`: una clave faltante en el privado es un error de compilación.
- **Server components**: `getLabels()` (en `server.ts`, marcado `server-only`) lee la cookie `activeOrgId`, obtiene `/me` con una función envuelta en `React.cache` (el layout pasa a usar la misma función, así que `/me` se pide **una vez por request** aunque layout y página lo necesiten) y devuelve `{ ...SHARED, ...getSectorLabels(sector) }`. Sin org activa o sin `/me`: `public` (es el estado previo a elegir org y no muestra datos de negocio).
- **Client components**: `AppShell` (ya client y ya dueño de `activeOrgId`) envuelve `children` en `<LabelsProvider sector={activeOrg?.sector ?? 'public'}>`. `useLabels()` devuelve el diccionario combinado. Al cambiar de org en el selector, el sector cambia en el mismo instante en el cliente y el `router.refresh()` existente re-renderiza los server components con el sector nuevo.
- **Funciones puras** que hoy leen etiquetas (p. ej. `planning-tree-view.ts`: `L.noPlan`, `L.withoutAxis`, `L.objectivesCount`) reciben las etiquetas por parámetro. Siguen siendo testeables sin React.
- **Mensajes de error de server actions**: `failure(info)` no cambia de firma (36 usos). Los 6 códigos con vocabulario de sector se reescriben en `error-messages.ts` con un **texto neutro de respaldo** ("El agrupador elegido no pertenece al plan vigente", "El fin de la vigencia tiene que ser posterior al inicio"...) y su versión por sector va en `SectorLabels.errors`. `useActionRunner` (client) muestra `labels.errors[code] ?? result.error`. Los pocos lugares que muestran `result.error` sin pasar por `useActionRunner` quedan con el texto neutro, que no tiene vocabulario de gobierno.
- **Íconos**: el ícono del estado vacío del plan pasa a uno neutro para los dos sectores (p. ej. `Flag` de lucide). No se modelan íconos por sector.

**Estrategia de migración de usos (C30)**, en este orden, cada paso compilando:

1. Crear la estructura con `public.ts` = texto actual; `private.ts` completo; `shared.ts` con lo compartido. Agregar `sector` a los DTOs y a `/me`.
2. Provider en `AppShell` y `getLabels()` con `/me` cacheado.
3. Quitar las claves por sector del export estático y corregir cada error de compilación (~25 archivos): server components → `await getLabels()`; client components → `useLabels()`; funciones puras → parámetro.
4. Mover al diccionario los 27 textos hardcodeados de la tabla del Contexto (más los 9 de "eje" si D4 se confirma con "Pilar").
5. Activar el test de D7.

### D4 — Diccionario privado, término por término

Lo que está en **ambos iguales** queda en `shared.ts`: Objetivo estratégico, Indicador, Carga de indicador, Curva esperada, Indicador de contexto, Proyecto, Tarea, Aporte de proyecto a indicador, Avance de resultado, Avance de gestión, Período, Unidad/Unidades, Estructura, Visión y Misión (de la unidad), Miembro, Alcance, Toda la organización, Árbol de planificación, Vista ejecutiva, Indicadores de gestión, semáforo, desvío, ponderación, aportes.

**Por sector** (`SectorLabels`):

| Clave | Público (actual) | Privado (propuesto) |
|---|---|---|
| `plan.singular` (N1, nav, título) | Plan de gobierno | Plan estratégico |
| `plan.vision` | Visión general de gobierno | Visión estratégica |
| `plan.term` (vigencia del plan) | Mandato | Vigencia |
| `plan.termStart` / `plan.termEnd` | Inicio del mandato / Fin del mandato | Inicio de la vigencia / Fin de la vigencia |
| `plan.termRange(desde, hasta)` | Mandato: {desde} al {hasta} | Vigencia: {desde} al {hasta} |
| `plan.formDescription` | Es la visión general de gobierno del mandato. Solo hay un plan vigente por organización. | Es la visión estratégica de la empresa para el horizonte del plan. Solo hay un plan vigente por organización. |
| `plan.titlePlaceholder` | Ej: Plan de gobierno 2026-2029 | Ej: Plan estratégico 2026-2028 |
| `plan.visionPlaceholder` | Hacia dónde va el gobierno durante este mandato... | Hacia dónde va la empresa en los próximos años... |
| `plan.empty` (título / descripción / CTA) | Aún no hay plan de gobierno / Creá el plan con la visión general y el período del mandato... / Crear plan de gobierno | Aún no hay plan estratégico / Creá el plan con la visión estratégica y su vigencia... / Crear plan estratégico |
| `plan.noOrg` | Para ver el plan de gobierno, primero elegí una organización... | Para ver el plan estratégico, primero elegí una organización... |
| `axis.singular` / `axis.plural` (N2) | Eje / Ejes | Pilar / Pilares |
| `axis.none` (`NO_AXIS_LABEL`, `withoutAxis`, `noAxis`) | Sin eje | Sin pilar |
| `axis.all` | Todos los ejes | Todos los pilares |
| `axis.byView` | Por ejes | Por pilares |
| `axis.empty` (título / descripción / CTA), `axis.create`, `axis.deleteWarning(n)`, `axis.deletedNotice(nombre, n)`, `axis.createHint` | ...ejes / eje... | ...pilares / pilar... (mismo género, misma redacción) |
| `orgUnitKind.central` | Central | Dirección General |
| `orgUnitKind.ministry` | Ministerio / Secretaría | Dirección |
| `orgUnitKind.area` | Área / Dirección | Área |
| `board.title` | Avance por eje | Avance por pilar |
| `planningTree.subtitle` | Cómo avanza el plan de gobierno, por eje o por unidad. El resultado y la gestión se leen por separado. | Cómo avanza el plan estratégico, por pilar o por unidad. El resultado y la gestión se leen por separado. |
| `planningTree.noPlan` / `noPlanHint` | Sin plan de gobierno activo / ...Creá el plan en Plan de gobierno para agruparlos por eje. | Sin plan estratégico activo / ...Creá el plan en Plan estratégico para agruparlos por pilar. |
| `planningTree.noObjectivesInAxis`, `boardNoPeriod`, `boardUnitsEmpty`, `executiveGantt.emptyDescription` | ...eje... | ...pilar... |
| `indicatorKind.output.hint` | lo que se entrega (km, obras, cantidad) | lo que se entrega (unidades producidas, entregas, cantidad) |
| `indicatorKind.outcome.hint` | el cambio que se busca (alfabetización, calidad) | el cambio que se busca (satisfacción, calidad, participación) |
| `placeholders.orgName` / `orgSlug` | Ej: Ministerio de Salud / ej-ministerio-salud | Ej: Lumbre Electrodomésticos / ej-lumbre |
| `placeholders.unitName` | Ej: Secretaría de Obras Públicas | Ej: Dirección Industrial |
| `placeholders.metricSource` | Ej: Registro de obras de la Secretaría | Ej: Sistema de gestión de planta |
| `placeholders.objectiveTitle` | Ej: Mejorar atención ciudadana | Ej: Reducir los reclamos en garantía |
| `placeholders.orgMission` / `orgVision` / `orgValues` | ...ciudadanos... servicios públicos... | Ej: Fabricar electrodomésticos confiables y eficientes para los hogares de la región... / Ej: Ser la marca de electrodomésticos preferida del país... / Ej: Calidad, seguridad, eficiencia, respeto por el cliente... |
| `errors.OrgUnitInvalidParentKind` | ...Una unidad central o un ministerio admiten ministerios y áreas; un área solo admite áreas. | ...La Dirección General o una dirección admiten direcciones y áreas; un área solo admite áreas. |
| `errors.OrgUnitKindInvalid` | ...a un ministerio/secretaría o a un área/dirección, no a la unidad central. | ...a una dirección o a un área, no a la Dirección General. |
| `errors.AxisNotInActivePlan` / `StrategicPlanRequired` / `StrategicPlanNotFound` / `MandateRangeInvalid` | ...eje... plan de gobierno... mandato | ...pilar... plan estratégico... vigencia |

Notas:

- "Pilar" y "eje" son masculinos: las frases se traducen palabra por palabra sin reescribir concordancias.
- En el privado, "Dirección" (tipo `ministry`) y "Área" (tipo `area`) se distinguen; en el público, "Dirección" aparece como sinónimo de área. No hay conflicto porque cada org ve un solo diccionario.
- "Avance de gestión" e "Indicadores de gestión" se mantienen en los dos: "gestión" es vocabulario corriente en empresas.
- El texto exacto de cada frase larga lo fija C30 siguiendo esta tabla; el ADR fija los términos.

**Términos núcleo compartidos con la API**: `plan.singular`, `plan.vision`, `plan.term`, `axis.singular/plural` y `orgUnitKind.*` se definen una sola vez en `packages/shared-types/src/core/sector-terms.ts` (`SECTOR_TERMS: Record<OrganizationSector, SectorTerms>`, datos puros, sin React) y los diccionarios de la web los reutilizan. Así el conector MCP (D5) y el copiloto usan exactamente las mismas palabras que la UI.

### D5 — Lado API: copiloto, catálogo y MCP

**Copiloto (`modules/ai`)**: **no se parametriza por sector** en la Fase 12.
- Los prompts no tienen vocabulario de gobierno; ya son neutros (con sesgo empresarial), así que el demo privado funciona igual.
- Tener dos prompts por sector duplicaría el costo de evaluar calidad para un beneficio que hoy no se ve.
- Lo pendiente del copiloto (dice "OKR", asume trimestres, no conoce el modelo de 5 niveles) ya está en `TODO.md`. Cuando se haga, el sector entra como **una línea del bloque de contexto organizacional** ("Tipo de organización: empresa privada") y como fuente de `SECTOR_TERMS` para nombrar plan y ejes. No va como un segundo system prompt.
- Regla desde ahora: los prompts no pueden tener vocabulario de un sector (los cubre el test de D7).

**Catálogo**: se **neutraliza**, no se parametriza (el catálogo es global y no conoce orgs). En la migración de C30, con el mismo criterio que `20261009000002_catalog_texts_without_kr` (UPDATE idempotente sobre `core.module` y `auth.permission`, nunca sobre `audit.event`):
- `core.module` `okr`: `name` "OKR" → "Planificación" (hoy se ve en el dashboard y en el panel de Módulos).
- `auth.permission`: sacar "(planificación de gobierno)" de las descripciones de `core:org-unit:manage`, `core:org-unit:vision:write` y `planning:plan:manage`.

**Conector MCP (enmienda a ADR-0010 D5)**:
- **Descripciones de herramientas e `instructions`: neutras.** Para los términos que dependen del sector se usan formas genéricas: "el plan de la organización", "sus ejes o pilares (agrupadores opcionales del plan)", "las unidades de la estructura". Los términos compartidos (Objetivo estratégico, Indicador, Proyecto, Tarea, Período, Avance de resultado, Avance de gestión) se mantienen como dice ADR-0010.
- **Los datos llevan la terminología de la org**: `listar_organizaciones` y `ver_arbol_planificacion` devuelven `terminologia: { sector, plan, visionPlan, vigencia, eje: { singular, plural }, tiposUnidad: { central, ministry, area } }`, tomado de `SECTOR_TERMS`. En las unidades, `tipo` mantiene el código y se agrega `tipoEtiqueta`.
- `instructions` suma una regla: "Al responder, usá los términos de `terminologia` de la organización".
- El test de `tool-registry` de ADR-0010 ("descripción sin KR/OKR") se extiende con la lista de términos de sector de D7.

**Mensajes de error de la API**: no cambian. Los de `planning` son códigos con texto técnico en inglés y la web los traduce por código (D3).

### D6 — Superficies sin cambio

- No cambian reglas de dominio, cálculos (`okr-domain`, `deviation-domain`, `metrics-domain`), permisos, módulos ni tenant scoping.
- Los identificadores técnicos (`StrategicPlan`, `Axis`, `OrgUnit.kind = 'ministry'`, `mandateStartsAt`) no se renombran (ADR-0009 D1). El glosario UI ↔ código de `CLAUDE.md` gana una columna por sector (lo actualiza C30).

### D7 — Guard contra textos hardcodeados

Un test de Vitest en `apps/web` (`src/lib/labels/sector-terms.guard.test.ts`) y su par en `apps/api`:

1. **Escaneo del código fuente**: recorre `apps/web/src/**/*.{ts,tsx}` (excluye `*.test.*`, `lib/labels/sector/public.ts` y `components/ui/**`), quita comentarios (`//...`, `/* ... */`) con una regex simple y falla si encuentra, sin distinguir mayúsculas, alguno de:
   `gobierno`, `mandato`, `ministeri`, `secretar[ií]a`, `municip`, `ciudadan`, `vecin(o|al)`, `intendent`, `concejo`, `servicios? p[uú]blicos?`.
   El mensaje del fallo lista archivo, línea y término, y dice "movelo al diccionario de sector (`lib/labels/sector/*`)". En `apps/api` el mismo escaneo cubre `src/modules/ai/prompts/**` y `src/modules/mcp/**` (cuando exista), sin excepción de archivo.
2. **Diccionario privado limpio**: recorre en profundidad `getSectorLabels('private')`, invoca las funciones con argumentos de ejemplo y verifica que ningún texto tenga esos términos. Lo mismo para `SECTOR_TERMS.private`.
3. **Completitud**: la da el tipo (`satisfies SectorLabels`); un test mínimo verifica además que los dos diccionarios tengan el mismo conjunto de claves en runtime (para claves opcionales que el tipo no fuerce).

La lista de términos vive en una constante compartida por los tests (`FORBIDDEN_PUBLIC_SECTOR_TERMS`). Si un día existe un diccionario de otro sector con sus propios términos prohibidos, se generaliza a "términos exclusivos de cada sector".

Se prefiere un test a una regla de ESLint (`no-restricted-syntax` sobre `Literal`/`JSXText`/`TemplateElement`) porque un mismo test cubre web y API, corre en `pnpm test` (obligatorio antes de cerrar una tarea) y no requiere tocar la configuración compartida de ESLint. Ver A4.

### D8 — Seed

- **San Carrillo** (`seed-org-demo`): `sector: 'public'` explícito en `create` y en `update` del upsert, para que el seed sea determinista aunque alguien lo cambie a mano.
- **Lumbre Electrodomésticos S.A.** (C31): org nueva (`id: 'seed-org-lumbre'`, `slug: 'lumbre'`), `sector: 'private'`, con el contenido que describe `plan.md` C31 (Dirección General → direcciones → áreas, plan estratégico 2026–2028 con su vigencia en `mandateStartsAt/EndsAt`, 5 pilares en `Axis`, 7 objetivos con indicadores y proyectos con tareas).
- **Organización del seed**: `seed-demo.ts` pasa a orquestar dos archivos, `seed-demo-san-carrillo.ts` (contenido actual sin cambios) y `seed-demo-lumbre.ts`. El escaneo de D7 incluye `seed-demo-lumbre.ts` en `apps/api`: el contenido de la org privada tampoco puede tener vocabulario de gobierno.
- Usuarios: mismo criterio que San Carrillo (el superadmin ve las dos orgs por el bypass de `/me`).

---

## Modelo de datos

> Shape ilustrativo, no migración ejecutable.

```prisma
model Organization {
  // ... columnas actuales sin cambios ...
  /// 'public' | 'private'. Elige el diccionario de terminología de la UI (ADR-0011). CHECK en la migración.
  sector              String    @default("public") @db.VarChar(10)
  // ...
  @@schema("core")
}
```

- Schema `core`. `NOT NULL DEFAULT 'public'`, `CHECK (sector IN ('public','private'))`.
- Sin índice: no se filtra por sector en ninguna consulta de negocio (solo se lee junto con la org).
- No hay pesos ni porcentajes en este cambio. Nada de `Float`.
- `organizationId`: el campo **es** de la organización; no hay entidades de negocio nuevas.

**Datos de catálogo** (misma migración, UPDATE idempotente): `core.module.name` de `okr` y tres descripciones de `auth.permission` (D5).

---

## Contrato (API)

| Método + path | Propósito | Request / Response (`shared-types/core`) | Códigos | Guards |
|---|---|---|---|---|
| `GET /api/v1/me` (existente) | Suma el sector por org | `MeDto.orgs[].sector: OrganizationSector` | 200, 401 | `AuthGuard` (sin cambio; cross-org por diseño, ADR-0002 D6) |
| `GET /api/v1/orgs` (existente) | Lista de orgs del superadmin, con sector | `OrganizationSummaryDto.sector` | 200, 401, 403 | `SuperadminOnlyGuard` |
| `GET /api/v1/orgs/:id` (existente) | Detalle con sector | `OrganizationDetailDto.sector` | 200, 401, 403, 404 | `TenantGuard` + `OrgIdParamGuard` |
| `POST /api/v1/orgs` (existente) | Alta con sector opcional | `CreateOrganizationDto.sector?: OrganizationSector` (default `'public'`), validado con `@IsIn(['public','private'])` | 201, 400, 401, 403, 409 | `SuperadminOnlyGuard` |
| `PATCH /api/v1/orgs/:id/sector` (**nuevo**) | Cambiar la terminología de la org | Request `UpdateOrganizationSectorDto { sector: OrganizationSector }`; response `OrganizationDetailDto` | 200, 400 (valor inválido), 401, 403 (`SuperadminRequired`), 404 | `SuperadminOnlyGuard` (lee `request.authContext` primero, ALS solo como fallback, según `CLAUDE.md`) |
| `PATCH /api/v1/orgs/:id` (existente) | **Sin cambios**: `UpdateOrganizationDto` **no** acepta `sector` (`whitelist: true` lo descarta) | — | — | Igual que hoy |

Si el valor nuevo es igual al actual, `PATCH .../sector` responde 200 sin escribir ni auditar (idempotente).

---

## Boundaries de módulo

- **Dueño**: `core` (`OrganizationService`, `OrganizationController`, `MeService`). No hay módulo nuevo.
- **Superficie pública**: no cambia `core/index.ts`. El tipo `OrganizationSector` y `SECTOR_TERMS` se exportan desde `@gestion-publica/shared-types/core` (subpath existente).
- **Consumidores**:
  - `mcp` (C26) lee el sector a través de lo que ya consume según ADR-0010 (`MeService` exportado y el resultado de `TenantMembershipResolver`/detalle de org) y los términos desde `shared-types`. **No** consulta `core.organization` por su cuenta.
  - `ai` (futuro): el sector entra en el bloque de contexto que ya arma desde la org; términos desde `shared-types`.
- **Prohibido**: importar `../core/services/organization.service` u otros internos desde `mcp` o `ai`; duplicar los términos de sector en la API fuera de `shared-types`; que `shared-types` importe algo de React o de la web.
- **Web**: los componentes de presentación reciben las etiquetas del hook o del helper; no deciden el sector por su cuenta (no leen cookies ni `/me`).

---

## Matemática de avance

**No aplica.** El sector no participa en ningún cálculo: las cascadas de `okr-domain`, los desvíos y semáforos de `deviation-domain`, las curvas de `metrics-domain` y los agregados por unidad y eje no cambian. No se agregan funciones a `packages/okr-domain`. La única lógica nueva es de presentación (elegir diccionario) y vive en la web.

---

## Auth0 → RBAC local

- **Claims consumidos**: los de siempre (`sub`, `email`). El sector **no** viaja en el token ni en claims de Auth0: se resuelve por request desde la DB vía `/me`, así que un cambio de sector rige en el próximo render, sin re-login.
- **Permisos**:
  - leer el sector: cualquier usuario autenticado para sus orgs (`/me`), cualquier miembro (`GET orgs/:id`);
  - cambiarlo: solo superadmin (`SuperadminOnlyGuard`). **No** se agrega permiso RBAC nuevo (p. ej. `core:org:sector:write`): ningún rol de org debe tenerlo, así que sería un permiso vacío. Mismo criterio que la habilitación de módulos.
- **Default deny**: el endpoint nuevo tiene guard explícito. `UpdateOrganizationDto` no acepta `sector`, así que el org-admin no puede cambiarlo por el endpoint existente.

---

## Tenant scoping

- `sector` es un atributo de `core.organization`, no una entidad de negocio con `organizationId`. Se lee:
  - en `/me`, con `prismaService.raw` como hoy (cross-org por diseño, solo las orgs del usuario o todas si es superadmin);
  - en `GET orgs/:id`, bajo `TenantGuard` + `OrgIdParamGuard` (el `:id` tiene que ser la org del header).
- `PATCH orgs/:id/sector` es superadmin, igual que `activate`/`deactivate`, que tampoco pasan por `TenantGuard`. Se escribe solo la fila `:id`.
- En la web, el sector se toma **de la org activa** (`effectiveOrgId` en el layout, `activeOrgId` en `AppShell`). Nunca se mezclan diccionarios de dos orgs en una misma pantalla.
- En MCP, el sector sale de la org resuelta para cada llamada (ADR-0010 D4), nunca de un parámetro libre.
- Ninguna consulta de negocio cambia ni pierde su filtro por `organizationId`.

---

## Eventos de auditoría

Todos son **INSERTs** en `audit.event`. No hay `UPDATE` ni `DELETE` sobre esa tabla ni backfill.

| Mutación | Acción | Payload (`diff`) | Notas |
|---|---|---|---|
| Alta de org (`POST /orgs`) | `organization.created` (existente) | `after` suma `sector` | Sin cambio de acción. |
| Cambio de sector (`PATCH /orgs/:id/sector`) | `organization.sector_changed` (**nueva**) | `{ before: { sector }, after: { sector } }` | `entityType: 'core.organization'`, `entityId: id`, actor = superadmin. No se emite si el valor no cambia. Volver al valor anterior es otro evento, no una edición del primero. |
| `PATCH /orgs/:id` | `organization.updated` (existente) | Sin cambios (no incluye `sector`) | — |
| Migración de catálogo (D5) | — | — | Datos de catálogo sembrados por migración, igual que `20261009000002`; no son mutaciones de usuario y no van a `audit.event`. |
| Seed | Igual que hoy | — | El seed no cambia su criterio de audit. |

---

## Alternativas consideradas

### A1 — Editor de etiquetas por organización (tabla `core.organization_label`)
Cada org sobrescribe las etiquetas que quiera.
**Descartada por ahora** (decisión de Pedro): necesita UI de edición, validación de concordancia de género y número en frases largas, fallback por clave y tests de completitud por org. Para el objetivo comercial alcanza con dos diccionarios fijos. Queda en el backlog ("etiquetas configurables por org"); el diseño de D3 (diccionario tipado + resolución por org activa) se puede extender con overrides sin cambiar los consumidores.

### A2 — Neutralizar todo (un solo diccionario sin vocabulario de ningún sector)
"Plan", "Agrupador", "Unidad nivel 1/2/3".
**Descartada**: el producto pierde lo que ADR-0009 buscó para el sector público (que un municipio reconozca su lenguaje), y los términos genéricos se sienten de software, no de planificación. Además, la decisión de Pedro es explícitamente por sector.

### A3 — Dos builds o dos deploys de la web (uno por vertical)
**Descartada**: duplica deploy, dominio y pipeline. No permite mostrar las dos orgs con el mismo login y el mismo selector, que es justamente el demo de C31.

### A4 — Regla de ESLint en lugar del test de Vitest
`no-restricted-syntax` con selectores sobre `Literal`, `JSXText` y `TemplateElement`.
**Descartada como mecanismo principal**: ignora comentarios sin trabajo extra y avisa en el editor, pero no cubre la API con la misma configuración, cuesta más escribir y mantener la regex en selectores de AST, y tocar `config-eslint` afecta a todo el monorepo. Se puede sumar después como ayuda en el editor; el test sigue siendo la fuente de verdad.

### A5 — Sector en una cookie (`activeOrgSector`) además de `activeOrgId`
**Descartada**: dos cookies que se desincronizan cuando el superadmin cambia el sector, y en un server component no se pueden escribir cookies para corregirlo. `/me` ya se pide por request.

### A6 — Mantener `LABELS.plan`/`axis`/`ORG_UNIT_KIND_LABELS` como alias del diccionario público
Evitaría tocar ~25 archivos.
**Descartada**: cada uso olvidado mostraría "Plan de gobierno" en la fábrica sin que nada falle. Quitar las claves convierte al type-check en el control de la migración.

### A7 — `enum` de Prisma `OrganizationSector`
**Descartada**: ver D1 (convención del repo y costo de `ALTER TYPE`). La unión TS da la misma seguridad de tipos en la API y en la web.

---

## Impacto

### Migraciones (shape, no SQL)

1. `core.organization`: `ADD COLUMN sector VARCHAR(10) NOT NULL DEFAULT 'public'` + CHECK. Sin `UPDATE`.
2. Catálogo, UPDATE idempotente: `core.module` `okr` → `name = 'Planificación'`; tres descripciones de `auth.permission` sin "(planificación de gobierno)".

### API (C30, backend-dev)

- `shared-types/core`: `OrganizationSector`, `SECTOR_TERMS`, `sector` en `MeDto.orgs[]`, `OrganizationSummaryDto`, `OrganizationDetailDto`, `CreateOrganizationDto`; `UpdateOrganizationSectorDto`.
- `core`: `MeService` (incluir `sector`), `OrganizationService.create` (aceptar `sector`) y `updateSector` (nuevo, con audit), endpoint `PATCH orgs/:id/sector`, DTOs con `class-validator`.
- Seed: `sector: 'public'` explícito en San Carrillo y división en archivos (D8). Lumbre en C31.

### Web (C30, frontend-dev)

- `lib/labels/` según D3; provider en `AppShell`; `getLabels()` con `/me` cacheado (el layout lo reutiliza).
- Migración de los ~25 usos por sector y de los 27 + 9 textos hardcodeados; reescritura del falso positivo "vecinos".
- `useActionRunner`: `labels.errors[code] ?? result.error`; textos neutros de respaldo en `error-messages.ts`.
- Selector de sector en "Crear organización"; tarjeta "Terminología" en Configuración → General (editable solo superadmin); badge de sector en la lista de orgs del superadmin.
- Ícono neutro en el estado vacío del plan.

### Tests

- **Unit (Vitest, web)**: guard de D7 (escaneo + diccionario privado + paridad de claves); `getSectorLabels` para los dos valores; funciones puras de `planning-tree-view` con etiquetas privadas ("Sin pilar", "Sin plan estratégico activo"); `useActionRunner` elige el mensaje por sector a partir de `code` (test del selector como función pura).
- **Unit (Vitest, API)**: escaneo de prompts y de `mcp/**` y `seed-demo-lumbre.ts`; `SECTOR_TERMS.private` sin términos prohibidos.
- **Integración (`apps/api/test`, DB real)**:
  - `PATCH orgs/:id/sector`: superadmin 200 + evento `organization.sector_changed` con before/after; org-admin central 403; valor inválido 400; mismo valor sin evento;
  - `PATCH orgs/:id` con `sector` en el body no lo cambia;
  - `POST /orgs` sin `sector` → `public`; con `private` → `private` y `organization.created.after.sector`;
  - `/me` devuelve `sector` por org en el camino de miembro y en el de superadmin;
  - la migración deja todas las orgs existentes en `public`.
- **E2E**: no hay Playwright configurado en el repo. La verificación de pantallas es manual en C31 (Pedro recorre las dos orgs con el selector). Ver Pregunta abierta 8.

### Otros documentos (los actualiza C30, no este ADR)

- `CLAUDE.md`: glosario UI ↔ código con una columna por sector.
- ADR-0010: nota "Amended by: 0011" en el encabezado.

---

## Consecuencias

### Positivas

- El demo privado no muestra vocabulario de gobierno, y el test lo sostiene en el tiempo.
- Sin cambios de dominio, permisos ni datos: el riesgo se concentra en la capa de presentación.
- El type-check guía la migración y la completitud del diccionario privado.
- Una sola fuente de términos núcleo para la UI, el conector MCP y el copiloto.
- Cumple ADR-0006 D2.2: la nomenclatura que varía por tipo de organización queda configurable en `core.organization`.

### Negativas / trade-offs aceptados

- ~25 archivos de la web cambian de import (de constante estática a `getLabels()`/`useLabels()`), y las funciones puras de etiquetas suman un parámetro.
- Las frases largas se escriben dos veces (una por sector). Con dos sectores es aceptable; con más, conviene A1.
- Los mensajes de error que no pasan por `useActionRunner` muestran el texto neutro, no el del sector.
- El test de escaneo es por regex: puede dar falsos positivos (se reescribe el texto) y no detecta un término de gobierno armado por concatenación. Es un control razonable, no una garantía formal.
- Los datos cargados por usuarios no se traducen: una org que cambia de sector conserva nombres como "Secretaría de...".
- `getLabels()` depende de `/me`: si falla, la página cae al diccionario público. Es el mismo estado degradado que hoy (el layout ya trata `/me` caído).

### Diferido

- Editor de etiquetas por org (A1, backlog).
- Sector en el copiloto (con el ítem existente de `TODO.md`).
- Otros sectores (ONG, educación, salud).
- Playwright y un e2e "la org privada no muestra 'gobierno'".

---

## Conflictos con reglas congeladas

**Ninguno detectado.**

- **Boundaries**: el campo y el endpoint quedan en `core`; los términos compartidos, en `shared-types`; `mcp` y `ai` no tocan internos de `core`.
- **Multi-tenant**: el sector se lee y escribe sobre la fila de la org, con los guards existentes (`/me`, `TenantGuard` + `OrgIdParamGuard`, `SuperadminOnlyGuard`); ninguna consulta de negocio cambia.
- **Audit append-only**: una acción nueva (`organization.sector_changed`) y un campo más en `organization.created`, solo INSERTs. Las migraciones no tocan `audit.event`.
- **Decimales**: no hay pesos ni porcentajes en juego.
- **Dominio**: sin cambios en períodos, dos lecturas, ponderación, vínculos ni jerarquía de `OrgUnit`; un objetivo sigue en exactamente un período; no hay `%` directo.
- **Default deny**: el endpoint nuevo tiene guard explícito y el existente descarta el campo.

---

## Preguntas abiertas

Cada una con la recomendación de este ADR, que rige si Pedro no dice otra cosa.

1. **¿"Pilares" o "Ejes" en el privado?** "Pilares" suena más a empresa y `plan.md` C31 ya habla de "5 pilares"; mantener "Ejes" ahorra mover 9 líneas hardcodeadas de 4 archivos.
   *Recomendación*: **Pilar / Pilares**. El costo es chico y el término es el que usa el propio plan del demo.
2. **Tipos de unidad en el privado**: ¿"Dirección General / Dirección / Área" o "Dirección General / Gerencia / Área"?
   *Recomendación*: **Dirección General / Dirección / Área**, que coincide con C31 ("Dirección General → direcciones → áreas"). "Gerencia" es igual de válido; si Pedro lo prefiere, cambia una línea.
3. **¿Quién cambia el sector?**
   *Recomendación*: **solo superadmin**, al crear la org y desde Configuración → General (tarjeta "Terminología"), con endpoint propio. El org-admin lo ve en solo lectura.
4. **¿`enum` de Prisma o `VarChar` + CHECK?** El pedido sugería `enum`.
   *Recomendación*: **`VarChar(10)` + CHECK + unión TS**, por la convención del schema (no hay ningún `enum`) y porque ampliar un CHECK es más simple que `ALTER TYPE`.
5. **¿Dónde viven los términos núcleo?**
   *Recomendación*: **`shared-types/core/sector-terms.ts`**, porque los usan la web y la API (MCP). Las frases largas quedan solo en la web.
6. **Copiloto: ¿parametrizar por sector ahora?**
   *Recomendación*: **no**. Sus prompts ya no tienen vocabulario de gobierno. El sector entra como línea de contexto cuando se haga el ítem de `TODO.md` "Adaptar copiloto de IA al modelo de planificación".
7. **Catálogo: ¿renombrar el módulo `okr` de "OKR" a "Planificación" y limpiar las tres descripciones de permisos en la migración de C30?** El nombre "OKR" se ve hoy en el dashboard de cualquier usuario.
   *Recomendación*: **sí, las dos cosas**, en la misma migración idempotente.
8. **Tests de pantalla**: `plan.md` C30 pide "la org privada no muestra 'gobierno' en las pantallas principales", pero no hay Playwright configurado.
   *Recomendación*: en la Fase 12, **guard de Vitest (D7) + recorrida manual de Pedro en C31**. Configurar Playwright es una corrida aparte que no conviene meter en esta fase.
9. **Mensajes de error por sector**: ¿alcanza con resolverlos en `useActionRunner` por `code`, con texto neutro de respaldo en el server?
   *Recomendación*: **sí**. Evita cambiar la firma de `failure()` en 36 llamadas, y los casos que no pasan por el hook muestran un texto neutro, no uno de gobierno.
10. **¿Permitir cambiar el sector de una org con datos cargados?**
    *Recomendación*: **sí**: solo cambia etiquetas. El diálogo avisa que los nombres cargados por usuarios no se modifican.
11. **¿Sumar ya un tercer valor (p. ej. `nonprofit`)?**
    *Recomendación*: **no**. Dos valores ahora; el tipo de D3 hace que agregar uno sea mecánico cuando haya un cliente que lo pida.

---

## Referencias cruzadas

- [ADR 0002](./0002-core-module-foundation.md): `core.organization`, `/me` cross-org (D6).
- [ADR 0005](./0005-ai-copilot-module.md): prompts del copiloto y bloque de contexto organizacional.
- [ADR 0006](./0006-domain-agnostic-platform.md): D2.2, nomenclatura configurable por organización.
- [ADR 0009](./0009-planificacion-gobierno-5-niveles.md): D1 (nombres técnicos sin renombrar) y glosario de UI, que este ADR pasa a ser por sector.
- [ADR 0010](./0010-conector-mcp.md): D5, descripciones de herramientas; este ADR las vuelve neutras y agrega `terminologia` en los datos.
- `plan.md`, Fase 12 (C29–C31).
- `apps/web/src/lib/labels.ts`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/planning/error-messages.ts`, `apps/web/src/features/planning/useActionRunner.ts`.
