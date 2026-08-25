-- Migration: add_ai_players_daily_cost_cap
-- Task: DASH-BUDGET-003
-- Adds an optional per-model daily cost cap (USD) used by the Analytics tab
-- to render a progress indicator. Nullable, no backfill needed.
-- NOTE: This column was applied directly to prod out-of-band prior to this
-- commit. This file documents that change for migration-history parity;
-- it is not being executed as a fresh migration.

ALTER TABLE public.ai_players
  ADD COLUMN IF NOT EXISTS daily_cost_cap_usd NUMERIC NULL;
