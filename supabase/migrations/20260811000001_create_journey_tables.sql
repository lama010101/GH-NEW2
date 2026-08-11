-- Target: dev Supabase project jfggdhsducvjydnejypg
-- Scope: Historian's Journey v1 data model
-- Do NOT run on prod until v1 validated.

CREATE TABLE IF NOT EXISTS public.journey_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number        INT NOT NULL UNIQUE,
  title               TEXT,
  theme               TEXT,
  learning_objective  TEXT,
  difficulty_rating   INT CHECK (difficulty_rating IS NULL OR difficulty_rating BETWEEN 1 AND 10),
  min_accuracy_pct    NUMERIC NOT NULL CHECK (min_accuracy_pct BETWEEN 0 AND 100),
  pool_size           INT NOT NULL DEFAULT 5 CHECK (pool_size BETWEEN 1 AND 5),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','live')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journey_stage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID NOT NULL REFERENCES public.journey_stages(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  display_order INT NOT NULL DEFAULT 0,
  approved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_stage_events_stage_status
  ON public.journey_stage_events(stage_id, status);

CREATE TABLE IF NOT EXISTS public.journey_player_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id            UUID NOT NULL REFERENCES public.journey_stages(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','unlocked','completed')),
  best_accuracy_pct   NUMERIC CHECK (best_accuracy_pct IS NULL OR best_accuracy_pct BETWEEN 0 AND 100),
  best_badge          TEXT CHECK (best_badge IS NULL OR best_badge IN ('gold','silver','bronze','completion')),
  attempts_count      INT NOT NULL DEFAULT 0,
  first_completed_at  TIMESTAMPTZ,
  last_played_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_player_progress_player
  ON public.journey_player_progress(player_id);

CREATE TABLE IF NOT EXISTS public.journey_playthroughs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id      UUID NOT NULL REFERENCES public.journey_stages(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES public.sessions(game_id) ON DELETE SET NULL,
  accuracy_pct  NUMERIC NOT NULL CHECK (accuracy_pct BETWEEN 0 AND 100),
  badge_awarded TEXT CHECK (badge_awarded IS NULL OR badge_awarded IN ('gold','silver','bronze','completion')),
  xp_awarded    INT NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journey_playthroughs_player
  ON public.journey_playthroughs(player_id);
CREATE INDEX IF NOT EXISTS idx_journey_playthroughs_session
  ON public.journey_playthroughs(session_id);

INSERT INTO public.journey_stages (stage_number, min_accuracy_pct, pool_size, status)
VALUES
  (1,  50.00, 5, 'draft'),
  (2,  52.78, 5, 'draft'),
  (3,  55.56, 5, 'draft'),
  (4,  58.33, 5, 'draft'),
  (5,  61.11, 5, 'draft'),
  (6,  63.89, 5, 'draft'),
  (7,  66.67, 5, 'draft'),
  (8,  69.44, 5, 'draft'),
  (9,  72.22, 5, 'draft'),
  (10, 75.00, 5, 'draft')
ON CONFLICT (stage_number) DO NOTHING;

ALTER TABLE public.journey_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_player_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_playthroughs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journey_stages' AND policyname='journey_stages_select') THEN
    CREATE POLICY journey_stages_select ON public.journey_stages FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journey_player_progress' AND policyname='journey_player_progress_select_own') THEN
    CREATE POLICY journey_player_progress_select_own ON public.journey_player_progress FOR SELECT TO authenticated USING (player_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journey_playthroughs' AND policyname='journey_playthroughs_select_own') THEN
    CREATE POLICY journey_playthroughs_select_own ON public.journey_playthroughs FOR SELECT TO authenticated USING (player_id = auth.uid());
  END IF;
END $$;
