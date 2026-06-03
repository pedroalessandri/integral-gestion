-- Migration: 20260424_create_ai_schema
-- Creates the 'ai' PostgreSQL schema and its three tables:
--   ai.organization_ai_settings, ai.prompt_log, ai.usage_counter
--
-- Also adds mission/vision/values TEXT columns to core.organization (ADR-0005 D3).
--
-- CHECK constraints enforce enum-like values for provider, operation_type, entity_type.
-- FKs reference core.organization and core.user (cross-schema).
-- Tables are append-only from a business perspective (prompt_log) but not DB-enforced
-- like audit.event — retention of 90 days via future manual/cron purge (ADR-0005).

-- ─────────────────────────────────────────────────────────────
-- 1. Create the 'ai' schema
-- ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "ai";

-- ─────────────────────────────────────────────────────────────
-- 2. Extend core.organization with AI context columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE core."organization"
  ADD COLUMN IF NOT EXISTS "mission" TEXT,
  ADD COLUMN IF NOT EXISTS "vision"  TEXT,
  ADD COLUMN IF NOT EXISTS "values"  TEXT;

-- ─────────────────────────────────────────────────────────────
-- 3. ai.organization_ai_settings
-- One row per organization — organization_id is PK.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai."organization_ai_settings" (
    "organization_id"        TEXT         NOT NULL,
    "provider"               VARCHAR(16)  NOT NULL DEFAULT 'anthropic',
    "model_name"             VARCHAR(64)  NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    "monthly_token_quota"    INTEGER      NOT NULL DEFAULT 500000,
    "monthly_call_quota"     INTEGER      NOT NULL DEFAULT 1000,
    "enabled"                BOOLEAN      NOT NULL DEFAULT TRUE,
    "byok_api_key_encrypted" TEXT,
    "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "organization_ai_settings_pkey"
        PRIMARY KEY ("organization_id"),

    CONSTRAINT "fk_ai_settings_org"
        FOREIGN KEY ("organization_id")
        REFERENCES core."organization"("id")
        ON DELETE CASCADE,

    CONSTRAINT "chk_ai_provider"
        CHECK ("provider" IN ('anthropic', 'openai')),

    CONSTRAINT "chk_ai_quotas_non_negative"
        CHECK ("monthly_token_quota" >= 0 AND "monthly_call_quota" >= 0)
);

-- ─────────────────────────────────────────────────────────────
-- 4. ai.prompt_log
-- Append-only prompt audit log (not to be confused with audit.event).
-- Retention: 90 days (manual/cron purge; no DB-level enforcement in MVP).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai."prompt_log" (
    "id"             TEXT         NOT NULL,
    "organization_id" TEXT        NOT NULL,
    "user_id"        TEXT         NOT NULL,
    "operation_type" VARCHAR(16)  NOT NULL,
    "entity_type"    VARCHAR(32)  NOT NULL,
    "provider"       VARCHAR(16)  NOT NULL,
    "model"          VARCHAR(64)  NOT NULL,
    "prompt_hash"    VARCHAR(64)  NOT NULL,
    "prompt_text"    TEXT         NOT NULL,
    "response_text"  TEXT         NOT NULL,
    "tokens_in"      INTEGER      NOT NULL,
    "tokens_out"     INTEGER      NOT NULL,
    "latency_ms"     INTEGER      NOT NULL,
    "cache_hit"      BOOLEAN      NOT NULL DEFAULT FALSE,
    "success"        BOOLEAN      NOT NULL DEFAULT TRUE,
    "error_code"     VARCHAR(64),
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "prompt_log_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "fk_prompt_log_org"
        FOREIGN KEY ("organization_id")
        REFERENCES core."organization"("id")
        ON DELETE CASCADE,

    CONSTRAINT "fk_prompt_log_user"
        FOREIGN KEY ("user_id")
        REFERENCES core."user"("id")
        ON DELETE CASCADE,

    CONSTRAINT "chk_prompt_log_operation_type"
        CHECK ("operation_type" IN ('draft', 'validate')),

    CONSTRAINT "chk_prompt_log_entity_type"
        CHECK ("entity_type" IN ('objective', 'key_result'))
);

CREATE INDEX IF NOT EXISTS "idx_prompt_log_org_created"
    ON ai."prompt_log" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_prompt_log_cache_lookup"
    ON ai."prompt_log" ("organization_id", "entity_type", "prompt_hash", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_prompt_log_user_created"
    ON ai."prompt_log" ("user_id", "created_at" DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. ai.usage_counter
-- Aggregated counters per (org, year_month, operation_type).
-- PK is composite — one row per org+month+operation.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai."usage_counter" (
    "organization_id"  TEXT         NOT NULL,
    "year_month"       VARCHAR(7)   NOT NULL,
    "operation_type"   VARCHAR(16)  NOT NULL,
    "calls_count"      INTEGER      NOT NULL DEFAULT 0,
    "tokens_in_total"  INTEGER      NOT NULL DEFAULT 0,
    "tokens_out_total" INTEGER      NOT NULL DEFAULT 0,
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "usage_counter_pkey"
        PRIMARY KEY ("organization_id", "year_month", "operation_type"),

    CONSTRAINT "fk_usage_counter_org"
        FOREIGN KEY ("organization_id")
        REFERENCES core."organization"("id")
        ON DELETE CASCADE,

    CONSTRAINT "chk_usage_counter_year_month"
        CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

    CONSTRAINT "chk_usage_counter_operation_type"
        CHECK ("operation_type" IN ('draft', 'validate'))
);

CREATE INDEX IF NOT EXISTS "idx_usage_counter_org_month"
    ON ai."usage_counter" ("organization_id", "year_month");
