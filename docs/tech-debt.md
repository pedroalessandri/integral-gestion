# Deuda técnica conocida

> Items de mejora, refactor o limpieza identificados durante el desarrollo
> que NO son urgentes pero conviene atender más adelante.

## Producto

### Permission gating en gestión de períodos usa isSuperadmin
- **Qué**: los botones "Crear período", "Cerrar período" y "Activar período" usan `isSuperadmin` en lugar de un permiso granular del RBAC.
- **Por qué importa**: cuando aparezcan roles como `org-admin` no-superadmin, esos usuarios no van a poder gestionar períodos en su propia org.
- **Posible solución**: reemplazar checks `isSuperadmin` por `hasPermission(user, 'period:manage')` o equivalente. Definir el permiso en el sistema RBAC (ADR-0004).
- **Prioridad**: media. Activa cuando se agreguen usuarios no-superadmin reales.

### Cálculo de acumulado del indicador duplicado (M2)
- **Qué**: la lógica "acumulado = baseline + Σ incrementos" e interpolación del % vive en `MetricLinkService.currentCumulative` (módulo metrics) y está duplicada en `ObjectiveService.loadAutomaticLinks` (módulo okr), que la reimplementa para poblar el `metricLink` embebido del cascade DTO.
- **Por qué importa**: el módulo okr no puede depender del módulo metrics (metrics ya depende de okr por D-O1 → sería ciclo), así que okr no puede reusar el service; reimplementa el cálculo leyendo las tablas de metrics directo. Si cambia la fórmula de acumulado, hay que tocar dos lugares.
- **Posible solución**: extraer el acumulado a una función pura en `packages/metrics-domain` (p. ej. `accumulate(baseline, increments)`) y que ambos services la usen; o mover el embed del `metricLink` a un paso de composición fuera de okr. Ver docs/features/indicadores-okr.md D-O1.
- **Prioridad**: baja. Ambos caminos están cubiertos por tests; el riesgo es drift si se edita la fórmula.
- **Actualización (C11, 2026-10-08)**: `metrics-domain` ya tiene `accumulatedValue(baseline, increments)` (lo usa `ObjectiveIndicatorService`); falta migrar `MetricLinkService` y `ObjectiveService` a esa función.

### `apps/web` sin script `typecheck` ni Vitest (C06)
- **Qué**: `apps/web/package.json` solo tiene `dev`, `build`, `start` y `lint`. `pnpm typecheck` (turbo) no corre sobre web y `pnpm --filter web typecheck` falla ("None of the selected packages has a typecheck script"). Tampoco hay runner de tests, así que los helpers puros de C06 (`features/*/tree.ts`, `plan-form.ts`, `objective-assignment.ts`, `lib/api-errors.ts`) no tienen tests.
- **Por qué importa**: los errores de tipos del front solo salen con `next build` o `tsc --noEmit` a mano; la lógica de formularios no tiene red.
- **Posible solución**: agregar `"typecheck": "tsc --noEmit"` a web, configurar Vitest + Testing Library y cubrir esos helpers y los hooks.
- **Prioridad**: media.
- **Actualización (C12, 2026-10-08)**: `apps/web` ya tiene `typecheck` (`tsc --noEmit`) y Vitest (solo tests de funciones puras, entorno node, sin Testing Library). Cubiertos: `projects/weights.ts`, `indicators/indicator-form.ts` y `indicators/chart-data.ts`. Faltan `project-form.ts`, `status.ts`, `plan-form.ts`, `tree.ts`, `objective-assignment.ts`, `lib/api-errors.ts` y los hooks (requieren Testing Library + jsdom).

### `listMembersAction` y `MemberItem` de la página Miembros no coinciden con `MemberDto` (C06)
- **Qué**: `components/members/actions.ts` tipa `MemberItem` con `roleKey`/`roleName` planos, pero la API devuelve `MemberDto` con `role: { key, name }`. C06 usa `MemberDto` directo en su propia action (`listScopeMembersAction`) y no tocó el código viejo.
- **Por qué importa**: si el shape real es el anidado, la página Miembros muestra el rol vacío; si no, la deuda es solo de tipos duplicados.
- **Posible solución**: verificar en dev y reemplazar `MemberItem` por `MemberDto` de `shared-types/core`.
- **Prioridad**: baja.

### Proyectos nuevos en un grupo ponderado se crean con peso 0 (C09)
- Por qué: la API valida el grupo resultante al crear (suma 10000, o todos sin peso). La UI crea el proyecto o tarea nuevo con `weightBp: 0` cuando el grupo está ponderado y el usuario ajusta después con "Editar pesos". Si Pedro prefiere otro flujo (p. ej. endpoint que cree y reparta en un paso), hay que cambiarlo en `features/projects/project-form.ts`.
- ✅ Pedro confirma el flujo tal cual (2026-10-07): no hay cambio previsto. Queda como registro; se puede borrar con su OK.

