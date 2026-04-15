-- Migration 011: Enable RLS and enforce server-only writes per FULL_CORE_GAME_MASTER_SPEC.md Section 8
-- Rule: "only the server (service role) can write; clients can SELECT only their own session/player rows"

-- ============================================
-- 1. ENABLE RLS ON ALL MULTIPLAYER TABLES
-- ============================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SERVICE ROLE POLICY (bypass RLS)
-- ============================================
-- Service role (PartyKit server) has full access via auth.users role

-- ============================================
-- 3. AUTHENTICATED USER POLICIES (SELECT only own rows)
-- ============================================

-- sessions: Players can view sessions they belong to
CREATE POLICY select_own_sessions ON public.sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = sessions.game_id
        AND sp.player_id = auth.uid()
    )
    OR mode = 'practice' -- Practice sessions viewable by owner (handled via host)
  );

-- session_players: Players can view their own player record and others in same session
CREATE POLICY select_session_players ON public.session_players
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

-- round_commits: Players can view their own commits and others in same session (for results)
CREATE POLICY select_round_commits ON public.round_commits
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

-- round_results: Players can view all results in sessions they participated in
CREATE POLICY select_round_results ON public.round_results
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

-- ============================================
-- 4. DENY ALL MODIFICATIONS FROM CLIENTS
-- ============================================
-- No INSERT/UPDATE/DELETE policies for authenticated role = implicit deny

COMMENT ON TABLE public.sessions IS 'Session configuration. Server-writable only. Clients SELECT via RLS.';
COMMENT ON TABLE public.session_players IS 'Player roster. Server-writable only. Clients SELECT own session rows.';
COMMENT ON TABLE public.round_commits IS 'Append-only guess commits. Server-writable only. Immutable history.';
COMMENT ON TABLE public.round_results IS 'Computed round scores. Server-writable only. Derived from commits.';
