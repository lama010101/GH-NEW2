-- Create fcm_tokens table for native (Capacitor/FCM) push registration tokens.
-- One row per device token per user. Separate from push_subscriptions, which is
-- VAPID/web-push-specific (endpoint/p256dh/auth are NOT NULL with no default).
--
-- Dedup + RLS mirror the push_subscriptions precedent
-- (20260816060000_create_push_subscriptions.sql).

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fcm_tokens_user_id_token_key UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id
  ON public.fcm_tokens (user_id);

-- Enable RLS
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only manage their own tokens.
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

-- Give the postgres/service-role role explicit table access (bypasses RLS by default).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fcm_tokens TO postgres;

-- Verification
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
  AND tc.table_name = kcu.table_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'fcm_tokens';
