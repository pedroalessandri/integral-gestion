-- Migration: 20260421000002_seed_okr_module
-- Seeds the initial module registry with the 'okr' module.
-- Idempotent: ON CONFLICT DO NOTHING allows re-running safely.

INSERT INTO core."module" (key, name, description, created_at)
VALUES ('okr', 'OKR', 'Objectives and Key Results management', NOW())
ON CONFLICT (key) DO NOTHING;
