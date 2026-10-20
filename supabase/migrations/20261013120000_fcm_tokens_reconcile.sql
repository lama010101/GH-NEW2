-- Reconcile migration: capture the live PROD public.fcm_tokens table (created
-- out-of-band for the Android FCM push track) as a replayable migration.
-- One row per registered FCM device token per user.
-- Idempotent: safe to run against a database where the table already exists.

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_user_id_token_key
  ON public.fcm_tokens (user_id, token);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id
  ON public.fcm_tokens (user_id);

-- Enable RLS
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only manage their own token rows.
-- Service-role clients bypass RLS for the sender path.
DROP POLICY IF EXISTS "fcm_tokens_select_own" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_select_own"
  ON public.fcm_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "fcm_tokens_insert_own" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_insert_own"
  ON public.fcm_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fcm_tokens_update_own" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_update_own"
  ON public.fcm_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fcm_tokens_delete_own" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_delete_own"
  ON public.fcm_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());
