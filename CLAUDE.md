# gestion-publica

## Idioma

Respondé siempre en español rioplatense (voseo): reportes, preguntas, WAITING FOR APPROVAL, bitácora y mensajes de commit. Esto aplica también a todos los subagentes.

## Descripción

Aplicación web modular para gestión de organizaciones.

**Primer módulo funcional**: planificación de gobierno en 5 niveles (ADR-0009): Visión → Ejes → Visión/misión por unidad → Objetivos estratégicos con indicadores → Proyectos y tareas. El nombre técnico del módulo sigue siendo `okr`.

**Alcance transversal**: backoffice admin-only para gestión de usuarios, roles, permisos y habilitación de módulos por organización. Autenticación delegada a Auth0; RBAC y habilitación de módulos viven en la DB local.

**Multi-tenant desde el día 1**: una instancia, N organizaciones. Toda entidad de negocio lleva `organizationId`.

Diseñado desktop-first con responsive móvil.

## Stack

| Capa | Elección |
|---|---|
| Backend | **NestJS** (TypeScript, modular, DI) |
| ORM | **Prisma** |
| DB | **PostgreSQL** con schemas por módulo (`core`, `auth`, `okr`, `audit`) |
| Frontend | **Next.js** (App Router) + **shadcn/ui** + Tailwind |
| Auth | **Auth0** (autenticación); RBAC + module enablement en DB local |
| Monorepo | **pnpm workspaces + Turborepo** |
| Testing | **Vitest** (unit + integration) + **Playwright** (e2e) |
| Runtime | Node.js LTS (≥ 20) |
| Linter / formatter | ESLint + Prettier |

## Estructura

```
gestion-publica/
├── apps/
│   ├── api/                          # NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── core/             # orgs, users, module-enablement
│   │   │   │   ├── auth/             # Auth0 integration, guards, RBAC
│   │   │   │   ├── audit/            # audit log append-only
│   │   │   │   └── okr/              # objetivos, KRs, tareas, cascada
│   │   │   ├── common/               # guards, interceptors, filters, decorators
│   │   │   ├── config/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── test/                     # e2e + integration tests
│   └── web/                          # Next.js (App Router)
│       └── src/
│           ├── app/
│           │   ├── (public)/         # front público — carga avance + visualización cascada
│           │   └── (admin)/          # backoffice admin-only
│           ├── features/             # feature folders (okr, admin, ...)
│           ├── components/           # compartidos de app
│           └── lib/                  # api client, auth helpers, utils
├── packages/
│   ├── shared-types/                 # DTOs, enums, contratos api↔web
│   ├── okr-domain/                   # lógica pura de cascada (reutilizable, testeable sin DB)
│   ├── deviation-domain/             # desvío contra lo esperado y semáforo (RN-P9), común a resultado y gestión
│   ├── ui/                           # componentes shadcn/ui compartidos
│   ├── config-eslint/
│   └── config-tsconfig/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── CLAUDE.md
└── AGENTS.md
```

Una sola app Next.js con **route groups** `(public)` y `(admin)`. Si más adelante se justifica separar por superficie de ataque o deploy, se parte en `apps/admin`.

## Comandos

```bash
pnpm install                     # instala todo el workspace

# dev
pnpm dev                         # turbo dev (api + web en paralelo)
pnpm --filter api dev
pnpm --filter web dev

# build / type / lint
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format

# tests
pnpm test                        # unit + integration (vitest)
pnpm test:watch
pnpm test:e2e                    # playwright
pnpm --filter okr-domain test    # tests puros de cascada

# prisma
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:studio
```

## Convenciones

