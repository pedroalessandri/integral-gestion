CREATE TABLE IF NOT EXISTS "audit"."event" (
  "id"              TEXT           NOT NULL,
  "occurred_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "actor_id"        TEXT           NOT NULL,
  "organization_id" TEXT,
  "entity_type"     VARCHAR(64)    NOT NULL,
  "entity_id"       VARCHAR(64)    NOT NULL,
  "action"          VARCHAR(80)    NOT NULL,
  "diff"            JSONB          NOT NULL,
  "request_id"      UUID           NOT NULL,
  CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit"."event"
  ADD CONSTRAINT "event_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "core"."user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit"."event"
  ADD CONSTRAINT "event_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_event_org_occurred"
  ON "audit"."event"("organization_id", "occurred_at" DESC);

CREATE INDEX "idx_event_entity"
  ON "audit"."event"("entity_type", "entity_id", "occurred_at" DESC);

CREATE INDEX "idx_event_actor_occurred"
  ON "audit"."event"("actor_id", "occurred_at" DESC);

CREATE INDEX "idx_event_occurred_system"
  ON "audit"."event"("occurred_at" DESC)
  WHERE "organization_id" IS NULL;

CREATE INDEX "idx_event_request"
  ON "audit"."event"("request_id");

CREATE OR REPLACE FUNCTION audit.prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit.event is append-only (% blocked on table %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'read_only_sql_transaction';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON "audit"."event"
FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON "audit"."event" FROM PUBLIC;
