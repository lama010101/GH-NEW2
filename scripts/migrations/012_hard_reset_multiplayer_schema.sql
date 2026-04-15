-- ============================================================
-- MIGRATION 012: Hard Reset Multiplayer Schema
-- TASK: MP-DB-RESET-ENFORCE-001
-- Authority: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3 (tables 1-4)
--            MASTER IMPLEMENTATION PLAN v3.0 Sections 0.1, 0.2, 0.3, 2, 5, 6
-- Purpose: Drop legacy non-compliant multiplayer tables and recreate
--          deterministic spec-exact schema with RLS enforcement.
-- ============================================================

-- ============================================================
-- PHASE 1: HARD RESET — Drop legacy tables (CASCADE)
-- Scope: ONLY the 5 specified multiplayer tables.
-- Non-multiplayer tables are untouched.
-- ============================================================

DROP TABLE IF EXISTS public.round_events    CASCADE;
DROP TABLE IF EXISTS public.round_results   CASCADE;
DROP TABLE IF EXISTS public.round_commits   CASCADE;
DROP TABLE IF EXISTS public.session_players CASCADE;
DROP TABLE IF EXISTS public.sessions        CASCADE;

-- ============================================================
-- PHASE 2: RECREATE — Exact spec schema
-- ============================================================

-- TABLE 1: sessions
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: game_id UUID PRIMARY KEY (sole authority root)
CREATE TABLE public.sessions (
  game_id          UUID PRIMARY KEY,
  mode             VARCHAR NOT NULL,
  round_timer_sec  INT NOT NULL,
  total_rounds     INT NOT NULL,
  year_min         INT NOT NULL,
  year_max         INT NOT NULL,
  session_deadline TIMESTAMP,
  created_at       TIMESTAMP DEFAULT now()
);

-- TABLE 2: session_players
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, player_id) composite — one record per player per session
CREATE TABLE public.session_players (
  game_id   UUID,
  player_id UUID,
  joined_at TIMESTAMP DEFAULT now(),
  left_at   TIMESTAMP,
  PRIMARY KEY (game_id, player_id)
);

-- TABLE 3: round_commits
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, player_id, round_index) composite — idempotent append-only log
CREATE TABLE public.round_commits (
  game_id      UUID,
  player_id    UUID,
  round_index  INT,
  submitted_at TIMESTAMP,
  year_guess   INT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  hints_used   INT,
  score        INT,
  PRIMARY KEY (game_id, player_id, round_index)
);

-- TABLE 4: round_results
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 3.3
-- PK: (game_id, round_index, player_id) composite
-- Rule: scores recomputable from DB only (MASTER PLAN Section 6)
CREATE TABLE public.round_results (
  game_id     UUID,
  round_index INT,
  player_id   UUID,
  score       INT,
  rank        INT,
  PRIMARY KEY (game_id, round_index, player_id)
);

-- TABLE 5: round_events
-- Spec: MASTER IMPLEMENTATION PLAN v3.0 Section 0.2 (Layer 1 — Persistent Truth)
--       Section 2: "All transitions are logged in DB (round_events)"
-- PK: id UUID (surrogate — log entries are immutable, never upserted)
CREATE TABLE public.round_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID,
  round_index INT,
  event_type  VARCHAR,
  payload     JSONB,
  created_at  TIMESTAMP DEFAULT now()
);

-- ============================================================
-- PHASE 3: RLS — Row Level Security
-- Spec: FULL_CORE_GAME_MASTER_SPEC.md Section 8
-- Rule: service role = full access; authenticated = SELECT own rows only
-- ============================================================

ALTER TABLE public.sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_commits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_events    ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_own
  ON public.sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = sessions.game_id AND sp.player_id = auth.uid()
    )
  );

CREATE POLICY session_players_select_own
  ON public.session_players FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = session_players.game_id AND sp.player_id = auth.uid()
    )
  );

CREATE POLICY round_commits_select_own
  ON public.round_commits FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_commits.game_id AND sp.player_id = auth.uid()
    )
  );

CREATE POLICY round_results_select_own
  ON public.round_results FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_results.game_id AND sp.player_id = auth.uid()
    )
  );

CREATE POLICY round_events_select_own
  ON public.round_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_players sp
      WHERE sp.game_id = round_events.game_id AND sp.player_id = auth.uid()
    )
  );
