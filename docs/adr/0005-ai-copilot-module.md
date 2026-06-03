# 0005 — Módulo AI Copilot (draft + validate SMART)

**Status**: Proposed
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-24
**Author**: architect subagent
**Spec**: N/A — derivado de decisiones pre-tomadas por el product owner (Pedro) para incorporar un copilot de IA que asista al redactado y validación SMART de Objetivos y Key Results.

---

> **Nota de revisión**: Este ADR fue redactado originalmente para un caso de uso de organización del sector público (contexto GCBA). Las decisiones técnicas documentadas siguen vigentes para cualquier organización adoptante. El problem statement, ejemplos y justificaciones fueron actualizados en una revisión posterior para reflejar la naturaleza agnóstica de la plataforma.

## Context and problem

Los usuarios que cargan Objetivos y Key Results en `gestion-publica` chocan con una dificultad recurrente: redactar enunciados que cumplan el estándar **SMART** (Specific, Measurable, Achievable, Relevant, Time-bound). En la práctica, esto se traduce en objetivos vagos o ambiguos, métricas no medibles, confusión entre outputs y outcomes, verbos débiles sin línea base, y KRs que no cascadean bien por falta de tareas correctamente descompuestas.

La propuesta es incorporar un **AI copilot** que actúe en dos modos acotados (sin chat abierto en MVP):

1. **Draft**: el usuario da un hint breve ("quiero mejorar el tiempo de respuesta al cliente") y el LLM redacta una propuesta de Objetivo o KR usando el contexto de la organización (misión, visión, valores).
2. **Validate**: el usuario escribe un Objetivo o KR y el LLM devuelve feedback estructurado según los cinco criterios SMART, con sugerencias concretas de mejora.

Este ADR documenta las **doce decisiones arquitectónicas (D1–D12)** que habilitan esa funcionalidad sin comprometer las reglas transversales de la plataforma: multi-tenant, append-only audit, module boundaries, tenant scoping, y control de costos operativos.

El copilot **no** es un módulo de dominio OKR: no edita Objetivos/KRs en DB ni dispara cascada. Es un **módulo de borde**, consumido por el frontend, que produce texto. La persistencia de ese texto (si el usuario acepta la sugerencia) la hace el módulo `okr` por sus vías habituales.

### Preguntas a responder

1. ¿Cómo se abstrae la provider-dependency para poder cambiar entre Anthropic y OpenAI sin tocar la capa de servicio?
2. ¿Qué estructura tienen los endpoints `draft` y `validate` y qué shape devuelve el feedback SMART?
3. ¿Dónde y cómo se almacenan la config por organización, el log de prompts y los contadores de uso?
4. ¿Cómo se implementa la cuota mensual soft/hard y el rate limit por usuario?
5. ¿Cómo se integra el contexto organizacional (misión/visión/valores) sin leakear PII ni audit trail?
6. ¿Cómo se cachean respuestas para reducir costos en prompts repetidos?
7. ¿Cómo se exponen los contadores de uso al org-admin?
8. ¿Qué eventos de audit se emiten y cuáles quedan fuera (porque `ai.prompt_log` es un sink separado)?

### Asunciones declaradas

- El locale es `es-AR` (consistente con ADR 0001–0004); los system prompts instruyen explícitamente fraseo rioplatense neutro administrativo.
- Las API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) son globales del deploy en MVP. BYOK (bring-your-own-key) queda como iteración futura (D11).
- El volumen esperado en MVP es bajo (orden de 1K requests/mes/org), lo que habilita un cache sencillo en DB con invalidación por TTL (D9).
- No hay jobs autónomos que consuman el copilot: siempre hay un usuario humano en el loop (consistente con ADR 0003 "no autonomous jobs").
- El provider default es Anthropic con `claude-sonnet-4-5`; el precio por token se trackea manualmente vía billing externo (fuera de scope de este ADR).

## Decision

Vamos a implementar un **módulo NestJS nuevo llamado `ai`**, autocontenido, que:

- **Abstrae el provider** tras una interfaz `LlmProvider` con adapters iniciales `AnthropicAdapter` y `OpenAIAdapter` (D1). No hay lock-in al SDK en la capa de servicio.
- **Expone dos endpoints**: `POST /api/v1/ai/draft` y `POST /api/v1/ai/validate` (D2, D8). No hay chat abierto.
- **Agrega tres columnas TEXT nullable a `core.organization`**: `mission`, `vision`, `values` (D3). No hay RAG ni ingestión de documentos.
- **Limita el scope a Objectives y Key Results** (D4). Tasks quedan fuera de MVP.
- **Controla costos** con cuota mensual por organización, soft warn al 80% y hard block al 100%, separada por `entity_type` (drafting vs validating) (D5).
- **No envía PII ni audit trail** al provider; solo mission/vision/values + el texto del usuario (D6). Los prompts se loguean a `ai.prompt_log` (sink de debugging, **no** es `audit.event`).
- **Crea un schema Postgres nuevo `ai`** con tres tablas: `ai.organization_ai_settings`, `ai.prompt_log`, `ai.usage_counter` (D7).
- **Cachea respuestas** por `(organization_id, entity_type, prompt_hash)` durante 24h (D9).
- **Fuerza español `es-AR`** en system prompts y en el output (D10).
- **Permite selección de provider por organización** con fallback default a Anthropic `claude-sonnet-4-5` (D11).
- **Aplica rate limit por usuario** de 10 req/min (D12), independiente de la cuota mensual.

El módulo **no** toca `audit.event` para los prompts (D6). Sí emite eventos de audit para mutaciones de config (activación del copilot, cambio de provider, cambio de cuota) — ver sección "Audit events".

---

## Data model

### Ubicación

Schema Postgres **nuevo**: `ai`. Tres tablas: `ai.organization_ai_settings`, `ai.prompt_log`, `ai.usage_counter`.

Columnas adicionales en `core.organization` (ADR 0002): `mission`, `vision`, `values` (todas TEXT nullable).

### Tipos comunes

- IDs: `cuid` (string), consistente con ADRs anteriores.
- `entity_type`: enum `'objective' | 'key_result'` (D4). Persistido como `VARCHAR(32)` con CHECK.
- `operation_type`: enum `'draft' | 'validate'` (D5). Persistido como `VARCHAR(16)` con CHECK.
- `provider`: enum `'anthropic' | 'openai'` (D11). Persistido como `VARCHAR(16)` con CHECK.
- `prompt_hash`: `VARCHAR(64)` — SHA-256 hex del texto normalizado del prompt del usuario (D9).
- `token_count_in`, `token_count_out`: `INTEGER` — tokens contabilizados por el provider en su response.
- `year_month`: `VARCHAR(7)` formato `YYYY-MM` (D5).

### Shape ilustrativo (Prisma)

> Ilustrativo, no migración ejecutable.

