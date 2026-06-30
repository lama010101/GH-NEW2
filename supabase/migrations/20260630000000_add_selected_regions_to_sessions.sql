-- Add selected_regions column to sessions table
-- Stores the host's selected continents for event filtering in lobby.
-- Default '{}' (empty array) means "all regions" — no filter applied.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS selected_regions TEXT[] NOT NULL DEFAULT '{}';
