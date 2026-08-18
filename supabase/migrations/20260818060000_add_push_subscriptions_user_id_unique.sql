-- Enforce one push subscription per user.
-- First remove any duplicate rows for the same user, keeping the most recently active one.
DELETE FROM public.push_subscriptions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM public.push_subscriptions
  ORDER BY user_id, GREATEST(updated_at, created_at) DESC, id DESC
);

-- Add a unique constraint on user_id if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_subscriptions_user_id_key'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

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