```prisma
// apps/api/prisma/schema.prisma (extracto — schema "ai")

model OrganizationAiSettings {
  organizationId       String   @id @map("organization_id")
  provider             String   @db.VarChar(16)           // 'anthropic' | 'openai'
  modelName            String   @db.VarChar(64) @map("model_name")  // p.ej. 'claude-sonnet-4-5'
  monthlyTokenQuota    Int      @map("monthly_token_quota")        // 0 = sin límite (reservado superadmin)
  monthlyCallQuota     Int      @map("monthly_call_quota")
  enabled              Boolean  @default(true)
  byokApiKeyEncrypted  String?  @db.Text @map("byok_api_key_encrypted")  // reservado para iteración futura
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@schema("ai")
  @@map("organization_ai_settings")
}

model PromptLog {
  id                   String   @id @default(cuid())
  organizationId       String   @map("organization_id")
  userId               String   @map("user_id")
  operationType        String   @db.VarChar(16) @map("operation_type")  // 'draft' | 'validate'
  entityType           String   @db.VarChar(32) @map("entity_type")     // 'objective' | 'key_result'
  provider             String   @db.VarChar(16)
  modelName            String   @db.VarChar(64) @map("model_name")
  promptHash           String   @db.VarChar(64) @map("prompt_hash")
  promptText           String   @db.Text @map("prompt_text")
  responseText         String   @db.Text @map("response_text")
  tokensIn             Int      @map("tokens_in")
  tokensOut            Int      @map("tokens_out")
  latencyMs            Int      @map("latency_ms")
  cacheHit             Boolean  @default(false) @map("cache_hit")
  errorCode            String?  @db.VarChar(64) @map("error_code")
  createdAt            DateTime @default(now()) @map("created_at")

  @@index([organizationId, createdAt(sort: Desc)], map: "idx_prompt_log_org_created")
  @@index([organizationId, entityType, promptHash, createdAt(sort: Desc)], map: "idx_prompt_log_cache_lookup")
  @@index([userId, createdAt(sort: Desc)], map: "idx_prompt_log_user_created")
  @@schema("ai")
  @@map("prompt_log")
}

model UsageCounter {
  organizationId       String   @map("organization_id")
  yearMonth            String   @db.VarChar(7) @map("year_month")        // 'YYYY-MM'
  operationType        String   @db.VarChar(16) @map("operation_type")   // 'draft' | 'validate'
  callsCount           Int      @default(0) @map("calls_count")
  tokensInTotal        Int      @default(0) @map("tokens_in_total")
  tokensOutTotal       Int      @default(0) @map("tokens_out_total")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@id([organizationId, yearMonth, operationType])
  @@index([organizationId, yearMonth], map: "idx_usage_counter_org_month")
  @@schema("ai")
  @@map("usage_counter")
}
```

Columnas nuevas en `core.organization` (extensión de ADR 0002):

```prisma
// extracto — extensión del model Organization existente
model Organization {
  // ... campos previos ...
  mission   String? @db.Text
  vision    String? @db.Text
  values    String? @db.Text
}
```

### CHECKs SQL complementarios

```sql
ALTER TABLE ai.organization_ai_settings
  ADD CONSTRAINT chk_ai_provider
  CHECK (provider IN ('anthropic', 'openai'));

ALTER TABLE ai.organization_ai_settings
  ADD CONSTRAINT chk_ai_quotas_non_negative
  CHECK (monthly_token_quota >= 0 AND monthly_call_quota >= 0);

ALTER TABLE ai.prompt_log
  ADD CONSTRAINT chk_prompt_log_operation_type
  CHECK (operation_type IN ('draft', 'validate'));

ALTER TABLE ai.prompt_log
  ADD CONSTRAINT chk_prompt_log_entity_type
  CHECK (entity_type IN ('objective', 'key_result'));

ALTER TABLE ai.usage_counter
  ADD CONSTRAINT chk_usage_counter_year_month
  CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE ai.usage_counter
  ADD CONSTRAINT chk_usage_counter_operation_type
  CHECK (operation_type IN ('draft', 'validate'));
```

### Índices — justificación

| Índice | Propósito |
|---|---|
| `ai.organization_ai_settings (organization_id)` PK | Lookup directo de config por org. |
| `idx_prompt_log_org_created` | Listado del historial reciente de prompts (backoffice debug). |
| `idx_prompt_log_cache_lookup` | Cache hit lookup por `(org, entity_type, prompt_hash)` con ORDER BY `created_at DESC` para obtener el último response dentro del TTL de 24h (D9). |
| `idx_prompt_log_user_created` | Investigación de abusos por usuario ("¿qué prompts mandó este user?"). |
| `ai.usage_counter (org, year_month, operation_type)` PK | Actualización atómica del contador en cada request autorizado. |
| `idx_usage_counter_org_month` | Dashboard de usage por mes (entity_type se agrega en SQL). |

### Unique constraints

- `ai.organization_ai_settings.organization_id` PK — una fila por organización.
- `ai.usage_counter (organization_id, year_month, operation_type)` PK compuesta — un contador por org, mes, tipo.
- `ai.prompt_log.id` PK — append-only desde el punto de vista de negocio, aunque no DB-enforced como `audit.event` (D6).

### Retención

- `ai.prompt_log`: retención de **90 días**. Un job manual (o cron futuro) purga filas con `created_at < NOW() - INTERVAL '90 days'`. No es PII sensible pero acumular indefinidamente no aporta.
- `ai.usage_counter`: retención **indefinida** (series temporales livianas, útiles para tendencias anuales).

---

## API contract

Todos los endpoints bajo `/api/v1/ai/...`. DTOs en `packages/shared-types/src/ai/`.

Guards aplicados a **todos** los endpoints del módulo:

- `@AuthGuard()` — default.
- `@TenantGuard()` — requiere `X-Organization-Id`.
- `@ModuleEnabled('ai')` — `ai` **sí** es un módulo de negocio habilitable por organización (consistente con ADR 0002 `core.module_enablement`).
- `@Permissions(...)` — específico por endpoint.

### Endpoints draft + validate (D8)

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `POST /api/v1/ai/draft` | Redacta una propuesta de Objetivo o KR a partir de un hint. | `@AuthGuard`, `@TenantGuard`, `@ModuleEnabled('ai')`, `@Permissions('ai:use')` | `DraftRequestDto` | `DraftResponseDto` | 200, 400, 401, 403, 429, 503 |
| `POST /api/v1/ai/validate` | Valida texto escrito por el usuario contra el estándar SMART. | `@AuthGuard`, `@TenantGuard`, `@ModuleEnabled('ai')`, `@Permissions('ai:use')` | `ValidateRequestDto` | `ValidateResponseDto` | 200, 400, 401, 403, 429, 503 |

### Endpoints admin de config y usage

| Método + Path | Propósito | Guards | Request DTO | Response DTO | Códigos |
|---|---|---|---|---|---|
| `GET /api/v1/ai/settings` | Lee la config AI de la org actual. | `@AuthGuard`, `@TenantGuard`, `@Permissions('ai:admin')` | — | `AiSettingsDto` | 200, 401, 403, 404 |
| `PATCH /api/v1/ai/settings` | Actualiza provider, modelo, cuota, enabled. | `@AuthGuard`, `@TenantGuard`, `@Permissions('ai:admin')` | `UpdateAiSettingsDto` | `AiSettingsDto` | 200, 400, 401, 403, 404 |
| `GET /api/v1/ai/usage` | Usage del mes actual por `operation_type`. | `@AuthGuard`, `@TenantGuard`, `@Permissions('ai:admin')` | query: `yearMonth?` | `UsageSummaryDto` | 200, 401, 403 |
| `GET /api/v1/ai/prompt-log` | Listado paginado de prompts (debug). | `@AuthGuard`, `@TenantGuard`, `@Permissions('ai:admin')` | query: cursor, limit | `PromptLogPageDto` | 200, 401, 403 |

