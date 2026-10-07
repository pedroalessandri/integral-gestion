# AGENTS.md

Convenciones compartidas y gotchas del dominio de planificación (módulo técnico `okr`, ADR-0009). Leer antes de tocar código.

## Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos (ts/tsx) | kebab-case | `cascade-calculator.ts`, `objective-card.tsx` |
| Clases | PascalCase | `ObjectiveService`, `KeyResultRepository` |
| Componentes React | PascalCase + `.tsx` | `ObjectiveCard`, `CascadeTree` |
| Funciones/variables | camelCase | `calculateObjectiveProgress` |
| Enums | PascalCase singular | `TaskStatus`, `ObjectivePeriod` |
| Tipos/interfaces | PascalCase, sin prefijo `I` | `Objective`, `CascadeResult` |
| Tablas DB | snake_case plural | `objectives`, `key_results`, `tasks` |
| Columnas DB | snake_case | `organization_id`, `weight_bp` |
| Schemas Postgres | snake_case | `core`, `auth`, `okr`, `audit` |
| Endpoints REST | kebab-case | `/api/v1/objectives/:id/key-results` |
| Variables de entorno | SCREAMING_SNAKE_CASE | `AUTH0_DOMAIN`, `DATABASE_URL` |
| Branches git | `tipo/scope-descripcion` | `feat/okr-cascade`, `fix/auth-role-mapping` |

## Estructura de módulo NestJS

Cada módulo de `apps/api/src/modules/<mod>/` sigue:

```
<mod>/
├── <mod>.module.ts             # NestJS module, exports públicos
├── index.ts                    # superficie pública: tipos/servicios reutilizables
├── controllers/                # HTTP, validación de DTO, auth guards
├── services/                   # lógica de orquestación
├── repositories/               # acceso a Prisma
├── dto/                        # request/response DTOs + class-validator
├── events/                     # eventos de dominio (se consumen en audit, notifs, etc.)
└── __tests__/                  # unit + integration del módulo
```

**Regla de oro**: código fuera del módulo solo puede importar desde `<mod>/index.ts`.

## Estructura de feature Next.js

```
features/okr/
├── components/                 # presentational
├── hooks/                      # data fetching (TanStack Query), client state
├── api/                        # clientes tipados del backend
├── lib/                        # utils del feature
└── types.ts                    # tipos locales (los compartidos van a packages/shared-types)
```

Páginas en `app/` solo orquestan features; no contienen lógica.

## Patrones

- **Data fetching frontend**: TanStack Query. Nada de `useEffect` + `fetch` a mano para requests de negocio.
- **Formularios**: React Hook Form + Zod resolver. Validación compartida con backend vía `packages/shared-types` cuando sea posible.
- **Estado servidor vs cliente**: servidor → TanStack Query. Cliente UI local → `useState` / Zustand si crece.
- **Acceso a DB**: solo por repositorios. Services no usan `prisma.*` directo.
- **Tenant scoping**: todo repository recibe `organizationId` (del `AuthContext`). No hay queries sin scope de org salvo operaciones de superadmin explícitamente marcadas.
- **Auth0 + RBAC local**: el JWT de Auth0 identifica al usuario; los permisos se resuelven contra `auth.role`, `auth.permission`, `core.user_organization_role`. Guard `@Permissions('okr:write')`.
- **Module enablement**: `core.organization_module` habilita módulos por organización. Un guard verifica que el módulo esté habilitado para la org antes de ejecutar endpoints de ese módulo.
- **Audit**: services emiten `DomainEvent` → handler de `audit` persiste en `audit.event` con `actor_id`, `organization_id`, `entity`, `entity_id`, `action`, `diff`, `occurred_at`.
- **Comunicación entre módulos** (ADR-0009 D5):
  - **Validaciones sincrónicas → puertos**: interfaz + token en `apps/api/src/common/contracts/` (ej. `INDICATOR_LINK_READER`, `PROJECT_LINK_READER`, `PERIOD_RANGE_CHECKER_*`). El módulo dueño implementa (solo lectura, solo depende de `PrismaService`) y lo exporta desde un submódulo `@Global()` de contratos; el que valida inyecta el token. Un provider faltante debe fallar al arrancar.
  - **Efectos post-commit → eventos** (`@nestjs/event-emitter`): se emiten después del commit, los oyentes son idempotentes y escriben su propio audit. Nombres y payloads en `shared-types`.
  - **Nunca** validar vía eventos (`emitAsync` sin listener pasa en silencio) ni usar `forwardRef` entre módulos.

