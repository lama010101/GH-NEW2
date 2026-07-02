-- SECURITY: Restrict RLS SELECT policies on multiplayer tables.
-- Replaces USING (true) (any authenticated user can read ANY game's data)
-- with participant-scoped policies (users can only read games they joined).
--
-- Tables: sessions, session_players, round_commits, round_results, round_events
--
-- The service-role client (used by API routes + sessionCore.ts) bypasses RLS,
-- so this only affects direct client-side Supabase queries (supabaseBrowser).
-- A malicious user using the anon key from their browser can no longer read
-- other people's game data.

-- ── sessions ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sessions_select_policy ON public.sessions;
CREATE POLICY sessions_select_policy ON public.sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players
            WHERE game_id = sessions.game_id AND player_id = auth.uid())
  );

-- ── session_players ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS session_players_select_policy ON public.session_players;
CREATE POLICY session_players_select_policy ON public.session_players
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players sp
            WHERE sp.game_id = session_players.game_id
              AND sp.player_id = auth.uid())
  );

-- ── round_commits ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS round_commits_select_policy ON public.round_commits;
CREATE POLICY round_commits_select_policy ON public.round_commits
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players
            WHERE game_id = round_commits.game_id AND player_id = auth.uid())
  );

-- ── round_results ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS round_results_select_policy ON public.round_results;
CREATE POLICY round_results_select_policy ON public.round_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players
            WHERE game_id = round_results.game_id AND player_id = auth.uid())
  );

-- ── round_events ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS round_events_select_policy ON public.round_events;
CREATE POLICY round_events_select_policy ON public.round_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.session_players
            WHERE game_id = round_events.game_id AND player_id = auth.uid())
  );
