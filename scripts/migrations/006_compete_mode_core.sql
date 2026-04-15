ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS round_timer_sec INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS total_rounds INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS year_min INTEGER NOT NULL DEFAULT -100,
  ADD COLUMN IF NOT EXISTS year_max INTEGER NOT NULL DEFAULT 2026,
  ADD COLUMN IF NOT EXISTS host_player_id UUID,
  ADD COLUMN IF NOT EXISTS session_deadline TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.session_players (
  game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  ready BOOLEAN NOT NULL DEFAULT false,
  is_host BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, player_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'round_commits'
      AND column_name = 'player_id'
  ) THEN
    ALTER TABLE public.round_commits ADD COLUMN player_id UUID;
  END IF;
END $$;

UPDATE public.round_commits
SET player_id = '00000000-0000-0000-0000-000000000000'
WHERE player_id IS NULL;

ALTER TABLE public.round_commits
  ALTER COLUMN player_id SET DEFAULT '00000000-0000-0000-0000-000000000000',
  ALTER COLUMN player_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.round_commits'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (game_id, player_id, round_index)'
  ) THEN
    ALTER TABLE public.round_commits DROP CONSTRAINT IF EXISTS round_commits_pkey;
    ALTER TABLE public.round_commits ADD PRIMARY KEY (game_id, player_id, round_index);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.round_results (
  game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index < 5),
  player_id UUID NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  accuracy_score INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, round_index, player_id)
);

UPDATE public.sessions
SET host_player_id = '00000000-0000-0000-0000-000000000000'
WHERE mode = 'practice' AND host_player_id IS NULL;

INSERT INTO public.session_players (game_id, player_id, display_name, joined_at, ready, is_host)
SELECT s.game_id, '00000000-0000-0000-0000-000000000000', 'Practice Player', s.created_at, true, true
FROM public.sessions s
WHERE s.mode = 'practice'
ON CONFLICT (game_id, player_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sessions_mode ON public.sessions(mode);
CREATE INDEX IF NOT EXISTS idx_sessions_host_player_id ON public.sessions(host_player_id);
CREATE INDEX IF NOT EXISTS idx_session_players_game_id ON public.session_players(game_id);
CREATE INDEX IF NOT EXISTS idx_session_players_ready ON public.session_players(game_id, ready);
CREATE INDEX IF NOT EXISTS idx_round_commits_game_round_player ON public.round_commits(game_id, round_index, player_id);
CREATE INDEX IF NOT EXISTS idx_round_results_game_round ON public.round_results(game_id, round_index);