## Reglas de dominio (planificación de gobierno, ADR-0009)

### Modelo (5 niveles)

```
Organization
 ├── OrgUnit (árbol central → ministry → area, profundidad ≤ 4)     [N3: visión, misión]
 ├── StrategicPlan (1 activo) └── Axis (0..n)                        [N1, N2]
 ├── Period (configurable por org)
 └── Objective (periodId, orgUnitId, axisId?)                        [N4]
      ├── ObjectiveIndicator (1..n) → Metric → MetricEntry
      │      └── IndicatorTargetPoint (curva manual)
      └── Project (0..n) └── Task (1..n)                              [N5]
             └── ProjectContribution (0..n, solo execution_feeds_indicator)
```

Todo lleva `organization_id`. Un `Objective` pertenece a una `OrgUnit` de tipo `ministry` o `area`. `KeyResult` y `MetricKrLink` están deprecados y se eliminan en el contract (F10): no construir funcionalidad nueva sobre ellos.

### Pesos (todo-o-nada)

- Pesos en **basis points** (`weight_bp`, entero 0–10_000). **Nunca `Float`**.
- Por grupo de hermanos (indicadores de un objetivo, proyectos de un objetivo, tareas de un proyecto): **o todos tienen peso y suman 10_000, o ninguno** y se usa promedio simple. Grupo mixto ⇒ 422 en el service (invariante transaccional, no estado tolerado).
- Promedio simple y ponderado usan la misma regla de redondeo (`Math.trunc` sobre bp), definida una sola vez en `okr-domain`.
- Al pasar de "sin pesos" a "con pesos", la UI propone un reparto equitativo editable.
- Grupo vacío: progreso = 0, no error. **Nunca NaN, nunca null disfrazado de cero en UI** sin indicar "sin indicadores" / "sin proyectos" / "sin tareas".

### Dos lecturas de avance

- **Resultado** (`objective.result_progress_cached_bp`): promedio de sus indicadores. Progreso del indicador = `(actual − base)/(meta − base)` según dirección, acotado a 0–100 (`metrics-domain/progress.ts`).
- **Gestión** (`objective.execution_progress_cached_bp`): promedio de sus proyectos. Proyecto `from_tasks` = promedio de sus tareas; `from_indicator` = progreso de su indicador fuente.
- Cada lectura tiene su desvío contra lo esperado (curva del indicador / avance planificado por fechas) y semáforo (umbrales default 10 y 25 puntos).
- **Prohibido fusionarlas en un número único** (API, DB, UI). Agregación por unidad, eje y plan: promedio simple de objetivos, por lectura.
- El flujo indicador → avance automático del KR se elimina. La cascada pura vive en `packages/okr-domain` (sin Prisma, sin Nest), testeada con Vitest + fast-check.
- Dentro de `okr` el recálculo es síncrono en la misma transacción; lo que cruza a `metrics` (o viene de ahí) va por eventos post-commit (consistencia eventual).

### Vínculo gestión ↔ indicador (`ObjectiveIndicator.linkMode`)

- `independent` (default): sin vínculo. Modo de los indicadores `outcome`.
- `execution_feeds_indicator`: proyectos con `ProjectContribution` crean un `MetricEntry` al llegar al 100% (y uno compensatorio negativo si bajan). Solo `kind = output`.
- `indicator_feeds_execution`: un `Project` `from_indicator` con `sourceObjectiveIndicatorId` toma su avance del indicador; sus tareas son informativas.
- Un par proyecto ↔ indicador no puede usar los dos sentidos. Cambiar `linkMode` con vínculos vigentes ⇒ 422 con la lista de proyectos.
- Base, meta y dirección: manda `ObjectiveIndicator`; `Metric` solo rige en la vista standalone (Módulo 1).

### Período

