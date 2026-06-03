# AGENTS.md

Convenciones compartidas y gotchas del dominio OKR. Leer antes de tocar código.

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

## Reglas de dominio OKR

### Modelo

```
Organization 1—N Period
Organization 1—N Objective
Objective     N—1 Period            (un objetivo → un período)
Objective     1—N KeyResult
KeyResult     1—N Task
```

Todo lleva `organization_id`.

### Pesos

- Pesos se guardan como **basis points** (`weight_bp`, entero 0–10_000 = 0.00%–100.00%) o como `Decimal(5,2)`. **Nunca `Float`**.
- Suma de pesos de KRs de un mismo Objetivo = **10_000 bp (100%)**. Validado en service antes de persistir.
- Suma de pesos de Tareas de un mismo KR = **10_000 bp (100%)**. Misma validación.
- Un Objetivo sin KRs: progreso = 0%, no error.
- Un KR sin tareas: progreso = 0%, no error. **Nunca NaN, nunca null disfrazado de cero en UI sin indicar "sin tareas"**.

### Cascada

Con `p_i` = progreso de la tarea i (0–100), `w_i` = peso de la tarea i en bp:

```
progressKR = Σ(p_i * w_i) / 10_000
progressObjective = Σ(progressKR_j * wKR_j) / 10_000
```

- Vive en `packages/okr-domain` como **funciones puras** (sin Prisma, sin Nest). Se testea con Vitest + fast-check (property-based).
- El resultado se persiste denormalizado en `objective.progress_cached` y `key_result.progress_cached` para evitar recalcular en lecturas.
- Recalculado al mutar una tarea, KR, o peso: dispatch síncrono en la misma transacción.

### Período

- Formato: `YYYY-Qn` (ej: `2026-Q2`). Un `Period` pertenece a una `Organization`.
- Un `Objective` pertenece a **exactamente un** `Period`. Duplicar a otro período es una acción explícita (endpoint `POST /objectives/:id/clone-to-period`).

### Tipos de KR

- Solo existe un tipo efectivo: **"por tareas"**. Los KR de métrica (ej: "llegar a 10.000 usuarios") se representan creando tareas que modelen los hitos de esa métrica (ej: "llegar a 2.500", "llegar a 5.000", etc.) con sus pesos.
- **No** hay campo `progress` editable directamente en KR desde la UI. El % sale de las tareas.

### Audit

- Toda mutación (create/update/delete/role-change/module-enable/disable) escribe a `audit.event`.
- `audit.event` es **append-only**. No hay endpoints de UPDATE/DELETE. La DB tiene trigger que rechaza `UPDATE`/`DELETE`.
- Correcciones se hacen con eventos compensatorios, no editando historia.

## Testing

- **Unit** (`packages/okr-domain`): funciones puras de cascada. Property-based con `fast-check` para invariantes:
  - si todas las tareas de un KR están al 100%, el KR está al 100%.
  - progreso ∈ [0, 100] para cualquier combinación válida de pesos/progresos.
  - pesos no-negativos; sumas de pesos ≠ 10_000 ⇒ error de validación (no error de cálculo).
- **Integration** (`apps/api/test/`): endpoints contra DB real (testcontainers Postgres). Cubren multi-tenant scoping, RBAC, module enablement, audit trail.
- **E2E** (Playwright): flujos clave — admin habilita módulo OKR para una org; usuario carga avance de una tarea; ve el progreso cascadear en el tree.
- **No mockear Prisma** para tests que tocan lógica transaccional. Usar DB de test.

## Gotchas conocidos del dominio OKR

1. **Redondeo**: redondear solo al render. Si redondeás en cada nivel (task → KR → objective) acumulás error. Guardás `Decimal`, mostrás con `.toFixed(1)` o `.toFixed(2)` según contexto.
2. **Pesos que no suman 100**: es un error de validación del lado del service, no una "corrección silenciosa". El usuario verá el error explícito en la UI.
3. **Edición de pesos con progreso existente**: cambiar el peso de un KR/Task **no** altera su `progress`, pero sí cambia el progreso del padre. Hay que recalcular la rama hacia arriba.
4. **Borrado lógico vs físico**: Objetivos/KRs/Tareas usan soft-delete (`deleted_at`). Las queries de negocio filtran `deleted_at IS NULL`. El audit log referencia IDs que pueden estar soft-deleted.
5. **Concurrencia**: dos usuarios actualizando tareas del mismo KR al mismo tiempo — usar transacción con recálculo atómico del KR y Objetivo. Considerar `SELECT ... FOR UPDATE` sobre el KR padre.
6. **Task sin KR**: no existe. Toda tarea cuelga de un KR. Si aparece el caso de uso de "tarea libre", es otro feature, no este.
7. **Períodos abiertos/cerrados**: un período cerrado no admite edición de avance. Regla de negocio; validar en service.
8. **Timezone**: persistir en UTC; renderizar en `America/Argentina/Buenos_Aires`. Fechas de período se alinean al calendario local (Q2 2026 = abril–junio local).
9. **Currency/locale**: locale `es-AR`. Decimales con coma en UI, punto en persistencia y APIs.
10. **Auth0 claims drift**: si cambian roles en Auth0 dashboard, el JWT actual del usuario sigue con los viejos hasta el refresh. Para cambios de permiso importantes, forzar re-login o consultar RBAC local en cada request en vez de confiar solo en claims del JWT.

## Herramientas recomendadas (sin atarse a versiones aquí)

- `@nestjs/*`, `@prisma/client`, `prisma`, `class-validator`, `class-transformer`, `zod`
- `next`, `react`, `tailwindcss`, `@radix-ui/*` (via shadcn/ui), `@tanstack/react-query`, `react-hook-form`
- `vitest`, `@vitest/coverage-v8`, `fast-check`, `@playwright/test`, `testcontainers`
- `turbo`, `pnpm`, `eslint`, `prettier`, `typescript`