- **TypeScript estricto** (`strict: true`, `noUncheckedIndexedAccess: true`). Prohibido `any` salvo justificación documentada.
- **Archivos**: `kebab-case.ts`. **Clases/Componentes**: `PascalCase`. **Variables/funciones**: `camelCase`. **Enums**: `PascalCase` singular.
- **Módulos NestJS** autocontenidos: un módulo **no** importa archivos internos de otro. Si necesita algo de otro módulo, lo hace vía la API pública exportada por el `Module`.
- **DTOs** con `class-validator` + `class-transformer`. Validación en el borde (controller); los services confían en tipos.
- **Errores**: excepciones tipadas, `HttpException` o derivadas. No devolver `null` como "error silencioso".
- **Decimales** en OKR (% y pesos): **`Prisma.Decimal`**, nunca `Float`/`number`. Redondeo solo en la capa de presentación.
- **Multi-tenant**: toda query de negocio filtra por `organizationId`. Implementado vía **Prisma extension** + guard de Nest que inyecta el contexto.
- **AuthContext en guards**: los guards nuevos deben leer `AuthContext` desde `request.authContext` (`ExecutionContext` → `getRequest()`), con `tenantContextStorage.getStore()` **solo** como fallback — nunca leer solo del ALS. La propagación de ALS a los guards no es confiable (igual que en `@CurrentUser`). Ejemplo del bug: `SuperadminOnlyGuard` rechazaba superadmins legítimos con `'SuperadminRequired'` por leer solo de `getStore()`.
- **Audit log**: append-only. Toda mutación sobre Objetivos/KRs/Tareas/roles escribe a `audit.event`. Prohibido `UPDATE`/`DELETE` sobre esa tabla.

## Commits

Conventional Commits. Scope = módulo afectado.

```
feat(okr): cascada de avance de tareas a KR
fix(auth): corregir mapeo de roles Auth0 → permisos locales
test(okr-domain): property-based tests de cascada ponderada
chore(api): bump prisma a 5.x
docs: actualizar estructura en CLAUDE.md
```

- Una unidad lógica por commit.
- Mensajes en español o inglés, consistente dentro del PR.
- **Nunca** `--no-verify`. Si un hook falla, se arregla la causa.

## Reglas para agentes (qué NO hacer)

1. **No romper boundaries de módulo**. Un módulo importa otro **solo** por su superficie pública (interfaces/DTOs exportados desde `index.ts` del módulo). Nada de `import { X } from '../okr/internal/...'`.
2. **No mockear Prisma en tests de cascada**. La lógica pura de cascada vive en `packages/okr-domain` y se testea sin DB; los tests de integración usan una DB real (testcontainers o DB de test).
3. **No tocar `audit.event` con UPDATE/DELETE**. Es append-only por diseño. Si algo "hay que corregir", se emite un evento compensatorio.
4. **La jerarquía es `OrgUnit` según ADR-0009; no agregar otra**. No hay cascada de avance entre unidades: la agregación por unidad, eje y plan es el promedio simple de los objetivos, por lectura.
5. **No asumir que un Objetivo vive en varios períodos**. Un Objetivo pertenece a **exactamente un** período. El período es configurable por org (anual, semestral, plurianual, etc.; label libre; ADR-0009 D7): no asumir trimestres ni formato `YYYY-Qn`. Duplicar para otro período es una acción explícita del usuario.
6. **No meter lógica de negocio en controllers ni en componentes React**. Backend → services. Frontend → hooks/feature modules; los componentes son de presentación.
7. **No usar `Float`/`number` para pesos o porcentajes**. Siempre `Decimal`.
8. **No crear endpoints sin guard de auth + tenant scoping**. Default deny.
9. **No commitear `.env`, credenciales, ni tokens**. `.env.example` sí.
10. **No hacer `git push --force` a `main`** ni amend a commits publicados.
11. **No instalar dependencias pesadas sin justificación** (Moment, Lodash completo, UI kits redundantes con shadcn/ui). Preferir utilidades nativas / date-fns / remeda.
12. **No crear nuevos archivos .md de docs** a menos que el usuario lo pida. La doc viva de base es `CLAUDE.md` y `AGENTS.md`; además se permiten `plan.md`, `bitacora.md` y `docs/features/*`.
13. **No saltar tests ni type-check** antes de marcar una tarea como terminada.
14. Los agentes pueden pushear ramas de feature y abrir PRs con `gh pr create --base main --fill`. Nunca mergear, nunca pushear a main y nunca usar --force.
15. **Validaciones entre módulos: vía puertos (`common/contracts`), nunca vía eventos. Eventos solo para efectos post-commit.** Los puertos son interfaces + token de inyección en `apps/api/src/common/contracts/`; los oyentes de eventos son idempotentes y escriben su propio audit (ADR-0009 D5).

## Notas de dominio (resumen — detalle completo en AGENTS.md y ADR-0009)

