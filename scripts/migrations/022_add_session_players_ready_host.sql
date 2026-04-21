-- ============================================================
-- MIGRATION 022: session_players.ready + session_players.is_host
-- TASK: MP-STATE-COMPLETION-004
--
-- Purpose:
--   - Persist per-player ready state in DB (no more PartyKit or
--     sessionCore synthesising `ready: true`).
--   - Persist host identity deterministically (set once at
--     SESSION_CREATED insert time). No derivation from events required.
--
-- Rules (FULL_CORE_GAME_MASTER_SPEC.md §3.3, invariant 5):
--   - DB is the only source of truth.
--   - No fallback defaults at read time.
--
-- Defaults:
--   - `ready`   BOOLEAN NOT NULL DEFAULT false
--       → rationale: new joiners are NOT ready; they must opt in.
--   - `is_host` BOOLEAN NOT NULL DEFAULT false
--       → rationale: only the session creator is host; all other
--         INSERTs inherit false.
--
-- Host invariant (enforced application-side + partial index below):
--   - At most ONE player per session may have is_host = true.
-- ============================================================

ALTER TABLE public.session_players
  ADD COLUMN IF NOT EXISTS ready   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_host BOOLEAN NOT NULL DEFAULT false;

-- Enforce single-host invariant at the DB level:
-- UNIQUE partial index ensures at most one (game_id) row with is_host = true.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_players_one_host_per_game
  ON public.session_players (game_id)
  WHERE is_host = true;
