// Query helpers for the rebuilt AI fleet dashboard
// (ADM-BUILD-FLEETDASH-1107-120).
//
// All queries use the service-role pg pool (getDbPool), consistent with the
// existing admin pages. SELECT-only. The cost expression is IDENTICAL to
// the one the Daily runner enforces against (src/server/aiSpend.ts):
//   COALESCE(SUM((c.response_payload->'usage'->>'cost')::numeric)
//     FILTER (WHERE c.response_payload IS NOT NULL), 0)
// over ai_answer_bank_calls joined to ai_answer_bank for the player id.
// NOTE: audit calls (audit-run.ts) do NOT write ai_answer_bank_calls, so
// auditor spend is not part of these numbers (reported gap).

import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Roster — live ai_players + catalog + reliability view
// ---------------------------------------------------------------------------

export type FleetRosterRow = {
  ai_player_id: string;
  name: string;
  provider: string;
  model_id: string;
  is_active: boolean;
  is_active_daily: boolean;
  is_active_practice: boolean;
  daily_cost_cap_usd: string | number | null;
  is_free: boolean | null;
  is_vision: boolean | null;
  availability_status: string | null;
  context_length: number | null;
  /** numeric columns come back as string|number from pg. */
  price_prompt_usd: string | number | null;
  price_completion_usd: string | number | null;
  has_catalog_row: boolean;
  plays_ok: number;
  plays_error: number;
  n429: number;
  events_played: number;
  coverage_pct: string | number | null;
  last_success_at: string | null;
};

