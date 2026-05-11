-- Add room_code to sessions for human-readable join codes
ALTER TABLE public.sessions
  ADD COLUMN room_code VARCHAR(8) UNIQUE;

-- Generate room codes for any existing sessions that lack one
UPDATE public.sessions
SET room_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE room_code IS NULL;

-- Now enforce NOT NULL
ALTER TABLE public.sessions
  ALTER COLUMN room_code SET NOT NULL;

-- Index for fast lookup by room code
CREATE UNIQUE INDEX idx_sessions_room_code ON public.sessions (room_code);