**Códigos HTTP adicionales del módulo**:

- **429** `AiQuotaExceeded` — la cuota mensual (soft o hard) fue superada. Header `X-Quota-Warn: true` cuando se está entre 80% y 100% (la request igual se sirve); body `QuotaExceededError` cuando se pasó 100%.
- **429** `AiRateLimited` — rate limit por usuario (D12). Header `Retry-After` en segundos.
- **503** `AiProviderUnavailable` — el provider respondió con 5xx o timeout.

### DTOs principales (`packages/shared-types/src/ai/`)

```ts
// packages/shared-types/src/ai/draft.dto.ts
export type AiEntityType = 'objective' | 'key_result';

export interface DraftRequestDto {
  entityType: AiEntityType;
  hint: string;                 // texto libre del usuario, 1..2000 chars
  parentObjectiveId?: string;   // cuando entityType='key_result', para dar contexto (solo read, no persiste)
}

export interface DraftResponseDto {
  suggestion: string;           // texto propuesto
  rationale: string;            // por qué el LLM lo redactó así
  cached: boolean;              // true si vino del cache (D9)
  usage: {
    tokensIn: number;
    tokensOut: number;
  };
  quotaWarning: boolean;        // true si usage >= 80% del mes
}
```

```ts
// packages/shared-types/src/ai/validate.dto.ts
export interface ValidateRequestDto {
  entityType: AiEntityType;
  text: string;                 // texto a validar, 1..2000 chars
}

export interface SmartCriterionFeedback {
  criterion: 'specific' | 'measurable' | 'achievable' | 'relevant' | 'time_bound';
  score: 'ok' | 'warn' | 'fail';
  comment: string;              // explicación en es-AR
  suggestion?: string;          // mejora concreta propuesta
}

export interface ValidateResponseDto {
  overallScore: 'ok' | 'warn' | 'fail';
  criteria: SmartCriterionFeedback[];   // exactamente 5, uno por criterio SMART
  rewriteProposal?: string;             // versión reescrita sugerida, opcional
  cached: boolean;
  usage: {
    tokensIn: number;
    tokensOut: number;
  };
  quotaWarning: boolean;
}
```

```ts
// packages/shared-types/src/ai/settings.dto.ts
export type AiProvider = 'anthropic' | 'openai';

export interface AiSettingsDto {
  organizationId: string;
  provider: AiProvider;
  modelName: string;
  monthlyTokenQuota: number;
  monthlyCallQuota: number;
  enabled: boolean;
  updatedAt: string;             // ISO-8601
}

export interface UpdateAiSettingsDto {
  provider?: AiProvider;
  modelName?: string;
  monthlyTokenQuota?: number;    // solo superadmin puede setear 0 (sin límite)
  monthlyCallQuota?: number;
  enabled?: boolean;
}
```

```ts
// packages/shared-types/src/ai/usage.dto.ts
export interface UsageSummaryDto {
  organizationId: string;
  yearMonth: string;             // 'YYYY-MM'
  draft: {
    calls: number;
    tokensIn: number;
    tokensOut: number;
  };
  validate: {
    calls: number;
    tokensIn: number;
    tokensOut: number;
  };
  quotaTokens: number;
  quotaCalls: number;
  percentConsumedTokens: number; // 0..100+
  percentConsumedCalls: number;
  warnThresholdReached: boolean; // >=80
  hardLimitReached: boolean;     // >=100
}
```

### Errores: shape común

Idéntico a 0001/0002/0003/0004 (`{ statusCode, message, error, details? }`). Códigos propios de `ai`:

- `AiModuleDisabled` — HTTP 403 (el módulo no está habilitado por `core.module_enablement` o `ai.organization_ai_settings.enabled=false`).
- `AiQuotaExceeded` — HTTP 429.
- `AiRateLimited` — HTTP 429.
- `AiProviderUnavailable` — HTTP 503.
- `AiProviderTimeout` — HTTP 504.
- `AiProviderRejected` — HTTP 502 (el provider devolvió un error de validación del prompt, p.ej. content policy).
- `AiInvalidEntityType` — HTTP 400.
- `AiPromptTooLong` — HTTP 400 (>2000 chars).

---

## Decisiones de diseño

### D1 — LLM provider abstraction: **interfaz `LlmProvider` con adapters**

**Decisión**: la capa de servicio (`AiService`) depende de una interfaz `LlmProvider` expuesta por el submódulo interno `ai/providers/`. Los adapters concretos (`AnthropicAdapter`, `OpenAIAdapter`) implementan esa interfaz y encapsulan cada SDK.

**Forma de la interfaz (shape ilustrativo)**:

```ts
// apps/api/src/modules/ai/providers/llm-provider.interface.ts
export interface LlmProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  responseFormat?: 'text' | 'json_object';
}

export interface LlmProviderResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  modelReported: string;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'openai';
  invoke(req: LlmProviderRequest): Promise<LlmProviderResponse>;
}
```

El `AiService` recibe el provider por inyección vía un **factory** (`LlmProviderFactory`) que lee `ai.organization_ai_settings.provider` y devuelve el adapter correspondiente.

**Justificación**:

- No hay lock-in al SDK en la capa de servicio: cambiar Anthropic ↔ OpenAI es tocar un adapter, no el service.
- Agregar un tercer provider (Gemini, Cohere, Mistral) es una clase nueva que implementa `LlmProvider` y un CASE nuevo en el factory. Cero modificaciones en services o controllers.
- Facilita mocking en tests: `MockLlmProvider` es trivial de implementar.
- Alinea con el principio general del stack: borders thin, dominio puro y agnóstico.

### D2 — Usage mode: **draft + validate, sin chat abierto**

**Decisión**: dos endpoints atómicos, cada uno con un único modo de uso. No hay conversación multi-turn. No hay streaming de tokens al cliente.

**Justificación**:

- Minimiza superficie de ataque: prompts abiertos son la vía principal de jailbreak y prompt injection.
- Cada endpoint tiene un **system prompt fijo** auditable, distinto para draft y para validate. La revisión de seguridad es factible.
- Simplifica la cuota y el cache: cada llamada es una unidad autocontenida `(input → output)`.
- El usuario siempre termina con texto editable localmente antes de mandar al módulo `okr`. El LLM **no** persiste el Objetivo/KR — esa decisión queda con el humano.
- Streaming se descarta en MVP: complica rate limiting, cuota, cache y tracking de tokens. Si en el futuro se necesita UX más reactiva, se abre ADR dedicado.

### D3 — Organizational context: **mission/vision/values en `core.organization`**

**Decisión**: agregar tres columnas TEXT nullable a `core.organization`: `mission`, `vision`, `values`. El `AiService` las lee con la `PrismaService.scoped` (tenant-filtered) al construir el system prompt. Si alguna está `NULL`, se omite del prompt (no se injecta "N/A").

