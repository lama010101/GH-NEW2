-- EDQ-BUILD-ADMINGEN-1122-815 — admin prompt+image generator audit log.
-- Sorts after 20261122120000_ai_image_chrono_flags.sql.
--
--   * image_generation_log — one row per generation attempt (route or CLI).
--     pending -> completed | failed on the provider/storage leg;
--     completed -> accepted | rejected by the admin review action.
--     accepted rows carry the public Supabase Storage URL + object path
--     that the accept transaction copies into public.images.
--
-- Fully idempotent: CREATE TABLE/INDEX IF NOT EXISTS. RLS enabled with
-- ZERO policies, REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT ALL to
-- service_role only — same posture as ai_image_chrono_flags /
-- ai_fleet_runs / ai_answer_bank.

CREATE TABLE IF NOT EXISTS public.image_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  admin_user_id uuid,
  event_id uuid,
  candidate_id uuid,
  model_id text NOT NULL,
  provider text NOT NULL,
  prompt text NOT NULL,
  negative_prompt text,
  image_url text,
  storage_path text,
  cost_usd numeric,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'rejected', 'accepted')),
  error text,
  duration_ms integer
);

-- Spend-cap + per-admin lookups filter on (admin_user_id, created_at).
CREATE INDEX IF NOT EXISTS image_generation_log_admin_day_idx
  ON public.image_generation_log (admin_user_id, created_at);

CREATE INDEX IF NOT EXISTS image_generation_log_event_idx
  ON public.image_generation_log (event_id);

ALTER TABLE public.image_generation_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.image_generation_log FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.image_generation_log TO service_role;
