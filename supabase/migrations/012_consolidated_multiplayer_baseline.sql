-- ============================================================================
-- CONSOLIDATED MULTIPLAYER BASELINE
-- Task: MP-FIX-MIGRATION-001
-- Date: 2026-05-18
-- Reconstructed from live DB audit (MP-INV-MIGRATION-001).
-- Replaces missing migrations 012–023.
-- Safe to run on existing DB: uses IF NOT EXISTS throughout.
-- ============================================================================

-- sessions: core game session record
CREATE TABLE IF NOT EXISTS public.sessions (
  game_id                  UUID         NOT NULL,
  mode                     VARCHAR      NOT NULL,
  round_timer_sec          INT          NOT NULL,
  total_rounds             INT          NOT NULL,
  year_min                 INT          NOT NULL,
  year_max                 INT          NOT NULL,
  session_deadline         TIMESTAMP    NULL,
  created_at               TIMESTAMP    NULL DEFAULT now(),
  seed                     BIGINT       NOT NULL DEFAULT 0,
  room_code                VARCHAR(8)   NOT NULL,
  results_auto_advance_sec INT          NOT NULL DEFAULT 10,
  CONSTRAINT sessions_pkey PRIMARY KEY (game_id),
  CONSTRAINT sessions_room_code_key UNIQUE (room_code)
);

-- session_players: players joined to a session
CREATE TABLE IF NOT EXISTS public.session_players (
  game_id      UUID         NOT NULL,
  player_id    UUID         NOT NULL,
  joined_at    TIMESTAMP    NULL DEFAULT now(),
  left_at      TIMESTAMP    NULL,
  display_name VARCHAR(32)  NOT NULL DEFAULT '',
  ready        BOOLEAN      NOT NULL DEFAULT false,
  is_host      BOOLEAN      NOT NULL DEFAULT false,
  avatar_url   TEXT         NULL,
  CONSTRAINT session_players_pkey PRIMARY KEY (game_id, player_id)
);

-- Enforce single host per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_players_one_host_per_game
  ON public.session_players (game_id)
  WHERE is_host = true;

-- round_commits: append-only guess log, one row per player per round
CREATE TABLE IF NOT EXISTS public.round_commits (
  game_id            UUID             NOT NULL,
  player_id          UUID             NOT NULL,
  round_index        INT              NOT NULL,
  submitted_at       TIMESTAMP        NULL,
  year_guess         INT              NULL,
  location_lat       DOUBLE PRECISION NULL,
  location_lng       DOUBLE PRECISION NULL,
  hints_used         INT              NULL,
  score              INT              NULL,
  verification_token UUID             NOT NULL DEFAULT gen_random_uuid(),
  acc_penalty        INT              NOT NULL DEFAULT 0,
  CONSTRAINT round_commits_pkey PRIMARY KEY (game_id, player_id, round_index)
);

-- round_results: computed scores per player per round
CREATE TABLE IF NOT EXISTS public.round_results (
  game_id            UUID             NOT NULL,
  round_index        INT              NOT NULL,
  player_id          UUID             NOT NULL,
  score              INT              NULL,
  rank               INT              NULL,
  distance_km        DOUBLE PRECISION NULL,
  year_diff          INT              NULL,
  location_score     INT              NULL,
  time_score         INT              NULL,
  verification_token UUID             NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT round_results_pkey PRIMARY KEY (game_id, round_index, player_id)
);

-- round_events: append-only phase transition and audit log
CREATE TABLE IF NOT EXISTS public.round_events (
  id                 BIGINT    NOT NULL DEFAULT nextval('round_events_id_seq'),
  game_id            UUID      NULL,
  round_index        INT       NULL,
  event_type         VARCHAR   NULL,
  payload            JSONB     NULL,
  created_at         TIMESTAMP NULL DEFAULT now(),
  verification_token UUID      NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT round_events_pkey PRIMARY KEY (id)
);

-- Sequence for round_events.id (created before the table if not exists)
CREATE SEQUENCE IF NOT EXISTS round_events_id_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Enforce one ROUND_STARTED event per (game_id, round_index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_round_events_unique_round_started
  ON public.round_events (game_id, round_index)
  WHERE event_type = 'ROUND_STARTED';

-- Enable RLS on all tables
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_commits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_events    ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can SELECT only
-- Service role bypasses RLS and can INSERT/UPDATE/DELETE

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sessions' AND policyname = 'sessions_select_policy'
  ) THEN
    CREATE POLICY sessions_select_policy ON public.sessions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_players' AND policyname = 'session_players_select_policy'
  ) THEN
    CREATE POLICY session_players_select_policy ON public.session_players
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round_commits' AND policyname = 'round_commits_select_policy'
  ) THEN
    CREATE POLICY round_commits_select_policy ON public.round_commits
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round_results' AND policyname = 'round_results_select_policy'
  ) THEN
    CREATE POLICY round_results_select_policy ON public.round_results
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'round_events' AND policyname = 'round_events_select_policy'
  ) THEN
    CREATE POLICY round_events_select_policy ON public.round_events
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