- Configurable por org: no impone duración y el label (`code`) es libre. **No asumir trimestres ni `YYYY-Qn`**.
- Un `Objective` pertenece a **exactamente un** `Period`. Duplicar a otro período es una acción explícita (endpoint `POST /objectives/:id/clone-to-period`).
- Editar fechas que dejan afuera proyectos, tareas o cargas ⇒ 422 con la lista de entidades afectadas (vía puertos `PERIOD_RANGE_CHECKER_*`); si se acepta, se recalculan los buckets.

### Audit

- Toda mutación (create/update/delete/role-change/module-enable/disable) escribe a `audit.event`.
- `audit.event` es **append-only**. No hay endpoints de UPDATE/DELETE. La DB tiene trigger que rechaza `UPDATE`/`DELETE`.
- Correcciones se hacen con eventos compensatorios, no editando historia.

## Testing

- **Unit** (`packages/okr-domain`): funciones puras de cascada. Property-based con `fast-check` para invariantes:
  - si todas las tareas de un proyecto están al 100%, el proyecto está al 100%.
  - progreso ∈ [0, 100] para cualquier combinación válida de pesos/progresos, ponderado o simple.
  - pesos no-negativos; grupo mixto o sumas ≠ 10_000 ⇒ error de validación (no error de cálculo).
- **Integration** (`apps/api/test/`): endpoints contra DB real (testcontainers Postgres). Cubren multi-tenant scoping, RBAC, module enablement, audit trail.
- **E2E** (Playwright): flujos clave — admin habilita el módulo de planificación para una org; usuario carga avance de una tarea; ve las dos lecturas de avance actualizarse.
- **No mockear Prisma** para tests que tocan lógica transaccional. Usar DB de test.

## Gotchas conocidos del dominio

1. **Redondeo**: redondear solo al render. Si redondeás en cada nivel (task → KR → objective) acumulás error. Guardás `Decimal`, mostrás con `.toFixed(1)` o `.toFixed(2)` según contexto.
2. **Pesos que no suman 100 o grupo mixto**: es un error de validación del lado del service, no una "corrección silenciosa". El usuario verá el error explícito en la UI.
3. **Edición de pesos con progreso existente**: cambiar el peso de un indicador/proyecto/tarea **no** altera su `progress`, pero sí cambia el progreso del padre. Hay que recalcular la rama hacia arriba.
4. **Borrado lógico vs físico**: Objetivos/Proyectos/Tareas/Indicadores/Unidades usan soft-delete (`deleted_at`). Las queries de negocio filtran `deleted_at IS NULL`. El audit log referencia IDs que pueden estar soft-deleted.
5. **Concurrencia**: dos usuarios actualizando tareas del mismo proyecto al mismo tiempo — usar transacción con recálculo atómico del proyecto y el objetivo. Considerar `SELECT ... FOR UPDATE` sobre el proyecto padre.
6. **Task sin proyecto**: no existe (durante la transición puede colgar de un KR legacy). Si aparece el caso de uso de "tarea libre", es otro feature, no este.
7. **Períodos abiertos/cerrados**: un período cerrado no admite edición de avance. Regla de negocio; validar en service.
8. **Timezone**: persistir en UTC; renderizar en `America/Argentina/Buenos_Aires`. Fechas de período se alinean al calendario local.
9. **Currency/locale**: locale `es-AR`. Decimales con coma en UI, punto en persistencia y APIs.
10. **Auth0 claims drift**: si cambian roles en Auth0 dashboard, el JWT actual del usuario sigue con los viejos hasta el refresh. Para cambios de permiso importantes, forzar re-login o consultar RBAC local en cada request en vez de confiar solo en claims del JWT.

## Herramientas recomendadas (sin atarse a versiones aquí)

- `@nestjs/*`, `@prisma/client`, `prisma`, `class-validator`, `class-transformer`, `zod`
- `next`, `react`, `tailwindcss`, `@radix-ui/*` (via shadcn/ui), `@tanstack/react-query`, `react-hook-form`
- `vitest`, `@vitest/coverage-v8`, `fast-check`, `@playwright/test`, `testcontainers`
- `turbo`, `pnpm`, `eslint`, `prettier`, `typescript`
