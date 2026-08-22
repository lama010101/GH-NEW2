// Query helpers for the admin dashboard Analytics / Compare / Debug tabs.
// Task: DASH-QUERIES-009
//
// All queries use the service-role pg pool (getDbPool), consistent with the
// existing page.tsx queries. No Supabase client is used.

import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Analytics — time-bucketed cost/token trend per model
// ---------------------------------------------------------------------------

export type CostTrendRow = {
  day: string;
  ai_player_id: string;
  model_name: string;
  model_id: string;
  cost: string | number;
  tokens: number;
  daily_cost_cap_usd: string | number | null;
};

export async function fetchCostTrend(
  pool: Pool,
  opts: { days?: number } = {}
): Promise<CostTrendRow[]> {
  const days = opts.days ?? 30;
  const { rows } = await pool.query<CostTrendRow>(
    `
    SELECT
      date_trunc('day', c.created_at)::date::text AS day,
      ab.ai_player_id,
      p.name AS model_name,
      p.model_id,
      COALESCE(
        SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL),
        0
      ) AS cost,
      COALESCE(
        SUM(
          COALESCE((c.response_payload->'usage'->>'prompt_tokens')::int, 0) +
          COALESCE((c.response_payload->'usage'->>'completion_tokens')::int, 0)
        ) FILTER (WHERE c.response_payload IS NOT NULL),
        0
      )::int AS tokens,
      p.daily_cost_cap_usd
    FROM ai_answer_bank ab
    JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
    JOIN ai_players p ON p.id = ab.ai_player_id
    WHERE c.created_at >= now() - ($1::int || ' days')::interval
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1 ASC, 3 ASC
    `,
    [days]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Compare — model leaderboard with aggregated accuracy / cost
// ---------------------------------------------------------------------------

export type LeaderboardRow = {
  ai_player_id: string;
  model_name: string;
  model_id: string;
  total_answers: number;
  avg_round_accuracy: number | null;
  avg_location_accuracy: number | null;
  avg_year_accuracy: number | null;
  error_rate: number;
  total_cost: string | number;
  cost_per_call: number | null;
  cost_per_accuracy_point: number | null;
};

export async function fetchLeaderboard(pool: Pool): Promise<LeaderboardRow[]> {
  const { rows } = await pool.query<LeaderboardRow>(
    `
    WITH model_stats AS (
      SELECT
        ab.ai_player_id,
        COUNT(*)::int AS total_answers,
        AVG(ab.round_accuracy) AS avg_round_accuracy,
        AVG(ab.location_accuracy) AS avg_location_accuracy,
        AVG(ab.year_accuracy) AS avg_year_accuracy,
        COUNT(*) FILTER (WHERE ab.error IS NOT NULL)::float / NULLIF(COUNT(*), 0) AS error_rate
      FROM ai_answer_bank ab
      GROUP BY ab.ai_player_id
    ),
    model_costs AS (
      SELECT
        ab.ai_player_id,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
            FILTER (WHERE c.response_payload IS NOT NULL),
          0
        ) AS total_cost,
        COUNT(*)::int AS total_calls
      FROM ai_answer_bank ab
      JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
      GROUP BY ab.ai_player_id
    )
    SELECT
      p.id AS ai_player_id,
      p.name AS model_name,
      p.model_id,
      ms.total_answers,
      ms.avg_round_accuracy,
      ms.avg_location_accuracy,
      ms.avg_year_accuracy,
      COALESCE(ms.error_rate, 0) AS error_rate,
      COALESCE(mc.total_cost, 0) AS total_cost,
      CASE WHEN mc.total_calls > 0
        THEN (COALESCE(mc.total_cost, 0) / mc.total_calls)::numeric
        ELSE NULL
      END AS cost_per_call,
      CASE WHEN ms.avg_round_accuracy IS NOT NULL AND ms.avg_round_accuracy > 0
        THEN (COALESCE(mc.total_cost, 0) / ms.avg_round_accuracy)::numeric
        ELSE NULL
      END AS cost_per_accuracy_point
    FROM ai_players p
    LEFT JOIN model_stats ms ON ms.ai_player_id = p.id
    LEFT JOIN model_costs mc ON mc.ai_player_id = p.id
    ORDER BY ms.avg_round_accuracy DESC NULLS LAST
    `
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Debug — error-bucketed rows from ai_answer_bank
// ---------------------------------------------------------------------------

export type ErrorBucket = "rate_limit" | "not_found" | "parse" | "other";

export type ErrorRow = {
  id: string;
  model_name: string;
  model_id: string;
  event_title: string;
  error: string;
  created_at: string;
};

export async function fetchErrorBuckets(
  pool: Pool,
  opts: { type?: ErrorBucket | null; limit?: number } = {}
): Promise<ErrorRow[]> {
  const limit = opts.limit ?? 50;
  const type = opts.type ?? null;

  let typeFilter = "";
  if (type === "rate_limit") {
    typeFilter =
      "AND (ab.error ILIKE '%429%' OR ab.error ILIKE '%rate limit%' OR ab.error ILIKE '%rate-limit%' OR ab.error ILIKE '%too many requests%')";
  } else if (type === "not_found") {
    typeFilter =
      "AND (ab.error ILIKE '%404%' OR ab.error ILIKE '%no endpoints found%')";
  } else if (type === "parse") {
    typeFilter =
      "AND (ab.error ILIKE '%parse%' OR ab.error ILIKE '%json%' OR ab.error ILIKE '%missing finalguess%')";
  } else if (type === "other") {
    typeFilter =
      "AND ab.error IS NOT NULL AND NOT (ab.error ILIKE '%429%' OR ab.error ILIKE '%rate limit%' OR ab.error ILIKE '%rate-limit%' OR ab.error ILIKE '%too many requests%' OR ab.error ILIKE '%404%' OR ab.error ILIKE '%no endpoints found%' OR ab.error ILIKE '%parse%' OR ab.error ILIKE '%json%' OR ab.error ILIKE '%missing finalguess%')";
  } else {
    typeFilter = "AND ab.error IS NOT NULL";
  }

  const { rows } = await pool.query<ErrorRow>(
    `
    SELECT
      ab.id,
      p.name AS model_name,
      p.model_id,
      e.title AS event_title,
      ab.error,
      ab.created_at::text AS created_at
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    JOIN events e ON e.id = ab.event_id
    WHERE 1=1 ${typeFilter}
    ORDER BY ab.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}
