# gestion-publica

Web application for modular organization management. Modular backoffice with Auth0 authentication, local RBAC, and per-organization module enablement.

## Overview

`gestion-publica` is a multi-tenant monorepo serving N organizations from a single instance. Every business entity carries `organizationId`; tenant scoping is enforced at the Prisma layer and by NestJS guards.

The first functional module is **OKR**: Objectives have weighted Key Results, which have weighted Tasks. Progress cascades bottom-up from Tasks to KRs to Objectives using pure math functions (`packages/okr-domain`). KR progress is always derived from Tasks — there is no direct percentage entry on a KR.

The stack is closed: NestJS + Prisma + PostgreSQL on the backend, Next.js (App Router) + shadcn/ui on the frontend, Auth0 for authentication only (roles/permissions live in the local DB), pnpm workspaces + Turborepo for the monorepo.

## Architecture

```
               ┌──────────────────┐
               │      Auth0       │  (authentication only)
               └────────┬─────────┘
                        │ JWT
                        ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│  Next.js    │───▶│   NestJS     │───▶│   PostgreSQL     │
│  apps/web   │    │   apps/api   │    │  schemas:        │
│  :3001      │    │  :3000       │    │  core, auth,     │
│             │    │              │    │  okr, audit      │
└─────────────┘    └──────┬───────┘    └──────────────────┘
                          │
                          ▼
              ┌───────────────────────────┐
              │  packages/okr-domain      │  (pure cascade math)
              │  packages/shared-types    │  (DTOs, enums)
              │  packages/prisma-tenant-extension  (multi-tenant)
              └───────────────────────────┘
```

Request flow: browser → Next.js (SSR/CSR) → NestJS API (Auth0 JWT + tenant guard + RBAC guard) → Prisma (with tenant extension) → Postgres.

## Prerequisites

- **Node.js** >= 20 (LTS).
- **pnpm** 9.15.4 (pinned via `packageManager` field — use `corepack enable`).
- **Docker Desktop** (for the Postgres container). On Windows, run Docker Desktop with WSL 2 integration enabled for your distro.
- **WSL 2** (if on Windows). Ubuntu 22.04 or newer recommended.
- **Git**.

Optional but helpful:
- `psql` CLI (for direct DB access outside the container).
- Prisma VSCode extension.

## Prerequisitos y herramientas recomendadas

**Obligatorio:**

- **Node.js 20 o superior** (LTS). Verificar con `node --version`.
- **pnpm** — habilitarlo vía `corepack enable` (queda fijado a la versión declarada en `packageManager`).
- **Docker Desktop** (Windows/Mac) o **Docker Engine** (Linux). En Windows con WSL, activar *WSL Integration* para la distro donde corre el proyecto.
- **Git**.

**Recomendado para soporte / debugging:**

- **postgresql-client (`psql`)** — para consultar la DB local o la de producción en Railway sin depender del contenedor.
  ```bash
  sudo apt install -y postgresql-client
  ```
- **`jq`** — para parsear JSON en terminal (útil al inspeccionar respuestas de la API o tokens de Auth0).
  ```bash
  sudo apt install -y jq
  ```
- **GitHub CLI (`gh`)** — cómodo para hacer push, abrir PRs y autenticarse sin lidiar con tokens personales. Instalación según plataforma en <https://cli.github.com/>.

## First-time setup

```bash
# 1. Clone
git clone <repo-url> gestion-publica
cd gestion-publica

# 2. Enable corepack so pnpm is pinned to the workspace version
corepack enable

# 3. Install dependencies for the entire workspace
pnpm install

# 4. Copy env files and fill them in
cp apps/api/.env.example apps/api/.env
#   edit apps/api/.env — set AUTH0_ISSUER_BASE_URL, AUTH0_AUDIENCE,
#   CORE_BOOTSTRAP_SUPERADMIN_EMAIL (your Auth0 email).

# apps/web uses .env.local. Create one with at minimum:
#   AUTH0_SECRET=<32-byte hex; generate with `openssl rand -hex 32`>
#   APP_BASE_URL=http://localhost:3001
#   AUTH0_DOMAIN=<your-tenant>.us.auth0.com
#   AUTH0_CLIENT_ID=<from Auth0 Application>
#   AUTH0_CLIENT_SECRET=<from Auth0 Application>
#   NEXT_PUBLIC_AUTH0_AUDIENCE=<matches AUTH0_AUDIENCE on the API>
#   NEXT_PUBLIC_API_URL=http://localhost:3000

# 5. Start Postgres
cd apps/api
docker compose up -d
cd ../..

# 6. Generate Prisma client and run migrations
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy

# 7. First-run bootstrap — the API on first start seeds the superadmin
#    user from CORE_BOOTSTRAP_SUPERADMIN_EMAIL. Make sure that email
#    matches the user you will log in as via Auth0.
```

