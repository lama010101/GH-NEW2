-- RANK-BUILD-ACCGATE-1103-003: high-water-mark rank storage for the accuracy gate.
-- Adds player_global_stats.max_rank_tier (1..10): the best tier the player has
-- reached; promotion is evaluated server-side and never demotes.
--
-- The XP thresholds in the backfill CASE below are a point-in-time snapshot
-- (2026-11-03) of src/core/rank.ts RANKS:
--   0 / 1000 / 5000 / 20000 / 50000 / 125000 / 300000 / 600000 / 1200000 / 2500000
-- If RANKS changes, update both.
--
-- RLS is unchanged by this migration: SELECT for authenticated remains the only
-- policy — no authenticated writes; only service-role / server code writes.

ALTER TABLE public.player_global_stats
  ADD COLUMN IF NOT EXISTS max_rank_tier INT NOT NULL DEFAULT 1
  CHECK (max_rank_tier BETWEEN 1 AND 10);

-- Idempotent backfill: lift max_rank_tier to the tier the player's lifetime XP
-- already qualifies for under the threshold snapshot above. GREATEST keeps the
-- stored value if a row is somehow already higher — never lowers it.
UPDATE public.player_global_stats
SET max_rank_tier = GREATEST(
  max_rank_tier,
  CASE
    WHEN total_xp >= 2500000 THEN 10
    WHEN total_xp >= 1200000 THEN 9
    WHEN total_xp >= 600000  THEN 8
    WHEN total_xp >= 300000  THEN 7
    WHEN total_xp >= 125000  THEN 6
    WHEN total_xp >= 50000   THEN 5
    WHEN total_xp >= 20000   THEN 4
    WHEN total_xp >= 5000    THEN 3
    WHEN total_xp >= 1000    THEN 2
    ELSE 1
  END
);