**Justificación**:

- Es la mínima forma de contextualización útil: un LLM produce un objetivo radicalmente mejor si sabe que la organización es, por ejemplo, "una empresa de servicios profesionales con misión de maximizar la satisfacción del cliente".
- Texto plano es lo que cualquier organización puede mantener actualizado en MVP. Documentos Word/PDF + RAG requieren ingestión, embeddings, vector DB — fuera de scope.
- Las tres columnas son administrables por el org-admin vía el backoffice (endpoint `PATCH /api/v1/organizations/:id` de ADR 0002, que se extiende para aceptar estos campos). La migración los agrega nullable, sin backfill.
- No se envían al provider si el org-admin no los cargó: privacidad por default.

**Límites operativos**: cada campo tiene soft-limit de 2000 chars en la capa DTO (no en DB; la DB es TEXT). El system prompt total queda acotado a ~8000 chars combinados.

### D4 — Entity scope MVP: **objectives + key_results, sin tasks**

**Decisión**: el copilot solo asiste en la redacción/validación de Objetivos y Key Results. Tasks quedan fuera de MVP.

**Justificación**:

- Las tasks son unidades muy concretas cuyo valor SMART es menor (el peso semántico está en el Objetivo y el KR).
- La cantidad de tasks por usuario/día es alta; incluirlas explotaría cuotas y costos rápidamente.
- Si en alguna iteración futura se agrega scope para tasks, es `entity_type = 'task'` más un system prompt nuevo. La abstracción D1 y el schema D7 ya lo soportan sin migraciones de datos.

### D5 — Cost control: **cuota mensual soft/hard por organización, separada por operation_type**

**Decisión**: `ai.organization_ai_settings` almacena `monthly_token_quota` y `monthly_call_quota`. `ai.usage_counter` trackea consumo mensual por `(organization_id, year_month, operation_type)`. Policy:

- **0–79%**: request se sirve normal, response `quotaWarning=false`.
- **80–99%**: request se sirve, response `quotaWarning=true`, frontend muestra badge amarillo al org-admin.
- **100%+**: request se rechaza con HTTP 429 `AiQuotaExceeded`. El block se aplica en el guard **antes** de llamar al provider.

Tokens se cuentan **post-provider** (Anthropic/OpenAI devuelven `input_tokens`/`output_tokens` en cada response). Calls se cuentan pre-provider (una request HTTP = un call, incluso si falla).

**Justificación**:

- Separar por `operation_type` permite a un org-admin ver "gasté 70% en validate y 10% en draft" y ajustar UX en consecuencia (p.ej. fomentar más draft si es más barato).
- Soft warn habilita UX graceful ("vas por 85% del mes"); hard block garantiza que no hay sorpresas de facturación.
- Contador como tabla agregada (no derivado de `ai.prompt_log`) permite update atómico en la misma transacción del request y queries O(1) para el guard.
- Reset del contador: implícito por la PK compuesta `(org, year_month, operation_type)` — al empezar un mes nuevo, no hay fila, el `UPSERT` la crea en 0.

### D6 — Privacy & data handling: **prompt_log separado de audit.event**

**Decisión**: cada request al provider se loguea en `ai.prompt_log` con `prompt_text` y `response_text` completos. **Esto no es `audit.event`**. Son dos tablas con propósitos distintos:

| Aspecto | `audit.event` | `ai.prompt_log` |
|---|---|---|
| Propósito | Trazabilidad legal de mutaciones de negocio. | Debugging operacional y visibilidad de costos. |
| Append-only enforcement | SÍ (trigger DB, prohibe UPDATE/DELETE). | NO enforced; retención de 90 días con purga. |
| Retención | Indefinida (decisión de producto: priorizar historial sobre costo de storage). | 90 días. |
| PII | Minimizada. | Puede contener texto del usuario + org context. |
| Consumido por | Auditoría externa, historial inmutable. | Org-admin (debug), desarrolladores (tuning). |

**Datos enviados al provider**:

- System prompt estático (draft/validate, según endpoint).
- `mission`, `vision`, `values` de la org (si están cargados).
- El texto del usuario (`hint` o `text`).
- Metadatos técnicos del SDK (no PII).

**Datos NO enviados al provider**:

- Identidad del usuario (`email`, `displayName`, `auth0_sub`).
- `organizationId` o nombres de la org.
- Audit trail (`audit.event`).
- Listados de miembros (`core.user_organization_role`).
- Otros Objetivos/KRs existentes (excepto el caso explícito `parentObjectiveId` en draft de KR, donde se envía solo el texto del objetivo padre).
- Permisos, roles, ni configuración interna.

**Justificación**:

- `audit.event` es la fuente canónica de trazabilidad de mutaciones de **dominio** (Objetivos, KRs, miembros, etc.). Meter cada prompt ahí contamina la tabla, rompe su inmutabilidad útil (retención de prompts debe poder purgarse), y mezcla propósitos.
- `ai.prompt_log` es operacional: un admin lo consulta para entender por qué el LLM respondió X, o para investigar un abuso. Purgable, paginable, mutable en el futuro si hace falta redacción por data subject request.
- La separación hace explícito que **interactuar con el copilot no es una mutación de negocio**. Recién cuando el usuario acepta la sugerencia y la persiste en Objetivo/KR, eso sí es mutación y va a `audit.event` por la vía del módulo `okr`.

### D7 — Storage: **nuevo schema `ai` con 3 tablas**

**Decisión**: schema Postgres separado `ai`, consistente con la convención por-módulo del proyecto (`core`, `auth`, `okr`, `audit`). Tres tablas como definidas en "Data model".

**Justificación**:

- Coherencia estructural: cada módulo NestJS tiene su schema Postgres homónimo. `ai` module → `ai` schema.
- Aislamiento: queries de `ai` no contaminan `explain plans` ni stats de tablas de dominio OKR. Se puede monitorear el crecimiento del schema independientemente.
- Permisos a nivel schema (futuro): si alguna vez se quiere dar `SELECT` readonly a un analista externo sobre `ai.prompt_log` sin exponer `core` o `okr`, es `GRANT USAGE ON SCHEMA ai`.
- Migraciones Prisma multi-schema ya están habilitadas en el proyecto (ADR 0001 lo estableció).

### D8 — API surface: **POST draft + POST validate, más admin endpoints**

**Decisión**: dos endpoints de uso final (`POST /ai/draft`, `POST /ai/validate`) y cuatro endpoints admin (`GET /ai/settings`, `PATCH /ai/settings`, `GET /ai/usage`, `GET /ai/prompt-log`). Listados en "API contract".

**Justificación**:

- Endpoints `POST` (no `GET`) para draft/validate porque: (a) el body puede ser largo (hasta 2000 chars); (b) son operaciones side-effect-free desde el punto de vista de dominio pero side-effectful operacionalmente (consumen cuota, loguean); (c) no son idempotentes (el LLM puede devolver textos distintos).
- Admin endpoints bajo `@Permissions('ai:admin')`: permiten al org-admin ver/ajustar config y usage sin ser superadmin.
- No se expone endpoint para cambiar `mission/vision/values` acá — eso pertenece al `PATCH /api/v1/organizations/:id` de `core` (ADR 0002), que se extiende.

