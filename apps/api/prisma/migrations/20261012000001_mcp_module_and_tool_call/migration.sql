-- Migration: 20261012000001_mcp_module_and_tool_call
-- ADR-0010 (conector MCP, Fase 11 / C26).
-- 1) Módulo `mcp` en el catálogo core.module. Sin habilitaciones por defecto: lo habilita el superadmin por
--    organización una vez que el organismo aceptó el aviso de datos (D7, D9).
-- 2) Schema `mcp` + mcp.tool_call: log operativo de llamadas a herramientas (D10). NO es audit.event: es purgable
--    por retención (180 días), no lleva trigger append-only y no guarda argumentos ni respuestas.
-- Esta migración no toca audit.event (ni UPDATE ni DELETE).

INSERT INTO core."module" (key, name, description, created_at)
VALUES (
  'mcp',
  'Conector para asistentes de IA',
  'Permite consultar el plan desde asistentes de IA externos (por ejemplo Claude) con la identidad y los permisos de cada persona. Los datos consultados se envían al proveedor del asistente que use cada persona y quedan sujetos a los términos de su cuenta. Habilitar solo con la aceptación del organismo.',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS "mcp";

CREATE TABLE "mcp"."tool_call" (
    "id"              TEXT         NOT NULL,
    "organization_id" TEXT,
    "user_id"         TEXT         NOT NULL,
    "client_id"       VARCHAR(128) NOT NULL,
    "tool_name"       VARCHAR(64)  NOT NULL,
    "kind"            VARCHAR(8)   NOT NULL,
    "outcome"         VARCHAR(16)  NOT NULL,
    "error_code"      VARCHAR(64),
    "latency_ms"      INTEGER      NOT NULL,
    "response_chars"  INTEGER      NOT NULL,
    "request_id"      UUID         NOT NULL,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "tool_call_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_tool_call_org"
        FOREIGN KEY ("organization_id") REFERENCES core."organization"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_tool_call_user"
        FOREIGN KEY ("user_id") REFERENCES core."user"("id") ON DELETE RESTRICT,
    CONSTRAINT "chk_tool_call_kind" CHECK ("kind" IN ('read', 'write')),
    CONSTRAINT "chk_tool_call_outcome" CHECK ("outcome" IN ('ok', 'error', 'denied', 'rate_limited')),
    CONSTRAINT "chk_tool_call_latency" CHECK ("latency_ms" >= 0 AND "response_chars" >= 0)
);

CREATE INDEX "idx_tool_call_org_created" ON "mcp"."tool_call" ("organization_id", "created_at" DESC);
CREATE INDEX "idx_tool_call_user_created" ON "mcp"."tool_call" ("user_id", "created_at" DESC);
CREATE INDEX "idx_tool_call_request" ON "mcp"."tool_call" ("request_id");
CREATE INDEX "idx_tool_call_created" ON "mcp"."tool_call" ("created_at");
