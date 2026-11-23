-- EDQ-BUILD-BENCHWIRE-1122-816 — AI benchmark leaderboard view.
--
-- public.ai_benchmark_leaderboard: per ai_players row (model), aggregates
-- over ai_benchmark_attempts joined to ai_benchmark_runs (set + player) and
-- ai_answer_bank (the game's evaluateRound scores stored per play).
--
--   events_played       distinct events with outcome='success'
--   pct_year_correct    % of scored plays with year_accuracy >= 90
--   pct_location_correct % of scored plays with location_accuracy >= 90
--   mean_score          avg round_accuracy (0-100, game scoring)
--   mean_cost_usd       avg attempt cost_usd
--   reasoning_rate      % of attempts with reasoning_present
--   failure_rate        % of attempts with outcome <> 'success'
--
-- "Correct" reuses the game's own badge-tier threshold: accuracy >= 90 is
-- the bronze tier boundary in src/core/rules.ts calculateBadges — no new
-- scoring formula is invented; all scores come from evaluateRound via
-- ai_answer_bank.
--
-- Access: service_role only (same posture as the benchmark tables).
-- security_invoker so the view never widens the caller's rights.
-- NOT applied by hand — CI applies after merge.

CREATE OR REPLACE VIEW public.ai_benchmark_leaderboard
WITH (security_invoker = true) AS
SELECT
  p.id AS ai_player_id,
  p.model_id,
  p.name AS player_name,
  r.set_id,
  s.version AS set_version,
  s.name AS set_name,
  count(DISTINCT a.event_id) FILTER (WHERE a.outcome = 'success') AS events_played,
  count(*) FILTER (WHERE a.outcome = 'success') AS attempts_scored,
  round(
    100.0 * count(*) FILTER (
      WHERE a.outcome = 'success' AND b.year_accuracy >= 90
    ) / NULLIF(count(*) FILTER (WHERE a.outcome = 'success' AND b.id IS NOT NULL), 0),
    2
  ) AS pct_year_correct,
  round(
    100.0 * count(*) FILTER (
      WHERE a.outcome = 'success' AND b.location_accuracy >= 90
    ) / NULLIF(count(*) FILTER (WHERE a.outcome = 'success' AND b.id IS NOT NULL), 0),
    2
  ) AS pct_location_correct,
  round(avg(b.round_accuracy) FILTER (WHERE a.outcome = 'success'), 2) AS mean_score,
  round(avg(a.cost_usd), 6) AS mean_cost_usd,
  round(
    100.0 * count(*) FILTER (WHERE a.reasoning_present) / NULLIF(count(*), 0),
    2
  ) AS reasoning_rate,
  round(
    100.0 * count(*) FILTER (WHERE a.outcome <> 'success') / NULLIF(count(*), 0),
    2
  ) AS failure_rate
FROM public.ai_benchmark_attempts a
JOIN public.ai_benchmark_runs r ON r.id = a.run_id
JOIN public.ai_benchmark_sets s ON s.id = r.set_id
JOIN public.ai_players p ON p.id = r.ai_player_id
LEFT JOIN public.ai_answer_bank b ON b.id = a.ai_answer_bank_id
GROUP BY p.id, p.model_id, p.name, r.set_id, s.version, s.name;

REVOKE ALL ON public.ai_benchmark_leaderboard FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_benchmark_leaderboard TO service_role;