### D9 — Caching: **24h TTL por `(org, entity_type, prompt_hash)`**

**Decisión**: antes de llamar al provider, el `AiService` computa `prompt_hash = SHA256(normalize(user_input + system_prompt_version))` y busca en `ai.prompt_log` la fila más reciente con `(organization_id, entity_type, prompt_hash)` y `created_at > NOW() - INTERVAL '24 hours'`. Si existe, retorna ese response con `cached=true` y **no** incrementa el contador de tokens (pero sí el de calls, con `cache_hit=true` para trazabilidad).

**Justificación**:

- Dominios public-sector repiten prompts con frecuencia (distintos usuarios pidiendo draft del mismo objetivo, o re-validando texto similar).
- 24h es balance entre hit-rate razonable y frescura (si el org-admin actualiza `mission`, el cache invalida implícitamente porque `system_prompt_version` cambia al incluir el nuevo texto — ver detalle abajo).
- Implementado en DB (no Redis): no agrega dependencia nueva; el volumen esperado en MVP tolera un lookup con índice B-tree.
- `cache_hit=true` separa explícitamente calls con costo de calls sin costo en el dashboard.

**Invalidación implícita por cambio de contexto**:

- El `prompt_hash` incluye el system prompt completo (que incorpora `mission/vision/values`). Si el org-admin edita cualquiera de esos campos, el hash cambia y el cache se invalida naturalmente sin purga explícita.
- El `prompt_hash` también incluye un `version` string del system prompt del módulo (`v1`, `v2`, ...). Si se cambia el prompt engineering, se bumpea la versión y el cache viejo queda obsoleto sin purga.

### D10 — Internationalization: **todo en español `es-AR`**

**Decisión**: system prompts en español. Instrucción explícita al modelo: "Respondé siempre en español rioplatense neutro y formal, apto para comunicación profesional. No uses inglés ni inglesismos innecesarios."

**Justificación**:

- Todo el locale del sistema es `es-AR` (ADRs 0001–0004). Output en inglés rompería la UX.
- "Rioplatense neutro administrativo" es más preciso que "español argentino": evita voseo excesivamente coloquial en contextos formales, pero tampoco fuerza un castellano ibérico.
- Anthropic `claude-sonnet-4-5` y OpenAI `gpt-4` respetan instrucciones de localización con alta consistencia.
- El system prompt es idéntico para ambos providers (D1 garantiza que la interfaz acepta el mismo `systemPrompt` string).

### D11 — Provider selection: **per-org config, default Anthropic `claude-sonnet-4-5`**

**Decisión**: `ai.organization_ai_settings.provider` y `.model_name` son editables por el org-admin. Al crear una org (o al habilitar el módulo `ai` por primera vez), se seedea con `provider='anthropic'`, `model_name='claude-sonnet-4-5'`.

