-- Extend notifications.type CHECK constraint to allow 'session_complete'.
-- Per RELAX_MODE_SPEC.md §5: in-app notification fires when a player completes
-- their final (5th) round in a Relax (async) session, sent to other active
-- session players. The existing CHECK only allowed 'lobby_invite',
-- 'friend_joined', 'game_started'. This adds 'session_complete' to that list.
--
-- The column constraint was originally defined inline in
-- 20260528120000_create_invite_and_notifications_schema.sql line 33, which
-- PostgreSQL auto-names as 'notifications_type_check'.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('lobby_invite', 'friend_joined', 'game_started', 'session_complete'));
