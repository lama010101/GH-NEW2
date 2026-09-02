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

// ---------------------------------------------------------------------------
// Events — per-event aggregate list + unified leaderboard drilldown
// Task: AIP-BUILD-EVENTLEADERBOARD-001
// ---------------------------------------------------------------------------

export type EventListRow = {
  id: string;
  title: string;
  event_year: number;
  total_plays: number;
  avg_xp: string | number;
  avg_accuracy: number;
  human_plays: number;
  ai_plays: number;
  modes: string | null;
  total_count: number;
};

export async function fetchEventsList(
  pool: Pool,
  opts: {
    mode?: string | null;
    playerType?: "ai" | "human" | "both" | null;
    sort?: string;
    dir?: "asc" | "desc";
    limit?: number;
    offset?: number;
  } = {}
): Promise<EventListRow[]> {
  const mode = opts.mode ?? null;
  const playerType = opts.playerType ?? null;
  const sort = opts.sort ?? "total_plays";
  const dir = opts.dir === "asc" ? "asc" : "desc";
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;

  const nulls = dir === "asc" ? "NULLS FIRST" : "NULLS LAST";
  const sortExpr = (() => {
    switch (sort) {
      case "title": return `e.title ${dir.toUpperCase()}`;
      case "event_year": return `e.event_year ${dir.toUpperCase()} ${nulls}`;
      case "avg_xp": return `avg_xp ${dir.toUpperCase()} ${nulls}`;
      case "avg_accuracy": return `avg_accuracy ${dir.toUpperCase()} ${nulls}`;
      case "human_plays": return `human_plays ${dir.toUpperCase()} ${nulls}`;
      case "ai_plays": return `ai_plays ${dir.toUpperCase()} ${nulls}`;
      default: return `total_plays ${dir.toUpperCase()} ${nulls}`;
    }
  })();

  const params: (string | number)[] = [];
  let paramIdx = 1;

  let modeFilter = "";
  if (mode) {
    params.push(mode);
    modeFilter = `AND ap.mode = $${paramIdx}`;
    paramIdx++;
  }

  let playerTypeFilter = "";
  if (playerType === "ai") {
    playerTypeFilter = "AND ai_plays > 0 AND human_plays = 0";
  } else if (playerType === "human") {
    playerTypeFilter = "AND human_plays > 0 AND ai_plays = 0";
  } else if (playerType === "both") {
    playerTypeFilter = "AND ai_plays > 0 AND human_plays > 0";
  }

  params.push(limit);
  const limitIdx = paramIdx++;
  params.push(offset);
  const offsetIdx = paramIdx++;

  const { rows } = await pool.query<EventListRow>(
    `
    WITH human_plays AS (
      SELECT
        (re.payload->>'eventId')::uuid AS event_id,
        rr.score,
        s.mode
      FROM round_results rr
      JOIN round_events re
        ON re.game_id = rr.game_id
       AND re.round_index = rr.round_index
       AND re.event_type = 'ROUND_STARTED'
      JOIN sessions s ON s.game_id = rr.game_id
      WHERE re.payload->>'eventId' IS NOT NULL
        AND rr.score IS NOT NULL
    ),
    ai_plays AS (
      SELECT
        ab.event_id,
        ab.round_xp AS score,
        NULL::varchar AS mode
      FROM ai_answer_bank ab
      WHERE ab.round_xp IS NOT NULL
    ),
    all_plays AS (
      SELECT event_id, score, mode FROM human_plays
      UNION ALL
      SELECT event_id, score, mode FROM ai_plays
    )
    SELECT
      e.id,
      e.title,
      e.event_year,
      COUNT(*)::int AS total_plays,
      AVG(ap.score)::numeric(10,2) AS avg_xp,
      ROUND(AVG(ap.score) / 2)::int AS avg_accuracy,
      COUNT(*) FILTER (WHERE ap.mode IS NOT NULL)::int AS human_plays,
      COUNT(*) FILTER (WHERE ap.mode IS NULL)::int AS ai_plays,
      STRING_AGG(DISTINCT ap.mode, ', ') FILTER (WHERE ap.mode IS NOT NULL) AS modes,
      COUNT(*) OVER() AS total_count
    FROM all_plays ap
    JOIN events e ON e.id = ap.event_id
    WHERE 1=1 ${modeFilter} ${playerTypeFilter}
    GROUP BY e.id, e.title, e.event_year
    ORDER BY ${sortExpr}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );
  return rows;
}

export type EventLeaderboardRow = {
  player_id: string;
  player_type: "human" | "ai";
  display_name: string;
  avatar_url: string | null;
  score: number;
  accuracy_pct: number;
  location_score: number | null;
  time_score: number | null;
  mode: string | null;
  rank: number | null;
  reasoning: string | null;
  critique_error: string | null;
  image_quality_score: number | null;
  image_quality_notes: string | null;
};

export async function fetchEventLeaderboard(
  pool: Pool,
  eventId: string,
  opts: { playerType?: "ai" | "human" | null } = {}
): Promise<EventLeaderboardRow[]> {
  const playerType = opts.playerType ?? null;

  let typeFilter = "";
  if (playerType === "ai") {
    typeFilter = "WHERE player_type = 'ai'";
  } else if (playerType === "human") {
    typeFilter = "WHERE player_type = 'human'";
  }

  const { rows } = await pool.query<EventLeaderboardRow>(
    `
    WITH human_side AS (
      SELECT
        rr.player_id,
        'human' AS player_type,
        COALESCE(sp.display_name, '') AS display_name,
        sp.avatar_url,
        rr.score,
        ROUND(rr.score / 2.0)::int AS accuracy_pct,
        rr.location_score,
        rr.time_score,
        s.mode,
        rr.rank,
        NULL::text AS reasoning,
        NULL::text AS critique_error,
        NULL::int AS image_quality_score,
        NULL::text AS image_quality_notes,
        ROW_NUMBER() OVER (PARTITION BY rr.player_id ORDER BY rr.score DESC) AS rn
      FROM round_results rr
      JOIN round_events re
        ON re.game_id = rr.game_id
       AND re.round_index = rr.round_index
       AND re.event_type = 'ROUND_STARTED'
      JOIN sessions s ON s.game_id = rr.game_id
      LEFT JOIN session_players sp
        ON sp.game_id = rr.game_id
       AND sp.player_id = rr.player_id
      WHERE (re.payload->>'eventId')::uuid = $1::uuid
        AND rr.score IS NOT NULL
    ),
    ai_side AS (
      SELECT
        ab.ai_player_id AS player_id,
        'ai' AS player_type,
        ap.name AS display_name,
        ap.avatar_url,
        ab.round_xp AS score,
        ab.round_accuracy AS accuracy_pct,
        ab.location_accuracy AS location_score,
        ab.year_accuracy AS time_score,
        NULL::varchar AS mode,
        NULL::int AS rank,
        ab.reasoning,
        ab.critique_error,
        ab.image_quality_score,
        ab.image_quality_notes
      FROM ai_answer_bank ab
      JOIN ai_players ap ON ap.id = ab.ai_player_id
      WHERE ab.event_id = $1::uuid
        AND ab.round_xp IS NOT NULL
    ),
    combined AS (
      SELECT
        player_id, player_type, display_name, avatar_url, score,
        accuracy_pct, location_score, time_score, mode, rank,
        reasoning, critique_error, image_quality_score, image_quality_notes
      FROM human_side WHERE rn = 1
      UNION ALL
      SELECT
        player_id, player_type, display_name, avatar_url, score,
        accuracy_pct, location_score, time_score, mode, rank,
        reasoning, critique_error, image_quality_score, image_quality_notes
      FROM ai_side
    )
    SELECT
      player_id,
      player_type,
      display_name,
      avatar_url,
      score,
      accuracy_pct,
      location_score,
      time_score,
      mode,
      rank,
      reasoning,
      critique_error,
      image_quality_score,
      image_quality_notes,
      ROW_NUMBER() OVER (ORDER BY score DESC) AS synthetic_rank
    FROM combined
    ${typeFilter}
    ORDER BY score DESC
    `,
    [eventId]
  );
  return rows.map((r) => ({ ...r, rank: r.rank }));
}

export type EventModeBreakdownRow = {
  mode: string;
  play_count: number;
};

export async function fetchEventModeBreakdown(
  pool: Pool,
  eventId: string
): Promise<EventModeBreakdownRow[]> {
  const { rows } = await pool.query<EventModeBreakdownRow>(
    `
    SELECT
      s.mode,
      COUNT(*)::int AS play_count
    FROM round_results rr
    JOIN round_events re
      ON re.game_id = rr.game_id
     AND re.round_index = rr.round_index
     AND re.event_type = 'ROUND_STARTED'
    JOIN sessions s ON s.game_id = rr.game_id
    WHERE (re.payload->>'eventId')::uuid = $1::uuid
      AND rr.score IS NOT NULL
    GROUP BY s.mode
    ORDER BY play_count DESC
    `,
    [eventId]
  );
  return rows;
}

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

// ---------------------------------------------------------------------------
// Overview Phase A — roster health, recent activity, recent errors, cost week
// Task: AIP-BUILD-PRODASHBOARD-OVERVIEWKPI-001
// ---------------------------------------------------------------------------

export type RosterHealthRow = {
  id: string;
  name: string;
  model_id: string;
  is_active: boolean;
  is_active_practice: boolean;
  is_active_daily: boolean;
  daily_cost_cap_usd: string | number | null;
  calls_24h: number;
  errors_24h: number;
  cost_24h: string | number;
  last_call_at: string | null;
};

export async function fetchRosterHealth(
  pool: Pool
): Promise<RosterHealthRow[]> {
  const { rows } = await pool.query<RosterHealthRow>(
    `
    WITH calls_24h AS (
      SELECT
        ab.ai_player_id,
        COUNT(*)::int AS calls_24h,
        COUNT(*) FILTER (
          WHERE c.response_payload IS NULL OR c.error IS NOT NULL
        )::int AS errors_24h,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
            FILTER (WHERE c.response_payload IS NOT NULL),
          0
        ) AS cost_24h
      FROM ai_answer_bank ab
      JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
      WHERE c.created_at >= now() - interval '24 hours'
      GROUP BY ab.ai_player_id
    ),
    last_calls AS (
      SELECT
        ab.ai_player_id,
        MAX(c.created_at) AS last_call_at
      FROM ai_answer_bank ab
      JOIN ai_answer_bank_calls c ON c.ai_answer_bank_id = ab.id
      GROUP BY ab.ai_player_id
    )
    SELECT
      p.id,
      p.name,
      p.model_id,
      p.is_active,
      p.is_active_practice,
      p.is_active_daily,
      p.daily_cost_cap_usd,
      COALESCE(c24.calls_24h, 0)::int AS calls_24h,
      COALESCE(c24.errors_24h, 0)::int AS errors_24h,
      COALESCE(c24.cost_24h, 0) AS cost_24h,
      lc.last_call_at::text AS last_call_at
    FROM ai_players p
    LEFT JOIN calls_24h c24 ON c24.ai_player_id = p.id
    LEFT JOIN last_calls lc ON lc.ai_player_id = p.id
    ORDER BY p.name
    `
  );
  return rows;
}

export type RecentActivityRow = {
  id: string;
  model_name: string;
  model_id: string;
  mode: string;
  round_accuracy: number | null;
  cost: string | number;
  created_at: string;
};

export async function fetchRecentActivity(
  pool: Pool,
  limit: number = 10
): Promise<RecentActivityRow[]> {
  const { rows } = await pool.query<RecentActivityRow>(
    `
    WITH activity_costs AS (
      SELECT
        c.ai_answer_bank_id,
        COALESCE(
          SUM((c.response_payload->'usage'->>'cost')::numeric)
            FILTER (WHERE c.response_payload IS NOT NULL),
          0
        ) AS cost
      FROM ai_answer_bank_calls c
      GROUP BY c.ai_answer_bank_id
    )
    SELECT
      ab.id,
      p.name AS model_name,
      p.model_id,
      CASE WHEN dc.date IS NOT NULL THEN 'Daily' ELSE 'Practice' END AS mode,
      ab.round_accuracy,
      COALESCE(ac.cost, 0) AS cost,
      ab.created_at::text AS created_at
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    LEFT JOIN activity_costs ac ON ac.ai_answer_bank_id = ab.id
    LEFT JOIN daily_challenges dc
      ON dc.date = ab.created_at::date AND ab.event_id = ANY(dc.event_ids)
    ORDER BY ab.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export type RecentErrorRow = {
  id: string;
  model_name: string;
  model_id: string;
  error: string;
  error_type: ErrorBucket | "other";
  created_at: string;
};

export async function fetchRecentErrors(
  pool: Pool,
  limit: number = 5
): Promise<RecentErrorRow[]> {
  const { rows } = await pool.query<RecentErrorRow>(
    `
    SELECT
      ab.id,
      p.name AS model_name,
      p.model_id,
      ab.error,
      CASE
        WHEN ab.error ILIKE '%429%' OR ab.error ILIKE '%rate limit%'
          OR ab.error ILIKE '%rate-limit%' OR ab.error ILIKE '%too many requests%'
          THEN 'rate_limit'
        WHEN ab.error ILIKE '%404%' OR ab.error ILIKE '%no endpoints found%'
          THEN 'not_found'
        WHEN ab.error ILIKE '%parse%' OR ab.error ILIKE '%json%'
          OR ab.error ILIKE '%missing finalguess%'
          THEN 'parse'
        ELSE 'other'
      END AS error_type,
      ab.created_at::text AS created_at
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    WHERE ab.error IS NOT NULL
    ORDER BY ab.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export async function fetchCostWeek(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ cost_week: string | number }>(
    `
    SELECT COALESCE(
      SUM((c.response_payload->'usage'->>'cost')::numeric)
        FILTER (WHERE c.response_payload IS NOT NULL),
      0
    ) AS cost_week
    FROM ai_answer_bank_calls c
    WHERE c.created_at >= now() - interval '7 days'
    `
  );
  const raw = rows[0]?.cost_week ?? 0;
  const parsed = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// Scheduled AI-player mode changes (AIP-BUILD-PRODASHBOARD-FULLUIX-002)
// ---------------------------------------------------------------------------

export type ScheduledChangeRow = {
  id: string;
  ai_player_id: string;
  player_name: string | null;
  model_id: string | null;
  mode: "practice" | "daily";
  target_value: boolean;
  apply_at: string;
  status: "pending" | "applied" | "cancelled";
  applied_at: string | null;
  created_at: string;
};

export async function fetchScheduledChanges(
  pool: Pool,
  opts: { limit?: number } = {}
): Promise<ScheduledChangeRow[]> {
  const limit = opts.limit ?? 100;
  const { rows } = await pool.query<ScheduledChangeRow>(
    `
    SELECT
      sc.id,
      sc.ai_player_id,
      p.name AS player_name,
      p.model_id,
      sc.mode,
      sc.target_value,
      sc.apply_at::text AS apply_at,
      sc.status,
      sc.applied_at::text AS applied_at,
      sc.created_at::text AS created_at
    FROM ai_player_schedule_changes sc
    LEFT JOIN ai_players p ON p.id = sc.ai_player_id
    ORDER BY
      (sc.status = 'pending') DESC,
      sc.apply_at ASC,
      sc.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Users list (AIP-BUILD-PRODASHBOARD-FULLUIX-002)
// ---------------------------------------------------------------------------

export type UserListRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  total_count: number;
};

export async function fetchUsersList(
  pool: Pool,
  opts: {
    sort?: string;
    dir?: "asc" | "desc";
    limit?: number;
    offset?: number;
  } = {}
): Promise<UserListRow[]> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const sortColumns: Record<string, string> = {
    display_name: "p.display_name",
    email: "u.email",
    role: "p.role",
    created_at: "p.created_at",
  };
  const sortColumn = opts.sort ? sortColumns[opts.sort] : undefined;
  const orderBy = sortColumn
    ? `${sortColumn} ${dir} NULLS LAST`
    : `p.created_at ${dir}`;

  const { rows } = await pool.query<UserListRow>(
    `
    SELECT
      p.id,
      p.display_name,
      u.email,
      p.role,
      p.created_at::text AS created_at,
      COUNT(*) OVER()::int AS total_count
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY ${orderBy}
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Trashed (soft-deleted) AI players (AIP-BUILD-PRODASHBOARD-FULLUIX-002)
// ---------------------------------------------------------------------------

export type TrashedPlayerRow = {
  id: string;
  name: string;
  model_id: string;
  provider: string;
  deleted_at: string;
  created_at: string;
};

export async function fetchTrashedPlayers(pool: Pool): Promise<TrashedPlayerRow[]> {
  const { rows } = await pool.query<TrashedPlayerRow>(
    `
    SELECT
      id,
      name,
      model_id,
      provider,
      deleted_at::text AS deleted_at,
      created_at::text AS created_at
    FROM ai_players
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    `
  );
  return rows;
}
