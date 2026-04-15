CREATE TABLE IF NOT EXISTS public.sessions (
    game_id UUID PRIMARY KEY,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_events (
    game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index < 5),
    event_id UUID NOT NULL REFERENCES public.events(id),
    PRIMARY KEY (game_id, round_index)
);

CREATE TABLE IF NOT EXISTS public.round_timing (
    game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index < 5),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (game_id, round_index)
);

CREATE TABLE IF NOT EXISTS public.round_commits (
    game_id UUID NOT NULL REFERENCES public.sessions(game_id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL CHECK (round_index >= 0 AND round_index < 5),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    year_guess INTEGER,
    location_guess JSONB,
    hints_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_payload JSONB NOT NULL,
    PRIMARY KEY (game_id, round_index)
);

CREATE INDEX IF NOT EXISTS idx_session_events_event_id ON public.session_events(event_id);
CREATE INDEX IF NOT EXISTS idx_round_timing_started_at ON public.round_timing(started_at);
CREATE INDEX IF NOT EXISTS idx_round_commits_game_id ON public.round_commits(game_id);
