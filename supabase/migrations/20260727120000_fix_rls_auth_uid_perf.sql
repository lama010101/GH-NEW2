-- 20260727120000_fix_rls_auth_uid_perf.sql
-- MP-FIX-RLS-AUTHUID-PERFLINT-001
-- Wrap bare auth.uid()/auth.role() calls in (select ...) scalar subqueries
-- so PostgreSQL evaluates them once per query instead of once per row.

ALTER POLICY "daily_attempts_select_own" ON public."daily_attempts" TO authenticated USING ((player_id = (select auth.uid())));

ALTER POLICY "follows_delete" ON public."follows" TO authenticated USING ((follower_id = (select auth.uid())));

ALTER POLICY "follows_insert" ON public."follows" TO authenticated WITH CHECK ((follower_id = (select auth.uid())));

ALTER POLICY "follows_select" ON public."follows" TO authenticated USING (((follower_id = (select auth.uid())) OR (followee_id = (select auth.uid()))));

ALTER POLICY "invitations_insert" ON public."game_invitations" TO authenticated WITH CHECK ((inviter_id = (select auth.uid())));

ALTER POLICY "invitations_select" ON public."game_invitations" TO authenticated USING (((inviter_id = (select auth.uid())) OR (invitee_id = (select auth.uid()))));

ALTER POLICY "invitations_update" ON public."game_invitations" TO authenticated USING ((invitee_id = (select auth.uid()))) WITH CHECK ((invitee_id = (select auth.uid())));

ALTER POLICY "notifications_select" ON public."notifications" TO authenticated USING ((user_id = (select auth.uid())));

ALTER POLICY "notifications_update" ON public."notifications" TO authenticated USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY "player_event_ratings_insert_own" ON public."player_event_ratings" TO authenticated WITH CHECK (((select auth.uid()) = player_id));

ALTER POLICY "player_event_ratings_select_own" ON public."player_event_ratings" TO authenticated USING (((select auth.uid()) = player_id));

ALTER POLICY "player_event_ratings_update_own" ON public."player_event_ratings" TO authenticated USING (((select auth.uid()) = player_id)) WITH CHECK (((select auth.uid()) = player_id));

ALTER POLICY "player_follows_delete" ON public."player_follows" TO authenticated USING ((follower_id = (select auth.uid())));

ALTER POLICY "player_follows_insert" ON public."player_follows" TO authenticated WITH CHECK ((follower_id = (select auth.uid())));

ALTER POLICY "player_follows_select" ON public."player_follows" TO authenticated USING (((follower_id = (select auth.uid())) OR (followed_id = (select auth.uid()))));

ALTER POLICY "player_round_events_select_policy" ON public."player_round_events" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players WHERE ((session_players.game_id = player_round_events.game_id) AND (session_players.player_id = (select auth.uid()))))));

ALTER POLICY "profiles_update_own" ON public."profiles" TO authenticated USING (((select auth.uid()) = id));

ALTER POLICY "round_commits_select_policy" ON public."round_commits" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players WHERE ((session_players.game_id = round_commits.game_id) AND (session_players.player_id = (select auth.uid()))))));

ALTER POLICY "round_events_select_policy" ON public."round_events" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players WHERE ((session_players.game_id = round_events.game_id) AND (session_players.player_id = (select auth.uid()))))));

ALTER POLICY "round_hints_select" ON public."round_hints" TO authenticated USING ((player_id = (select auth.uid())));

ALTER POLICY "round_results_select_policy" ON public."round_results" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players WHERE ((session_players.game_id = round_results.game_id) AND (session_players.player_id = (select auth.uid()))))));

ALTER POLICY "session_players_select_policy" ON public."session_players" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players sp WHERE ((sp.game_id = session_players.game_id) AND (sp.player_id = (select auth.uid()))))));

ALTER POLICY "sessions_select_policy" ON public."sessions" TO authenticated USING ((EXISTS ( SELECT 1 FROM session_players WHERE ((session_players.game_id = sessions.game_id) AND (session_players.player_id = (select auth.uid()))))));