**BYOK (bring-your-own-key)** queda reservado como iteración futura: la columna `byok_api_key_encrypted` existe en el schema pero no se lee en MVP. La API key usada es siempre la global del deploy (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

**Justificación**:

- Un solo modelo default reduce la superficie de pruebas QA.
- `claude-sonnet-4-5` es consistente con calidad/costo en el use case de redacción/validación de texto estructurado en español.
- Permitir override por org deja espacio para que organizaciones con requisitos distintos (p.ej. "queremos GPT-4 porque ya lo evaluamos internamente") hagan el switch sin necesidad de ADR nuevo.
- BYOK como feature flag deferido: encriptación de keys en DB es trabajo no trivial (KMS, rotación, revocación) y no es blocker del MVP.

**Fallback ante provider caído**: por ahora **no hay fallback automático**. Si el provider configurado falla, la request devuelve 503. Fallback cross-provider introduciría costos adicionales y expectativas de SLA que no queremos prometer en MVP.

### D12 — Rate limiting: **10 req/min por usuario, independiente de cuota**

**Decisión**: `@nestjs/throttler` con bucket por `auth0Sub` (consistente con ADR 0004 D10), 10 requests por minuto por usuario. Excedido → HTTP 429 `AiRateLimited` con `Retry-After`.

**Justificación**:

- La cuota mensual protege el bolsillo; el rate limit protege contra client bugs (un loop infinito en el frontend que dispara miles de requests en segundos).
- 10 req/min es holgado para un usuario humano (un draft + un validate por minuto, con margen para re-intentos y múltiples KRs).
- El bucket es por `auth0Sub` (no por IP ni por org) para evitar falsos positivos en redes corporativas compartidas (oficinas centralizadas, VPNs empresariales y redes institucionales agregan múltiples usuarios detrás de una sola IP por NAT).
- La cuota mensual sigue aplicando: un usuario puede mandar 10 req/min pero si la org se queda sin cuota, todas esas devuelven 429 `AiQuotaExceeded` (el guard de cuota evalúa antes que el throttler; ambos pueden disparar 429 con distinto `error code`).

---

## Module boundaries

### Ubicación del módulo

`apps/api/src/modules/ai/` — módulo NestJS autocontenido.

### Superficie pública exportada (`apps/api/src/modules/ai/index.ts`)

```ts
// Tipos y DTOs consumibles por otros módulos:
export type { LlmProvider, LlmProviderRequest, LlmProviderResponse } from './providers/llm-provider.interface';

// Re-exports desde shared-types (no se duplican):
// - DraftRequestDto, DraftResponseDto
// - ValidateRequestDto, ValidateResponseDto
// - AiSettingsDto, UpdateAiSettingsDto, UsageSummaryDto

// NestJS Module:
export { AiModule } from './ai.module';
```

### Estructura interna (no accesible desde fuera del módulo)

```
apps/api/src/modules/ai/
├── ai.module.ts
├── ai.controller.ts
├── ai.service.ts
├── providers/
│   ├── llm-provider.interface.ts
│   ├── llm-provider.factory.ts
│   ├── anthropic.adapter.ts
│   └── openai.adapter.ts
├── prompts/
│   ├── draft-objective.prompt.ts
│   ├── draft-key-result.prompt.ts
│   ├── validate-objective.prompt.ts
│   └── validate-key-result.prompt.ts
├── quota/
│   ├── quota.guard.ts
│   └── usage.service.ts
├── cache/
│   └── prompt-cache.service.ts
├── repositories/
│   ├── ai-settings.repository.ts
│   ├── prompt-log.repository.ts
│   └── usage-counter.repository.ts
└── dto/                          (si hay DTOs NestJS-específicos con validators)
```

### Consumidores esperados

- **`apps/web`** (Next.js): consume `POST /api/v1/ai/draft` y `POST /api/v1/ai/validate` a través del api client. Los DTOs se importan desde `@gestion-publica/shared-types/ai`.
- **Ningún otro módulo NestJS** consume `ai`. El módulo es un borde (expone endpoints HTTP) y no publica servicios reutilizables hacia `okr`, `core`, etc.

### Consumidos por `ai` (imports válidos)

- **`auth`**: guards (`@AuthGuard`, `@TenantGuard`, `@Permissions`, `@ModuleEnabled`), decoradores (`@CurrentUser`), tipo `AuthContext`.
- **`core`**: vía `PrismaService.scoped` para leer `core.organization` (mission/vision/values). No se importan services de `core`.
- **`shared-types`**: DTOs compartidos con `apps/web`.

### Forbidden imports (explícito)

- `import { ... } from '../okr/internal/...'` — PROHIBIDO. El módulo `ai` **nunca** consume lógica interna de `okr`. Si se necesita validar que un `parentObjectiveId` existe en draft de KR, se hace vía `PrismaService.scoped` con un `findUnique({ where: { id, deletedAt: null } })` y se lee solo el `title` — sin pasar por el service de `okr`.
- `import { ... } from '../audit/internal/...'` — PROHIBIDO. `ai` escribe a `ai.prompt_log`, no a `audit.event` para prompts. Los eventos de audit de mutación de config se emiten vía el `AuditService` público (ADR 0003), no accediendo internals.

---

## Cascade math placement

**No aplica**. Este ADR no introduce lógica de cascada de Objetivos/KRs/Tareas. El módulo `ai` produce texto; la persistencia (si ocurre) pasa por el módulo `okr`, que ya recalcula la cascada en sus services (ADR 0001). `packages/okr-domain` no se extiende en este ADR.

El único cálculo numérico que hace el módulo `ai` es:

- Agregación de tokens por mes en `ai.usage_counter` (SUM en SQL, no en TypeScript).
- Cálculo de `percentConsumed` en `UsageSummaryDto` — aritmética entera trivial en el service.

Ninguno de estos cálculos es lógica de dominio OKR ni requiere un paquete puro.

---

## Auth0 → local RBAC mapping

### Nuevos permission keys (extensión del catálogo de ADR 0004 D7)

| Permission Key | Descripción | Asignado a roles |
|---|---|---|
| `ai:use` | Invocar draft/validate. | `org-user`, `org-admin` |
| `ai:admin` | Leer/editar settings, usage, prompt-log. | `org-admin` |

**Nota**: `org-reader` **no** tiene `ai:use`. El copilot es una herramienta de redacción activa; un reader (que solo consume reports) no necesita invocarlo.

### Matriz actualizada (extracto relevante)

| Rol | `ai:use` | `ai:admin` |
|---|---|---|
| `org-reader` | — | — |
| `org-user` | SÍ | — |
| `org-admin` | SÍ | SÍ |
| `external-auditor` | — | — |

Seeds: se agregan filas a `auth.permission` y `auth.role_permission` en la migración que acompaña este ADR. Consistente con la política de ADR 0004: los permisos se seedean, no se crean runtime.

### Superadmin

- `AuthContext.permissions = ['*']` sigue la convención de ADR 0004. Los guards `@Permissions('ai:use')` y `@Permissions('ai:admin')` resuelven a true para superadmin.
- El superadmin puede setear `monthly_token_quota = 0` (sin límite) en cualquier org via `PATCH /ai/settings`. Org-admin puede reducir la cuota pero no eliminarla.

### Claims drift policy

Idéntica a ADR 0004: permisos siempre resueltos por DB en cada request (no cacheados del JWT). Cambio de rol del usuario → próximo request usa el permiso nuevo sin re-login.

### Módulo habilitable

`ai` es un módulo habilitable por organización (consistente con ADR 0002 `core.module_enablement`). Seed default: **deshabilitado**. La org-admin activa explícitamente desde el backoffice. `@ModuleEnabled('ai')` se aplica en todos los endpoints de uso (no en los admin de settings, donde solo requiere `ai:admin`).

---

## Tenant scoping

- `X-Organization-Id` llega en el header (ADR 0004 D9). `TenantGuard` popula `AuthContext.organizationId`.
- Todas las queries en `ai`:
  - `ai.organization_ai_settings`: filtro `organizationId = ctx.organizationId` por Prisma extension (ADR 0004 D6), excepto para superadmin que puede leer cualquier org.
  - `ai.prompt_log`: filtro `organizationId = ctx.organizationId`, incluido en el índice `idx_prompt_log_cache_lookup` para aprovecharlo directo.
  - `ai.usage_counter`: filtro `organizationId = ctx.organizationId` idem.
  - `core.organization` (lectura de mission/vision/values): se usa `PrismaService.scoped`, consistente con el resto del sistema.

- **No hay endpoints cross-tenant** en MVP (ni siquiera para superadmin). Si un superadmin necesita ver usage global, es query manual a DB. Simplifica el diseño; se puede levantar en ADR futuro.

- **Edge case — superadmin sin `X-Organization-Id`**: idéntico tratamiento a ADR 0004 — los endpoints de `ai` requieren `X-Organization-Id` siempre, incluso para superadmin. No hay cross-tenant implícito.

---

## Audit events

`ai.prompt_log` **NO** es `audit.event`. Los prompts/responses se loguean allí con propósito operacional y **no** se replican en `audit.event` (D6).

Los eventos de audit que sí emite el módulo `ai` corresponden a mutaciones de **configuración** (las mutaciones de estado persistente del módulo):

| Mutación | Event action | Payload fields | Notas |
|---|---|---|---|
| Activar módulo `ai` para la org (al crear `organization_ai_settings`) | `ai.settings.created` | `{ organizationId, provider, modelName, monthlyTokenQuota, monthlyCallQuota, enabled, actorUserId }` | Emitido en la misma transacción que el INSERT en `ai.organization_ai_settings`. |
| Actualizar settings del módulo | `ai.settings.updated` | `{ organizationId, changes: { field: { old, new } }, actorUserId }` | Solo campos efectivamente cambiados. |
| Deshabilitar módulo para la org | `ai.settings.disabled` | `{ organizationId, actorUserId }` | Consecuencia de `PATCH` con `enabled=false`. Evento separado para facilitar queries de "¿cuándo se apagó?". |
| Cambiar provider | `ai.settings.provider_changed` | `{ organizationId, oldProvider, newProvider, oldModelName, newModelName, actorUserId }` | Evento dedicado además de `ai.settings.updated` por relevancia operativa (implica distinto costo y distinto vendor). |
| Actualizar `mission/vision/values` en `core.organization` | `core.organization.context_updated` | `{ organizationId, fields: string[], actorUserId }` | Emitido por `core`, **no** por `ai`. Se lista acá porque invalida el cache D9 y es relevante para el dominio del copilot. El payload **no** incluye el texto viejo/nuevo (puede ser largo y semi-sensible). |

**Todas** las mutaciones listadas son INSERTs en `audit.event`. No hay UPDATE ni DELETE sobre `audit.event` (consistente con ADR 0003, trigger DB-enforced).

**Lo que NO se audita**:

- Requests a `POST /ai/draft` y `POST /ai/validate`. Estos van a `ai.prompt_log` exclusivamente. Razón: son consultas, no mutaciones de dominio. Inundar `audit.event` con prompts rompe su utilidad como trail legal.
- Cache hits (`cache_hit=true` en `ai.prompt_log`). Idem.
- Rate limits excedidos o quota warnings. Métricas operacionales, no eventos de negocio.

---

## Alternatives considered

### A1 — Chat abierto multi-turn en lugar de draft + validate

**Qué es**: exponer un endpoint `POST /ai/chat` con historial de mensajes, al estilo de un ChatGPT embebido.

**Por qué se descarta**:

- Superficie de ataque masivamente mayor (prompt injection, jailbreak, extracción del system prompt).
- Sin un "propósito" acotado, la cuota y el cache no son computables de forma predecible.
- La UX para usuarios profesionales que ya saben lo que quieren no necesita conversación: necesita un output concreto aplicable a un campo de formulario.
- Mantenimiento del estado de conversación requiere tabla adicional, TTLs de sesión, rate limits por sesión. Complejidad no justificada en MVP.

### A2 — RAG con documentos subidos por la organización

**Qué es**: en lugar de (o además de) `mission/vision/values`, permitir que el org-admin suba PDFs (plan estratégico, ley de creación, etc.) que se chunkean, embeddean y se usan como contexto.

**Por qué se descarta (para MVP)**:

- Requiere infra nueva: vector DB (pgvector, Pinecone, Weaviate), pipeline de ingestión, chunking strategy, embedding model, re-indexación ante cambios.
- Impacto fuerte en costo (embeddings no son gratis) y en tiempo de respuesta (similarity search agrega latencia).
- El valor marginal sobre tres campos de texto plano es discutible en el contexto de Objetivos/KRs, cuyo enunciado bien redactado cabe en 200 chars.
- Se puede introducir en una iteración futura sin romper la abstracción D1/D3: agregar un `ContextResolver` que alimente el system prompt con chunks RAG además de mission/vision/values. ADR dedicado.

### A3 — Enforcement de cuota en el provider en lugar de en nuestra DB

**Qué es**: confiar en los rate-limit/budget features de Anthropic/OpenAI (p.ej. "organization-level spend cap") y no mantener `ai.usage_counter`.

**Por qué se descarta**:

- No son per-tenant (nuestras orgs). Si tenemos 20 orgs compartiendo una sola API key global, el provider solo ve "un cliente" y no sabe que org X consumió 80% y org Y 0%.
- No es configurable por el org-admin desde nuestra UI; requeriría darle acceso al dashboard del provider.
- Soft warn al 80% (feedback UI) no existe como hook del provider; tendríamos que computarlo igual.
- BYOK (futuro) sí permitiría delegar parcialmente al provider, pero eso es una decisión separada y no descarta el tracking local (necesario para la UI).

### A4 — Una sola tabla `ai.event` append-only (unificando `prompt_log` con audit events del módulo)

**Qué es**: no separar `ai.prompt_log` de `audit.event`; meter todo en una única tabla append-only del módulo.

**Por qué se descarta**:

- Retención distinta: los prompts son purgables (90 días); los audit events son indefinidos. Mezclarlos implica perder ese control.
- Shape distinto: un prompt tiene `prompt_text`/`response_text`/`tokens_in`/etc.; un audit event tiene `action`/`payload`/`actorUserId`. Forzar una tabla única requiere columnas nullable proliferantes o un `payload JSONB` que ofusca.
- Semántica distinta: el audit event es "algo cambió en el estado del sistema"; un prompt es "alguien consultó al LLM". Colapsar ambos pierde claridad.
- Las queries operacionales son distintas: org-admin quiere "ver mis últimos prompts" (ordenado por tiempo, con `prompt_text`); auditor externo quiere "ver cuándo se cambió el provider" (filtro por action, con `payload`). Índices óptimos distintos.

---

## Impact

### Migraciones requeridas

1. **`core.organization`**: ADD COLUMN `mission TEXT NULL`, `vision TEXT NULL`, `values TEXT NULL`. Sin backfill. Consistente con ADR 0002, es extensión hacia atrás-compatible.
2. **Schema `ai`**: CREATE SCHEMA ai. Crear tablas `ai.organization_ai_settings`, `ai.prompt_log`, `ai.usage_counter` con columnas, CHECKs, PKs e índices definidos en "Data model".
3. **Catálogo RBAC**: INSERT en `auth.permission` de `ai:use` y `ai:admin`; INSERT en `auth.role_permission` para ligarlos a `org-user` y `org-admin`.
4. **Módulos habilitables**: INSERT en `core.module` una fila `{ key: 'ai', name: 'AI Copilot', description: 'Asistente de IA para redacción y validación SMART de Objetivos y Key Results.' }`. Habilitación por-org queda en `core.module_enablement` (default deshabilitado).

### Nuevas dependencias

- `@anthropic-ai/sdk` (adapter Anthropic).
- `openai` (adapter OpenAI).
- Ambas ya son npm packages establecidos; no requieren evaluación adicional.

### Nuevas variables de entorno

```
AI_DEFAULT_PROVIDER           # 'anthropic' (default al crear settings)
AI_DEFAULT_MODEL              # 'claude-sonnet-4-5'
ANTHROPIC_API_KEY             # API key global del deploy
OPENAI_API_KEY                # API key global del deploy
AI_DEFAULT_TOKEN_QUOTA        # p.ej. 500000 (tokens/mes por org en MVP)
AI_DEFAULT_CALL_QUOTA         # p.ej. 1000 (calls/mes por org en MVP)
AI_RATE_LIMIT_PER_MINUTE      # 10 (D12)
AI_CACHE_TTL_HOURS            # 24 (D9)
AI_SYSTEM_PROMPT_VERSION      # 'v1' (participa en prompt_hash — D9)
```

Consistente con las convenciones de ADRs 0001–0004 (env vars en `apps/api/src/config/` con Zod/`class-validator`).

### Tests nuevos

- **Unit (Vitest, apps/api)**:
  - `AiService.draft()`: con MockLlmProvider, verifica construcción del system prompt (incluye mission/vision/values si existen, los omite si NULL), verifica que el response incluye `cached=false` en primera llamada y `cached=true` en la segunda con mismo `prompt_hash`.
  - `AiService.validate()`: con MockLlmProvider, verifica parseo del response JSON (5 criterios SMART), verifica fallback a 'fail' cuando el LLM devuelve JSON mal formado.
  - `QuotaGuard`: escenarios 0%, 79%, 80%, 99%, 100%, 101%. Verifica que 100%+ devuelve 429 antes del provider.
  - `PromptCacheService`: hit dentro de 24h, miss después de 24h, miss al cambiar `AI_SYSTEM_PROMPT_VERSION`.
  - `AnthropicAdapter` y `OpenAIAdapter`: con mocks HTTP (nock o undici mock agent), verifica mapeo request/response y conteo de tokens.

- **Integration (apps/api/test)**:
  - Flujo completo `POST /ai/draft`: auth → tenant guard → module-enabled guard → permission guard → quota guard → cache miss → provider mock → prompt_log INSERT + usage_counter UPSERT + response.
  - Flujo de cache hit: dos requests idénticos, segundo devuelve `cached=true` y no incrementa tokens.
  - Flujo de quota exceeded: con `usage_counter` prepoblado al 100%, next request → 429.
  - Flujo de rate limit: 11 requests en un minuto por el mismo user → request 11 devuelve 429 con `Retry-After`.

- **E2E (Playwright)**:
  - Org-admin activa el módulo `ai`, configura provider, ve badge de quota 0%.
  - Usuario crea un Objetivo, invoca draft, acepta la sugerencia, verifica que el Objetivo queda persistido y el contador de draft sube.
  - Usuario valida un KR, ve los 5 criterios SMART con scores, aplica la `rewriteProposal`.

### Módulos afectados

- **`core`** (ADR 0002):
  - Se extiende `PATCH /api/v1/organizations/:id` para aceptar `mission/vision/values`.
  - Se agrega fila a `core.module` para `ai` (seed).
  - Emite `core.organization.context_updated` en audit al mutar esos campos.
- **`auth`** (ADR 0004):
  - Se extiende el seed de `auth.permission` con `ai:use` y `ai:admin`.
  - Se extiende el seed de `auth.role_permission` para `org-user` y `org-admin`.
  - `PermissionKey` en `shared-types/auth/permission-keys.ts` agrega `'ai:use' | 'ai:admin'`.
- **`audit`** (ADR 0003):
  - Nuevos `event action`: `ai.settings.created`, `ai.settings.updated`, `ai.settings.disabled`, `ai.settings.provider_changed`, `core.organization.context_updated`.
  - Consume el `AuditService` público sin cambios en su API.
- **`okr`** (ADR 0001):
  - **No** se modifica. El módulo `ai` no consume `okr` services ni al revés. La interacción es al nivel del usuario (acepta sugerencia → llena form → llama `POST /api/v1/objectives` normal).
- **`apps/web`**:
  - Nuevo `features/ai/` con hooks `useAiDraft`, `useAiValidate`, componente `AiDraftDialog`, `AiValidatePanel`.
  - Nuevo `features/admin-ai/` con `AiSettingsForm`, `UsageDashboard`, `PromptLogTable`.
  - Badge de quota visible al org-admin en el layout `(admin)`.
  - Consumo de DTOs vía `@gestion-publica/shared-types/ai`.

---

## Consequences

### Trade-offs accepted

- **Costo operativo visible fuera del stack**: la facturación del provider (Anthropic/OpenAI) no está integrada con el billing de Railway/Vercel. El org-admin ve tokens consumidos; el dueño de la infra ve facturas separadas. Aceptado porque BYOK (futuro) distribuirá ese costo a cada org.
- **No fallback cross-provider**: si Anthropic tiene un outage, las orgs con provider Anthropic ven 503 hasta que recupere. Aceptado para MVP; multi-provider failover agrega complejidad y duplica costos.
- **Cache DB-backed en lugar de Redis**: simplicidad a cambio de escala. A volumen alto el índice sobre `ai.prompt_log` puede crecer; mitigación vía retención de 90 días y purga programada.
- **Prompts no auditados en `audit.event`**: si un regulador pide "toda la actividad del usuario X", hay dos fuentes a consultar (`audit.event` y `ai.prompt_log`). Aceptado por la separación semántica explícita de D6.
- **Quota compartida global (no per-usuario)**: un usuario puede consumir toda la cuota de la org. Aceptado: rate limit per-user (D12) mitiga el runaway client; per-user quota introduce complejidad sin valor claro en MVP.
- **Sin streaming de tokens**: el usuario espera el response completo antes de ver resultado. Aceptado; latencia esperada <3s en el p50 de Anthropic/OpenAI para outputs de <500 tokens.

### Known limitations

- El cache de 24h no considera cambios en el catálogo global de permisos o en el system prompt version automáticamente: requiere bump manual de `AI_SYSTEM_PROMPT_VERSION`.
- `ai.prompt_log` puede crecer rápido si el volumen aumenta. El índice `idx_prompt_log_cache_lookup` es denso; a escala hay que revisar partitioning por mes.
- No hay "modo offline" del copilot: si no hay conectividad al provider, la feature es 100% inoperable. UX muestra mensaje explícito.
- El parsing del response de validate asume que el LLM devuelve JSON estructurado. Se confía en el modo `responseFormat: 'json_object'` de ambos providers + validación con Zod en el adapter. Si parsea mal, se devuelve `AiProviderRejected` al cliente.

### Future decisions deferred

- **BYOK (D11)**: cuándo y cómo encriptar/rotar API keys per-org. Requiere KMS.
- **RAG / documentos (A2)**: si alguna org pide contexto más rico, ADR dedicado con infra de embeddings.
- **Tasks en scope (D4)**: si la UX indica valor, se agrega `entity_type='task'` con system prompts dedicados. El schema D7 ya lo soporta.
- **Streaming / chat abierto (D2, A1)**: solo si hay evidencia de demanda del lado usuario y mitigación de riesgos de seguridad.
- **Fallback cross-provider**: multi-provider routing con retry y selección por salud. Tras 6 meses de operación.
- **Per-user quota**: si se detecta abuso concentrado en usuarios específicos.
- **Partitioning de `ai.prompt_log` por mes**: cuando el volumen lo justifique.
- **Métricas de calidad del copilot**: medir "aceptación" (usuario clickea "usar esta sugerencia") vs "descarte". Requiere endpoint/evento de feedback, no incluido en MVP.

---

## Conflicts with frozen rules

**None detected.**

Verificación contra las reglas frozen del proyecto:

- **Module boundaries**: el módulo `ai` expone `AiModule` y tipos vía `index.ts`. No importa internals de `okr`, `core`, `auth` ni `audit`. Consume `auth` y `core` solo por su superficie pública (guards, `PrismaService.scoped`). ✓
- **Multi-tenant**: todas las tablas de `ai` incluyen `organizationId`; todas las queries filtran por `organizationId`; `core.organization` lectura vía `PrismaService.scoped`. ✓
- **Append-only audit**: `audit.event` solo recibe INSERTs (mutaciones de config). Prompts van a `ai.prompt_log`, tabla separada y explícitamente declarada como no-audit. No se propone UPDATE/DELETE sobre `audit.event`. ✓
- **Decimales**: no aplica — el módulo no maneja pesos ni porcentajes de OKR. Los contadores (`tokens_in_total`, etc.) son `Int`, consistentes con el dominio de conteo de tokens. ✓
- **OKR cascade math**: no se modifica. `packages/okr-domain` intacto. ✓
- **Auth0 + RBAC**: todos los endpoints tienen `@AuthGuard + @TenantGuard + @Permissions(...)`. Guards de `auth` (ADR 0004) se reusan sin modificar. ✓
- **OKR frozen domain rules**: el copilot **no** edita Objetivos, KRs ni Tareas. No introduce inter-unit hierarchy. No introduce cross-period Objectives. No introduce `%` directo en KR. Soft-delete no aplica (las tablas `ai` no son entidades de negocio OKR). ✓

---

## References

- [ADR 0001 — Módulo OKR](./0001-okr-module-foundation.md)
- [ADR 0002 — Módulo Core](./0002-core-module-foundation.md)
- [ADR 0003 — Módulo Audit](./0003-audit-module-foundation.md)
- [ADR 0004 — Fundación del módulo Auth](./0004-auth-module-foundation.md)
- `CLAUDE.md` — reglas transversales del proyecto y convenciones de módulo.
- `AGENTS.md` — reglas de dominio OKR y frozen rules.
- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat
