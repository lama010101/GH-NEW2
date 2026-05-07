ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;
