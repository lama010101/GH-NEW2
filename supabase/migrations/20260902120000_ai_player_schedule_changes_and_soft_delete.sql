-- Migration: ai_player_schedule_changes + ai_players soft delete
-- Task: AIP-BUILD-PRODASHBOARD-FULLUIX-002
-- Additive only: new table + new nullable column. No existing data touched.

-- Scheduled future enable/disable changes for AI player mode flags.
-- Applied by the cron route /api/cron/apply-ai-schedule-changes.
CREATE TABLE IF NOT EXISTS public.ai_player_schedule_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_player_id UUID NOT NULL REFERENCES public.ai_players(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('practice','daily')),
  target_value BOOLEAN NOT NULL,
  apply_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled')),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_player_schedule_changes_due
  ON public.ai_player_schedule_changes (apply_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_player_schedule_changes_player
  ON public.ai_player_schedule_changes (ai_player_id);

-- Soft delete for AI players (trash/restore). NULL = not trashed.
ALTER TABLE public.ai_players
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Service-role only; no authenticated policies (mirrors ai_players RLS pattern).
ALTER TABLE public.ai_player_schedule_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ai_player_schedule_changes_service_role"
  ON public.ai_player_schedule_changes FOR SELECT TO service_role USING (true);
