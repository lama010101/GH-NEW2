-- ============================================================
-- MIGRATION 014: RLS Enforcement — All Multiplayer Tables
-- TASK: MP-DB-RESET-ENFORCE-001
-- Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 8
-- Rule: "PartyKit service role can INSERT/UPDATE; players (authenticated role)
--        can SELECT only their own rows in session_players, round_commits, round_results"
-- Policies:
--   service_role  → bypasses RLS automatically (no explicit policy needed)
--   authenticated → SELECT only (no INSERT/UPDATE/DELETE policies = implicit deny)
-- Append-only invariant: NO UPDATE policies defined anywhere — enforced here.
-- ============================================================

-- ============================================================
-- 1. ENABLE ROW LEVEL SECURITY ON ALL 5 TABLES
-- ============================================================
ALTER TABLE public.sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_commits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_events    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. AUTHENTICATED USER: SELECT-ONLY POLICIES
-- No INSERT/UPDATE/DELETE policies → implicit deny for authenticated role.
-- Service role bypasses RLS entirely (Supabase default behavior).
-- ============================================================

-- sessions: authenticated user can SELECT sessions they are a member of
CREATE POLICY sessions_select_own
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = sessions.game_id
        AND sp.player_id = auth.uid()
    )
  );

-- session_players: authenticated user can SELECT own row + co-players in same session
CREATE POLICY session_players_select_own
  ON public.session_players
  FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = session_players.game_id
        AND sp.player_id = auth.uid()
    )
  );

-- round_commits: authenticated user can SELECT own commits + co-players' commits
CREATE POLICY round_commits_select_own
  ON public.round_commits
  FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_commits.game_id
        AND sp.player_id = auth.uid()
    )
  );

-- round_results: authenticated user can SELECT results for sessions they participated in
CREATE POLICY round_results_select_own
  ON public.round_results
  FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_results.game_id
        AND sp.player_id = auth.uid()
    )
  );

-- round_events: authenticated user can SELECT events for sessions they participated in
CREATE POLICY round_events_select_own
  ON public.round_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_events.game_id
        AND sp.player_id = auth.uid()
    )
  );