### Sin tests de `features/projects` por falta de Vitest en `apps/web` (C09)
- Por qué: `weights.ts` (reparto equitativo, parseo de porcentajes en bp), `project-form.ts` (armado de DTOs) y `status.ts` son funciones puras listas para testear, pero web no tiene runner. Se suma al ítem de C06 sobre `apps/web` sin `typecheck` ni Vitest.
- **Actualización (C12)**: `weights.ts` ya tiene tests; quedan `project-form.ts` y `status.ts`.


### Orden de aplicación de `indicator.progress_changed` (C11)
- **Qué**: el oyente de `okr` setea el valor absoluto `objectiveResultProgressBp` del payload (ADR-0009 D5). Si dos commits concurrentes del mismo objetivo emiten eventos y se aplican en orden invertido, `resultProgressCachedBp` queda desfasado hasta el próximo cambio del grupo. Lo mitiga el `pg_advisory_xact_lock` por objetivo en `metrics`, pero no lo cierra.
- **Posible solución**: versión o timestamp monotónico en el payload y descartar en el oyente los eventos más viejos, o que el oyente vuelva a leer el agregado por puerto.
- **Prioridad**: baja.

### DTOs de request de ObjectiveIndicator viven en `apps/api`, los contratos en `shared-types` (C11)
- **Qué**: las clases con `class-validator` están en `metrics/dto/` (como el resto de los módulos); `shared-types/metrics` tiene las interfaces equivalentes y las clases las `implements`. Sin validación compartida con el front (hoy ningún módulo la tiene).
- **Prioridad**: baja.

### Helper de pesos movido a `common/weights` (C11)
- **Qué**: `assertValidWeightGroup` / `assertSameSiblingSet` pasaron de `okr/services/weight-group.ts` a `common/weights/weight-group.ts` para que `metrics` los use sin importar internos de `okr`. `okr/services/weight-group.ts` quedó como re-export; conviene apuntar los imports de `okr` directo a `common` y borrar el re-export.
- **Prioridad**: baja.

## Naming

### Rename completo `gestion-publica` → `gestion-integral`
- **Qué**: renombrar package scope `@gestion-publica/*`, carpeta raíz del repo, repo en GitHub, y proyectos en Auth0/Vercel/Railway.
- **Por qué importa**: documentado en ADR-0008. El producto comercial es "Gestión Integral", el código interno todavía dice "gestion-publica".
- **Posible solución**: ver plan de migración detallado en ADR-0008 D7.
- **Prioridad**: baja. No bloquea ningún usuario. Hacer cuando haya tiempo dedicado y baja carga de feature work.

## Infra

### Custom domain del backend (apigestion.pialab.dev)
- **Qué**: el frontend se sirve en `gestion.pialab.dev` (custom domain), pero el backend sigue en `gestion-publicaapi-production.up.railway.app`.
- **Por qué importa**: documentado en ADR-0007 D3 como "decided, pending implementation". Mejora portabilidad y branding.
- **Posible solución**: configurar custom domain en Railway, ajustar `NEXT_PUBLIC_API_URL` y CORS.
- **Prioridad**: baja. Cosmético, no afecta funcionamiento.

### Controller de Key Result sin ValidationPipe (C05; Task resuelto en C08)
- **Qué**: `KeyResultController` recibe `@Body()` con DTOs de `class-validator` pero sin `ValidationPipe` (ni global en `main.ts`), así que los decoradores no se ejecutan. C05 lo agregó en create/update de `ObjectiveController` y C08 en todo `TaskController` (más los endpoints nuevos de proyectos), porque tocó esos DTOs.
- **Por qué importa**: la regla "validación en el controller" no se cumple en esos endpoints; llegan valores sin validar al service.
- **Posible solución**: `ValidationPipe({ transform: true, whitelist: true })` en esos controllers (o `APP_PIPE` global) y revisar que el front no mande campos extra. KR se elimina o se reescriben en F10, así que puede resolverse ahí.
- **Prioridad**: baja.

### e2e de core rotas en `POST /orgs` (preexistente)
- **Qué**: `core-member.e2e-spec.ts` y `core-module-enablement.e2e-spec.ts` fallan las 6 en el setup: `POST /api/v1/orgs` no devuelve `organization.id` (`Cannot read properties of undefined (reading 'id')`). Pasa igual en `main` (e0072c3), así que no lo introdujo el fix de `:orgId`. Las e2e corren contra la DB de `DATABASE_URL` de dev.
- **Por qué importa**: los caminos de core con header ≠ path no tienen cobertura e2e real; solo los unit con el harness HTTP.
- **Posible solución**: ver qué devuelve hoy `POST /orgs` (shape o guard) y alinear los e2e; correrlos en CI contra una DB descartable.
- **Prioridad**: media.

### Editar un indicador son dos llamadas no atómicas (C12)
- **Qué**: tipo, fuente y descripción viven en la `Metric` (`PATCH metrics/:id`, permiso `metrics:write`) y base, meta y dirección en el `ObjectiveIndicator` (`PATCH okr/indicators/:id`, `okr:write`). `useObjectiveIndicators.updateIndicator` llama primero a la métrica (puede dar 422 `MetricKindChangeBlocked`) y después al indicador; si la segunda falla, la primera queda aplicada. Además un usuario con `okr:write` y sin `metrics:write` no puede cambiar esos tres campos desde el editor del objetivo.
- **Posible solución**: aceptar `kind`/`source`/`description` en `UpdateObjectiveIndicatorDto` y que `metrics` los aplique en la misma transacción (en C11 la creación inline ya exige solo `okr:write`).
- **Prioridad**: baja.