### Auth0 configuration pointers

In the Auth0 dashboard:

1. **Regular Web Application** (for `apps/web`):
   - Allowed Callback URLs: `http://localhost:3001/auth/callback`
   - Allowed Logout URLs: `http://localhost:3001`
   - Allowed Web Origins: `http://localhost:3001`
2. **API** (audience consumed by `apps/api`):
   - Identifier (audience) must match `AUTH0_AUDIENCE` (api) and `NEXT_PUBLIC_AUTH0_AUDIENCE` (web).
   - Enable RBAC and "Add Permissions in the Access Token" if using Auth0 permissions (RBAC resolution still happens locally; Auth0 only authenticates).

## Daily workflow

Open three terminals. El orden importa: la DB primero, luego la API, y por último el frontend (el frontend pega contra la API desde el boot del server de Next.js).

```bash
# Terminal 1 — database (Postgres en Docker, puerto 5432)
cd apps/api
docker compose up -d
docker compose logs -f postgres   # optional: tail logs

# Terminal 2 — backend (NestJS, port 3000)
pnpm --filter api dev

# Terminal 3 — frontend (Next.js dev server, port 3001)
pnpm --filter web dev
```

Notas:

- **`apps/web/.env.local` tiene que estar configurado** antes de levantar el frontend. Variables mínimas listadas en [First-time setup](#first-time-setup) (paso 4): `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `NEXT_PUBLIC_AUTH0_AUDIENCE`, `NEXT_PUBLIC_API_URL`. Cambios en `.env.local` requieren reiniciar el dev server — Next.js solo las lee al boot.
- **La app web depende de la API corriendo primero**. Si la API no está arriba en `http://localhost:3000`, las requests desde `apps/web` fallan con `ECONNREFUSED` o 502.
- **Auth0 tiene que tener configurados los callbacks para `localhost:3001`**: `Allowed Callback URLs = http://localhost:3001/auth/callback`, `Allowed Logout URLs = http://localhost:3001`, `Allowed Web Origins = http://localhost:3001`. Ver [Auth0 configuration pointers](#auth0-configuration-pointers) más arriba.

Visit `http://localhost:3001`. Log in via Auth0 with the email you set as `CORE_BOOTSTRAP_SUPERADMIN_EMAIL`.

To stop:
```bash
# Ctrl+C in terminals 2 and 3, then:
cd apps/api && docker compose down          # keeps the volume
# or: docker compose down -v                # wipes the DB volume
```

## Troubleshooting

### WSL DNS resolution failing (pnpm install, npm registry timeouts, docker pulls)

Symptoms: `getaddrinfo EAI_AGAIN`, `ETIMEDOUT` to `registry.npmjs.org`, `hub.docker.com` unreachable.

Quick fix:
```bash
sudo sh -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf'
```

Permanent fix — prevent WSL from regenerating `/etc/resolv.conf` on restart:
```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[network]
generateResolvConf = false
EOF

# From Windows PowerShell:
wsl --shutdown
# Reopen WSL, then recreate /etc/resolv.conf once with 8.8.8.8.
```

### EADDRINUSE on port 3000 or 3001

A previous `nest start` or `next dev` did not shut down cleanly.

```bash
# Find and kill the stale process
pkill -f "nest start"
pkill -f "next dev"

# Or, more surgical:
lsof -i :3000
lsof -i :3001
kill -9 <pid>
```

### Docker container not running

```bash
docker ps                                  # list running containers
docker ps -a                               # include stopped ones

# Restart:
cd apps/api
docker compose up -d
docker compose restart postgres

# Inspect health:
docker inspect --format='{{.State.Health.Status}}' gestion_publica_postgres
```

If the container is healthy but the API still can't connect, verify `DATABASE_URL` in `apps/api/.env` points to `localhost:5432` with user `gp_user` and DB `gestion_publica`.

### Prisma migrations out of sync

Symptoms: `P3005` (database schema is not empty), `P3009` (failed migration), or `Drift detected`.

```bash
# Check current state
cd apps/api
pnpm prisma migrate status

# If a migration failed mid-way, mark it resolved after fixing:
pnpm prisma migrate resolve --rolled-back <migration-name>
# or
pnpm prisma migrate resolve --applied <migration-name>

# As a last resort in local dev (DESTROYS DATA):
pnpm prisma migrate reset
```

Never `migrate reset` against shared or production databases.

### Auth0 callback mismatch

Symptoms: after login you land on an Auth0 error page mentioning `callback URL mismatch`.

Checklist:
1. `APP_BASE_URL` in `apps/web/.env.local` must match exactly the origin where you browse (`http://localhost:3001`, no trailing slash).
2. In the Auth0 Application settings, `http://localhost:3001/auth/callback` must be listed in **Allowed Callback URLs**.
3. `AUTH0_DOMAIN` must not include `https://` or trailing path.
4. `NEXT_PUBLIC_AUTH0_AUDIENCE` (web) and `AUTH0_AUDIENCE` (api) must be byte-identical.

After changing env values, restart the Next.js dev server — `.env.local` is only read at boot.

## Useful commands cheat sheet

```bash
# Workspace-wide
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# API — Prisma
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev            # create + apply a new migration (dev)
pnpm --filter api prisma:migrate:deploy         # apply existing migrations (prod-safe)
pnpm --filter api prisma:studio                 # GUI at http://localhost:5555

# API — tests
pnpm --filter api test
pnpm --filter api test:e2e

# Shared packages
pnpm --filter @gestion-publica/okr-domain test
pnpm --filter @gestion-publica/shared-types build
pnpm --filter @gestion-publica/prisma-tenant-extension typecheck

# Direct DB shell
docker exec -it gestion_publica_postgres psql -U gp_user -d gestion_publica

# Inside psql — handy:
#   \dn              list schemas
#   \dt core.*       list tables in schema core
#   \d+ okr.objective
#   SELECT * FROM audit.event ORDER BY created_at DESC LIMIT 20;

# Docker
docker compose -f apps/api/docker-compose.yml up -d
docker compose -f apps/api/docker-compose.yml down
docker compose -f apps/api/docker-compose.yml logs -f postgres

# Per-package scripts (generic)
pnpm --filter <pkg> build
pnpm --filter <pkg> test
pnpm --filter <pkg> typecheck
```

## Where is what

| Path | Purpose |
|---|---|
| `apps/api/` | NestJS backend. Modules: `core`, `auth`, `audit`, `okr`. Prisma schema at `apps/api/prisma/schema.prisma`. |
| `apps/web/` | Next.js App Router frontend. Route groups `(public)` and `(admin)`. Port 3001. |
| `packages/okr-domain/` | Pure cascade math (no Prisma, no Nest). Where `progressKR` and `progressObjective` live. |
| `packages/shared-types/` | Cross-cutting DTOs and enums shared between api and web. |
| `packages/prisma-tenant-extension/` | Prisma client extension enforcing `organizationId` scoping on business queries. |
| `packages/ui/` | Shared shadcn/ui components. |
| `packages/config-eslint/`, `packages/config-tsconfig/` | Shared tooling configs. |
| `docs/adr/` | Architecture Decision Records — one file per structural decision. |
| `docs/specs/` | Feature specifications consumed by the architect → backend → frontend agent pipeline. |
| `CLAUDE.md`, `AGENTS.md` | Project conventions and OKR domain rules. Read before touching code. |
| `apps/api/docker-compose.yml` | Postgres 16 service (`gestion_publica_postgres`, user `gp_user`, db `gestion_publica`). |

## Architecture Decision Records

Each ADR under `docs/adr/` documents a structural decision. Read them before proposing changes that cross module boundaries.

- `docs/adr/0001-*.md` — Multi-tenancy: Prisma extension + NestJS guard model for `organizationId` enforcement.
- `docs/adr/0002-*.md` — Auth0 integration and local RBAC: JWT verification, claims-to-role resolution, `@Permissions()` guard.
- `docs/adr/0003-*.md` — OKR cascade math: pure functions in `packages/okr-domain`, denormalized `progress_cached`, synchronous recompute in-transaction.
- `docs/adr/0004-*.md` — Audit log: append-only `audit.event`, DB trigger blocking `UPDATE`/`DELETE`, compensating events for corrections.

(The exact filenames include kebab-case slugs; browse `docs/adr/` for the full list.)

## Conventions (quick pointers)

- TypeScript strict. No `any` without justification.
- Files `kebab-case.ts`; classes `PascalCase`; enums `PascalCase` singular.
- NestJS modules are self-contained: import another module only via its public `index.ts`. No `../okr/internal/...` imports.
- OKR weights and percentages: `Prisma.Decimal` or integer basis points (`weight_bp`, 0–10_000). Never `Float`.
- Every business query filters by `organizationId`. Default deny on endpoints without auth + tenant guard.
- `audit.event` is append-only. Corrections are compensating events.
- Conventional Commits, scope = affected module. No `git push --force` to `main`, no `--no-verify`.

Full conventions: see `CLAUDE.md` and `AGENTS.md`.
