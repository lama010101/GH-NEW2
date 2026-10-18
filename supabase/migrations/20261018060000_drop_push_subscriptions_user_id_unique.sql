-- Drop UNIQUE(user_id) on push_subscriptions so a user can hold one row per
-- device/browser subscription. Previously a second-device subscribe upserted
-- onConflict:"user_id" and overwrote the first device's endpoint, so only the
-- most recently subscribed device ever received pushes. The endpoint remains
-- UNIQUE and is now the upsert conflict key in /api/push/subscribe.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;

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
  AND tc.table_name = 'push_subscriptions';