## Resuelto

### Sin CI que corra `next build` antes del merge
- **Qué**: no hay workflows en `.github/workflows/`. Las corridas verifican con `tsc --noEmit` y lint, que no detectan errores propios del build de Next (p. ej. exports no `async` en archivos `'use server'`).
- **Por qué importa**: el merge del PR #12 rompió el deploy de producción en Vercel (`Server Actions must be async functions` en `features/projects/project-actions.ts`) y producción quedó en el deploy anterior sin que se notara.
- **Posible solución**: workflow de GitHub Actions en PRs con `pnpm install`, `pnpm typecheck`, `pnpm lint` y `pnpm --filter web build`; mientras tanto, sumar `pnpm --filter web build` a las verificaciones de las corridas de frontend.
- **Prioridad**: alta.
- **Resolución (2026-10-08)**: `.github/workflows/ci.yml` corre en cada PR y en `main`: install, `prisma:generate`, build de `packages/*`, `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm --filter web build`.

### Lint preexistente: variable sin usar en task.service.spec.ts
- **Qué**: `pnpm --filter api lint` falla con 1 error: `mockKeyResultFindFirst` asignada pero nunca usada en `apps/api/src/modules/okr/services/task.service.spec.ts:61`. Existe en `main` (no lo introdujo la corrida de indicadores M1). Hay además un warning preexistente de `eslint-disable` sin uso en `ai/providers/openai.provider.ts:12`.
- **Por qué importa**: `pnpm --filter api lint` sale con exit 1 por este error ajeno; enmascara errores de lint nuevos en corridas del api.
- **Posible solución**: borrar el mock sin usar (o prefijarlo con `_`) y quitar el `eslint-disable` sobrante. Corrida trivial.
- **Prioridad**: baja. No afecta typecheck, tests ni build (todos verdes).
- **Resolución (2026-10-08)**: se borró el mock sin usar para que `pnpm lint` pase en CI. El warning de `openai.provider.ts` sigue (es warning, no falla).

### Lint preexistente: eslint-module-utils/resolve
- **Qué**: `pnpm --filter web lint` falla con `Cannot find module 'eslint-module-utils/resolve'`.
- **Por qué importa**: bloquea correr lint local; aún no rompe CI porque CI no corre lint (verificar).
- **Posible solución**: investigar incompatibilidad entre `eslint-config-next@16.x` (Next 15+ flat config) y `eslint-plugin-import`. Probable fix: actualizar `eslint-import-resolver-typescript` o downgrade alguno de los dos.
- **Prioridad**: media. Activa cuando alguien intente correr lint local o cuando se quiera meter en CI.
- **Resolución (verificado 2026-10-08)**: `pnpm --filter web lint` corre sin ese error (0 errores, 2 warnings); ya no reproduce.

### Puerto ORG_UNIT_OBJECTIVE_COUNTER con implementación stub (C04 -> C05)
- **Qué**: `PendingObjectiveOrgUnitCounter` devolvía siempre 0 porque `okr.objective.org_unit_id` llegaba recién con C05.
- **Resolución (C05, 2026-10-07)**: `PrismaObjectiveOrgUnitCounter` (`apps/api/src/modules/okr/okr-contracts.module.ts`) cuenta los objetivos vivos con `org_unit_id`, filtrando por `organizationId`, con test. El borrado de una `OrgUnit` con objetivos asignados ya da 409 `OrgUnitHasObjectives`.

### Constraint duplicada `chk_task_weight_bp` en `okr.task` (C08)
- **Qué**: la migración `20261007000003_project_task_project` agregó `chk_task_weight_bp` (peso nulo o 0..10000) sin notar que `chk_task_weight` ya existía con el mismo rango (que además deja pasar NULL).
- **Por qué importa**: redundancia inofensiva; ensucia `\d okr.task`.
- **Posible solución**: `DROP CONSTRAINT chk_task_weight_bp` en una migración futura (la ya aplicada no se edita).
- **Prioridad**: baja.

### La migración KR -> planificación reporta conflictos pero no los resuelve sola (C13)
- **Qué**: `migrate-to-planning.ts` saltea (y reporta como `CONFLICTO`) los KR cuya métrica ya mide otro indicador vivo del mismo objetivo (único parcial objetivo+métrica) y los objetivos con hermanos ya ponderados donde habría que agregar. No hay una acción automática; hay que resolverlos a mano y volver a correr el script (es idempotente).
- **Por qué importa**: con PA-1 respondida (no hay datos reales) no debería pasar; queda como red de seguridad.
- **Posible solución**: ninguna hasta que aparezca un caso real. Se elimina junto con el script en el contract (F10).
- **Prioridad**: baja.
