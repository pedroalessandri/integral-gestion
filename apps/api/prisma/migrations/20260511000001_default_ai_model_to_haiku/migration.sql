-- Default AI model: Sonnet 4.5 → Haiku 4.5
--
-- Context: the initial default in 20260424_create_ai_schema landed as
-- claude-sonnet-4-5-20250929, which costs ~5x more than Haiku per token.
-- The intended cost profile for the copilot was always Haiku; the Sonnet
-- default was a mistake that leaked into existing organizations through
-- QuotaService.getOrCreateSettings().
--
-- This migration:
--   1. Flips the column default for new organizations.
--   2. Re-points any existing row that is still on the old Sonnet
--      default to Haiku. Rows where an org explicitly chose a different
--      model are left untouched.

ALTER TABLE ai."organization_ai_settings"
    ALTER COLUMN "model_name" SET DEFAULT 'claude-haiku-4-5-20251001';

UPDATE ai."organization_ai_settings"
   SET "model_name" = 'claude-haiku-4-5-20251001',
       "updated_at" = NOW()
 WHERE "model_name" = 'claude-sonnet-4-5-20250929';
