# @gestion-publica/api

NestJS backend for gestion-publica.

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for local Postgres)

## Setup

```bash
# 1. Install workspace dependencies from repo root
pnpm install

# 2. Start local Postgres
cd apps/api
docker compose up -d

# 3. Copy env and edit if needed
cp .env.example .env

# 4. Build workspace packages
pnpm --filter @gestion-publica/shared-types build
pnpm --filter @gestion-publica/prisma-tenant-extension build

# 5. Generate Prisma client
pnpm --filter api prisma:generate

# 6. Apply migrations
cd apps/api && npx prisma migrate dev --name initial

# 7. Start dev server
pnpm --filter api dev
```

## Verification

```bash
# Liveness (always 200 if process is running)
curl http://localhost:3000/api/v1/health

# Readiness (200 + db:connected when DB is up)
curl http://localhost:3000/api/v1/health/ready
```

Expected responses:

```json
// GET /api/v1/health
{"status":"ok","timestamp":"2026-04-21T00:00:00.000Z"}

// GET /api/v1/health/ready
{"status":"ok","db":"connected","timestamp":"2026-04-21T00:00:00.000Z"}
```

## Tests

```bash
pnpm --filter api test        # unit tests (Vitest)
pnpm --filter api test:e2e   # e2e tests (Vitest + supertest, requires DB)
pnpm --filter api typecheck   # tsc --noEmit
pnpm --filter api lint        # ESLint
```

## Architecture notes

- **4 PostgreSQL schemas**: `core`, `auth`, `okr`, `audit` (via Prisma `multiSchema`)
- **Multi-tenant**: all business queries filtered by `organizationId` via Prisma extension
- **Auth**: Auth0 JWT (placeholder values trigger WARN on startup; set real values before enabling guards)
- **Audit**: append-only `audit.event` table (future); `AuditModule` owns ALS infrastructure
- **Versioning**: URI versioning, default v1 (`/api/v1/...`)
