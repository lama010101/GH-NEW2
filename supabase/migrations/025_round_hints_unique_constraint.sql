-- Migration 025: add unique constraint to round_hints
-- Prevents duplicate hint rows if the same hint is submitted twice.
-- ON CONFLICT DO NOTHING on INSERT now has an actual constraint to enforce.

ALTER TABLE public.round_hints
  ADD CONSTRAINT round_hints_unique_per_player_round_hint
  UNIQUE (game_id, player_id, round_index, hint_id);
