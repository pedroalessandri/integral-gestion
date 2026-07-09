# syntax=docker/dockerfile:1
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Stage: install deps
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/metrics-domain/package.json ./packages/metrics-domain/
COPY packages/okr-domain/package.json ./packages/okr-domain/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/prisma-tenant-extension/package.json ./packages/prisma-tenant-extension/
RUN pnpm install --frozen-lockfile

# Stage: build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter shared-types build
RUN pnpm --filter metrics-domain build
RUN pnpm --filter okr-domain build
RUN pnpm --filter prisma-tenant-extension build
WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm build

# Stage: runtime
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
