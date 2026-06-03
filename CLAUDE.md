# gestion-publica

## Descripción

Aplicación web modular para gestión de organizaciones.

**Primer módulo funcional**: OKR (Objetivos → Key Results ponderados → Tareas ponderadas; el avance cascadea hacia arriba).

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
4. **No introducir jerarquía organizacional / alineación vertical de Objetivos** sin decisión explícita del dueño. Por ahora no hay cascada entre unidades.
5. **No asumir que un Objetivo vive en varios períodos**. Un Objetivo pertenece a **exactamente un** período (Q). Duplicar para otro período es una acción explícita del usuario.
6. **No meter lógica de negocio en controllers ni en componentes React**. Backend → services. Frontend → hooks/feature modules; los componentes son de presentación.
7. **No usar `Float`/`number` para pesos o porcentajes**. Siempre `Decimal`.
8. **No crear endpoints sin guard de auth + tenant scoping**. Default deny.
9. **No commitear `.env`, credenciales, ni tokens**. `.env.example` sí.
10. **No hacer `git push --force` a `main`** ni amend a commits publicados.
11. **No instalar dependencias pesadas sin justificación** (Moment, Lodash completo, UI kits redundantes con shadcn/ui). Preferir utilidades nativas / date-fns / remeda.
12. **No crear nuevos archivos .md de docs** a menos que el usuario lo pida. `CLAUDE.md` y `AGENTS.md` son la única doc viva de base.
13. **No saltar tests ni type-check** antes de marcar una tarea como terminada.

## Notas de dominio OKR (resumen — detalle completo en AGENTS.md)

- **Ciclos**: trimestrales (Q). Un Objetivo pertenece a un período único.
- **Jerarquía entre unidades**: fuera de alcance por ahora.
- **Audit log**: activo desde el arranque.
- **Cascada siempre por tareas**: incluso los KR de métrica se modelan creando tareas que representen los hitos de la métrica. **No hay** entrada directa de "% del KR"; el % de un KR se deriva siempre de sus tareas.

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
