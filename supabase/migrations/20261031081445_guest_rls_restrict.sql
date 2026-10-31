-- GUEST-RLS-HARDEN-1031-002: anonymous users must not write social/push tables directly.
-- Rollback: DROP POLICY IF EXISTS <name> ON public.<table>; for each policy below.
DROP POLICY IF EXISTS guest_block_follows_insert ON public.follows;
CREATE POLICY guest_block_follows_insert ON public.follows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
DROP POLICY IF EXISTS guest_block_player_follows_insert ON public.player_follows;
CREATE POLICY guest_block_player_follows_insert ON public.player_follows AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
DROP POLICY IF EXISTS guest_block_game_invitations_insert ON public.game_invitations;
CREATE POLICY guest_block_game_invitations_insert ON public.game_invitations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
DROP POLICY IF EXISTS guest_block_push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY guest_block_push_subscriptions_insert ON public.push_subscriptions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
DROP POLICY IF EXISTS guest_block_fcm_tokens_insert ON public.fcm_tokens;
CREATE POLICY guest_block_fcm_tokens_insert ON public.fcm_tokens AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