- **5 niveles**: N1 Visión de gobierno (`StrategicPlan`, 1 activo por org) → N2 Ejes opcionales (`Axis`) → N3 Visión y misión por unidad (`OrgUnit`: `central` → `ministry` → `area`, profundidad ≤ 4) → N4 Objetivo estratégico (`Objective`, 1..n indicadores) → N5 Proyectos (`Project`) y tareas (`Task`, Gantt). N1–N3 no se miden.
- **Período**: un Objetivo pertenece a exactamente un período, configurable por org.
- **Dos lecturas de avance por objetivo, nunca fusionadas**: **resultado** (`resultProgressCachedBp`, desde sus indicadores) y **gestión** (`executionProgressCachedBp`, desde sus proyectos). Cada una con su desvío contra lo esperado. **Prohibido** combinarlas en un número único en API, DB o UI.
- **Ponderación todo-o-nada por grupo de hermanos** (indicadores de un objetivo, proyectos de un objetivo, tareas de un proyecto): o todos tienen `weightBp` y suman 10000, o ninguno y se usa promedio simple. Un grupo mixto es inválido (422), no un estado tolerado.
- **Vínculo gestión ↔ indicador** (`ObjectiveIndicator.linkMode`): `independent` (default), `execution_feeds_indicator` (proyectos con `ProjectContribution` suman al indicador al completarse; solo `kind = output`) o `indicator_feeds_execution` (un `Project` `from_indicator` toma su avance del indicador; sus tareas son informativas).
- **Base y meta**: manda `ObjectiveIndicator`; `Metric` solo rige en la vista standalone.
- **Transición**: expand → migrate → contract. `KeyResult` y `MetricKrLink` siguen vivos hasta el contract (F10); no construir funcionalidad nueva sobre ellos.

## Glosario UI ↔ código

La UI usa los términos de planificación de gobierno; el código mantiene nombres técnicos (no renombrar, ADR-0009 D1).

| Término UI | Código (modelo Prisma / tabla) |
|---|---|
| Visión general de gobierno / Plan de gobierno | `StrategicPlan` / `planning.strategic_plan` |
| Eje | `Axis` / `planning.axis` |
| Unidad (central, ministerio/secretaría, área/dirección) | `OrgUnit` (`kind`: `central` \| `ministry` \| `area`) / `core.org_unit` |
| Objetivo estratégico | `Objective` / `okr.objective` |
| Indicador (del objetivo) | `ObjectiveIndicator` (vínculo con base, meta y curva) → `Metric` (serie) |
| Carga de indicador | `MetricEntry` |
| Curva esperada | `ObjectiveIndicator.expectedCurveMode` + `IndicatorTargetPoint` |
| Indicador de contexto | `MetricObjectiveContext` |
| Proyecto | `Project` / `okr.project` |
| Tarea | `Task` / `okr.task` |
| Aporte de proyecto a indicador | `ProjectContribution` |
| Avance de resultado / Avance de gestión | `resultProgressCachedBp` / `executionProgressCachedBp` |
| Período | `Period` / `core.period` |
| Módulo de planificación | módulo Nest, schema y paquete `okr` / `okr-domain` |

Las etiquetas de UI viven en un diccionario centralizado (ADR-0006 D2), no hardcodeadas en componentes.

## TODO.md handling

This project maintains a TODO.md at the repo root with pending work items.
When working here:

- If you discover a new bug, feature need, or refactor opportunity during a corrida that's NOT being addressed in the current PR, add it to TODO.md with the appropriate prefix ([F]/[B]/[R]/[I]) and priority section. Default priority is "media" if not specified.
- After completing a corrida (PR merged), move the corresponding TODO item from its priority section to "Recientemente completados" with the merge date.
- Never delete TODO items without my approval — only move them to Completados or ask me first.
- Never modify the priority of an existing item unless I tell you to.
- TODO items are distinct from tech debt: tech debt goes in docs/tech-debt.md (lint, refactors, naming, missing tests). TODO is for pending work with visible value.

## docs/tech-debt.md handling

Same lifecycle rules as TODO.md but for code-level debt. When you identify debt during a corrida (e.g., a flagged-but-unchanged note), add the item to docs/tech-debt.md.