export async function fetchFleetRoster(pool: Pool): Promise<FleetRosterRow[]> {
  const { rows } = await pool.query<FleetRosterRow>(
    `
    SELECT
      p.id AS ai_player_id,
      p.name,
      p.provider,
      p.model_id,
      p.is_active,
      p.is_active_daily,
      p.is_active_practice,
      p.daily_cost_cap_usd,
      om.is_free,
      om.is_vision,
      om.availability_status,
      om.context_length,
      om.price_prompt_usd,
      om.price_completion_usd,
      (om.model_id IS NOT NULL) AS has_catalog_row,
      COALESCE(r.plays_ok, 0) AS plays_ok,
      COALESCE(r.plays_error, 0) AS plays_error,
      COALESCE(r.n429, 0) AS n429,
      COALESCE(r.events_played, 0) AS events_played,
      r.coverage_pct,
      r.last_success_at::text AS last_success_at
    FROM ai_players p
    LEFT JOIN openrouter_models om ON om.model_id = p.model_id
    LEFT JOIN ai_model_reliability r ON r.ai_player_id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY p.name
    `
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Per-model usage — calls + cost today (UTC) and last 7 UTC days, plus the
// last call timestamp today (used to say WHEN a model hit its own cap).
// Covers ALL players (incl. soft-deleted) so unattributed spend can be shown.
// ---------------------------------------------------------------------------

export type ModelUsageRow = {
  ai_player_id: string | null;
  calls_today: number;
  cost_today: string | number;
  cost_7d: string | number;
  last_call_today: string | null;
};

export async function fetchModelUsage(
  pool: Pool,
  utcDate: string
): Promise<ModelUsageRow[]> {
  const { rows } = await pool.query<ModelUsageRow>(
    `
    SELECT
      ab.ai_player_id,
      COUNT(*) FILTER (
        WHERE c.created_at >= $1::date
          AND c.created_at < ($1::date + interval '1 day')
      )::int AS calls_today,
      COALESCE(
        SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (
            WHERE c.response_payload IS NOT NULL
              AND c.created_at >= $1::date
              AND c.created_at < ($1::date + interval '1 day')
          ),
        0
      ) AS cost_today,
      COALESCE(
        SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (
            WHERE c.response_payload IS NOT NULL
              AND c.created_at >= ($1::date - interval '6 days')
              AND c.created_at < ($1::date + interval '1 day')
          ),
        0
      ) AS cost_7d,
      MAX(c.created_at) FILTER (
        WHERE c.created_at >= $1::date
          AND c.created_at < ($1::date + interval '1 day')
      )::text AS last_call_today
    FROM ai_answer_bank_calls c
    JOIN ai_answer_bank ab ON ab.id = c.ai_answer_bank_id
    GROUP BY ab.ai_player_id
    `,
    [utcDate]
  );
  return rows;
}

/** Fleet spend over the last 7 UTC calendar days (incl. today). */
export async function fetchFleetSpend7d(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ cost: string | number }>(
    `
    SELECT COALESCE(
      SUM((c.response_payload->'usage'->>'cost')::numeric)
        FILTER (WHERE c.response_payload IS NOT NULL),
      0
    ) AS cost
    FROM ai_answer_bank_calls c
    WHERE c.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '6 days')
      AND c.created_at < (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day')
    `
  );
  const raw = rows[0]?.cost;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Deferral stats per player — 429 pressure for status + recommendations
// ---------------------------------------------------------------------------

export type DeferralStatRow = {
  ai_player_id: string;
  open_deferrals: number;
  last_deferred_at: string | null;
  /** Distinct UTC days with a deferral across the last 3 UTC calendar days (rate-limit streak, max 3). */
  defer_days_3d: number;
};

export async function fetchDeferralStats(pool: Pool): Promise<DeferralStatRow[]> {
  const { rows } = await pool.query<DeferralStatRow>(
    `
    SELECT
      ai_player_id,
      COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open_deferrals,
      MAX(last_deferred_at)::text AS last_deferred_at,
      COUNT(DISTINCT last_deferred_at::date) FILTER (
        WHERE last_deferred_at::date >= (now() AT TIME ZONE 'UTC')::date - 2
      )::int AS defer_days_3d
    FROM ai_play_deferrals
    GROUP BY ai_player_id
    `
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Eligible events + coverage — the population the work queue targets
// (same WHERE clause as COVERAGE_CANDIDATES_SQL in daily-autoplay.ts and
// the ai_model_reliability 'playable' definition):
//   events.status='validated' AND retired_at IS NULL AND has an images row
//   AND has a locations row with latitude/longitude.
// A counted play = ai_answer_bank row with error IS NULL (a stored, scored
// result) on an eligible event.
// ---------------------------------------------------------------------------

export type EligibleEventStats = {
  eligible_total: number;
  /** Distinct (event_id, ai_player_id) OK pairs on eligible events. */
  ok_pairs: number;
  /** Distinct eligible events with >= 1 OK play. */
  events_with_play: number;
};

export async function fetchEligibleEventStats(
  pool: Pool
): Promise<EligibleEventStats> {
  const { rows } = await pool.query<EligibleEventStats>(
    `
    WITH eligible AS (
      SELECT e.id
      FROM events e
      WHERE e.status = 'validated'
        AND e.retired_at IS NULL
        AND EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id)
        AND EXISTS (
          SELECT 1 FROM locations l
          WHERE l.event_id = e.id
            AND l.latitude IS NOT NULL
            AND l.longitude IS NOT NULL
        )
    ),
    ok_pairs AS (
      SELECT DISTINCT ab.event_id, ab.ai_player_id
      FROM ai_answer_bank ab
      JOIN eligible el ON el.id = ab.event_id
      WHERE ab.error IS NULL
    )
    SELECT
      (SELECT COUNT(*) FROM eligible)::int AS eligible_total,
      (SELECT COUNT(*) FROM ok_pairs)::int AS ok_pairs,
      (SELECT COUNT(DISTINCT event_id) FROM ok_pairs)::int AS events_with_play
    `
  );
  return (
    rows[0] ?? { eligible_total: 0, ok_pairs: 0, events_with_play: 0 }
  );
}

// ---------------------------------------------------------------------------
// Event-audit verdicts — ai_event_audits.is_real_event votes per event
// ---------------------------------------------------------------------------

export type AuditVoteRow = {
  event_id: string;
  is_real_event: string | null;
  n: number;
};

export async function fetchAuditVotes(pool: Pool): Promise<AuditVoteRow[]> {
  const { rows } = await pool.query<AuditVoteRow>(
    `
    SELECT event_id, is_real_event, COUNT(*)::int AS n
    FROM ai_event_audits
    GROUP BY event_id, is_real_event
    `
  );
  return rows;
}

/** Completed Practice plays in the last 7 days (play_mode='practice', OK). */
export async function fetchPracticePlays7d(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `
    SELECT COUNT(*)::int AS n
    FROM ai_answer_bank
    WHERE play_mode = 'practice'
      AND error IS NULL
      AND created_at >= now() - interval '7 days'
    `
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Recent errors — ai_answer_bank.error rows, last 7 days (Problems section)
// ---------------------------------------------------------------------------

export type RecentErrorRow = {
  model_name: string;
  error: string;
  created_at: string;
};

export async function fetchRecentErrorRows(
  pool: Pool,
  opts: { days?: number; limit?: number } = {}
): Promise<RecentErrorRow[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 3000;
  const { rows } = await pool.query<RecentErrorRow>(
    `
    SELECT
      p.name AS model_name,
      ab.error,
      ab.created_at::text AS created_at
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    WHERE ab.error IS NOT NULL
      AND ab.created_at >= now() - ($1::int || ' days')::interval
    ORDER BY ab.created_at DESC
    LIMIT $2
    `,
    [days, limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Fleet runs + alerts + settings (kept from the previous dashboard)
// ---------------------------------------------------------------------------

export type FleetAlertRow = {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  message: string;
  model_id: string | null;
  run_id: string | null;
  created_at: string;
  last_seen_at: string;
  occurrences: number;
};

export async function fetchOpenFleetAlerts(pool: Pool): Promise<FleetAlertRow[]> {
  const { rows } = await pool.query<FleetAlertRow>(
    `
    SELECT
      id, kind, severity, message, model_id, run_id,
      created_at::text AS created_at,
      last_seen_at::text AS last_seen_at,
      occurrences
    FROM ai_fleet_alerts
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
    `
  );
  return rows;
}

export type FleetRunRow = {
  id: string;
  kind: string;
  status: "running" | "ok" | "partial" | "halted" | "error";
  halt_reason: string | null;
  started_at: string;
  finished_at: string | null;
  plays_attempted: number;
  plays_ok: number;
  plays_failed: number;
  failed_auth: number;
  failed_gone: number;
  failed_rate_limit: number;
  failed_bad_output: number;
  failed_other: number;
  plays_skipped_budget: number;
  github_run_url: string | null;
};

export async function fetchRecentFleetRuns(
  pool: Pool,
  limit: number = 15
): Promise<FleetRunRow[]> {
  const { rows } = await pool.query<FleetRunRow>(
    `
    SELECT
      id, kind, status, halt_reason,
      started_at::text AS started_at,
      finished_at::text AS finished_at,
      plays_attempted, plays_ok, plays_failed,
      failed_auth, failed_gone, failed_rate_limit,
      failed_bad_output, failed_other, plays_skipped_budget,
      github_run_url
    FROM ai_fleet_runs
    ORDER BY started_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

export type RateSettingRow = {
  key: string;
  value: unknown;
  updated_at: string | null;
};

export async function fetchRateSettings(pool: Pool): Promise<RateSettingRow[]> {
  const { rows } = await pool.query<RateSettingRow>(
    `
    SELECT key, value, updated_at::text AS updated_at
    FROM ai_fleet_settings
    ORDER BY key
    `
  );
  return rows;
}
// ---------------------------------------------------------------------------
// Sub-page queries — unchanged, kept for events/schedules/trash/users pages
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
