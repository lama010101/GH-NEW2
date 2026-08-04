import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { dbPool } from "@/server/db";
import { resolvePlayerIdentities, type PlayerIdentity } from "@/core/playerIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TABS = ["overall", "daily_today", "daily_alltime", "levelup"] as const;
type TabName = (typeof VALID_TABS)[number];

const VALID_FILTERS = ["all", "favorites"] as const;
type LegacyFilterName = (typeof VALID_FILTERS)[number];

type BaseRow = {
  player_id: string;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
};

type OverallRow = BaseRow & {
  avg_accuracy: number;
  total_xp: number;
  games_played: number;
  rounds_played: number;
  rounds_won: number;
};

type DailyTodayRow = BaseRow & {
  avg_accuracy: number;
  total_xp: number;
  completed_at: string;
};

type DailyAlltimeRow = BaseRow & {
  avg_accuracy: number;
  total_xp: number;
  games_played: number;
};

type LevelupRow = BaseRow & {
  current_level: number;
  best_accuracy: number;
};

type LeaderboardRow = OverallRow | DailyTodayRow | DailyAlltimeRow | LevelupRow;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseOptionalBool(value: string | null): boolean | undefined {
  if (value === null || value === '') return undefined;
  return value === 'true' || value === '1' || value === 'on';
}

/**
 * Compute identity-inclusion flags from the two-axis filter.
 * No identity params (or both false) means include both humans and AI.
 */
function computeIdentityFlags(
  humansParam: string | null,
  aiParam: string | null
): { includeHumans: boolean; includeAi: boolean } {
  const humans = parseOptionalBool(humansParam);
  const ai = parseOptionalBool(aiParam);

  if (humans === undefined && ai === undefined) {
    return { includeHumans: true, includeAi: true };
  }

  const includeHumans = humans === true;
  const includeAi = ai === true;

  if (!includeHumans && !includeAi) {
    return { includeHumans: true, includeAi: true };
  }

  return { includeHumans, includeAi };
}

async function loadFollowedIds(userId: string): Promise<Set<string>> {
  const result = await dbPool.query<{ followed_id: string }>(
    'SELECT followed_id FROM player_follows WHERE follower_id = $1',
    [userId]
  );
  return new Set(result.rows.map((r) => r.followed_id));
}

type RawRankedRow = {
  player_id: string;
  rank: number;
  avg_accuracy: number | null;
  total_xp: number | null;
  games_played: number | null;
  rounds_played: number | null;
  rounds_won: number | null;
  completed_at: Date | null;
  current_level: number | null;
  best_accuracy: number | null;
};

async function loadOverallRanked(): Promise<RawRankedRow[]> {
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_stats AS (
      SELECT player_id, avg_accuracy, total_xp, games_played, rounds_played, rounds_won
      FROM player_global_stats
    ),
    ai_stats AS (
      SELECT
        a.ai_player_id AS player_id,
        ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
        COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
        COUNT(DISTINCT a.event_id)::int AS games_played,
        COUNT(*)::int AS rounds_played,
        0::int AS rounds_won
      FROM ai_answer_bank a
      JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active = true
      WHERE a.error IS NULL
      GROUP BY a.ai_player_id
    ),
    combined AS (
      SELECT * FROM human_stats
      UNION ALL
      SELECT * FROM ai_stats
    ),
    ranked AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        games_played,
        rounds_played,
        rounds_won,
        NULL::timestamptz AS completed_at,
        NULL::int AS current_level,
        NULL::numeric(5,2) AS best_accuracy,
        RANK() OVER (ORDER BY avg_accuracy DESC, total_xp DESC) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, current_level, best_accuracy
    FROM ranked
    ORDER BY rank`
  );
  return result.rows;
}

async function loadDailyTodayRanked(date: string): Promise<RawRankedRow[]> {
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_daily AS (
      SELECT player_id, avg_accuracy, total_xp, completed_at, best_round_accuracy AS best_accuracy
      FROM leaderboard_daily
      WHERE date = $1
    ),
    ai_daily AS (
      SELECT
        a.ai_player_id AS player_id,
        ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
        COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
        MAX(a.created_at) AS completed_at,
        MAX(a.round_accuracy)::numeric(5,2) AS best_accuracy
      FROM ai_answer_bank a
      JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active = true
      JOIN daily_challenges dc ON dc.date = $1 AND a.event_id = ANY(dc.event_ids)
      WHERE a.error IS NULL
      GROUP BY a.ai_player_id
    ),
    combined AS (
      SELECT * FROM human_daily
      UNION ALL
      SELECT * FROM ai_daily
    ),
    ranked AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        NULL::int AS games_played,
        NULL::int AS rounds_played,
        NULL::int AS rounds_won,
        completed_at,
        NULL::int AS current_level,
        best_accuracy,
        RANK() OVER (ORDER BY avg_accuracy DESC, best_accuracy DESC NULLS LAST) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, current_level, best_accuracy
    FROM ranked
    ORDER BY rank`,
    [date]
  );
  return result.rows;
}

async function loadDailyAlltimeRanked(): Promise<RawRankedRow[]> {
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_alltime AS (
      SELECT player_id, games_played, avg_accuracy, total_xp
      FROM leaderboard_daily_alltime
    ),
    ai_alltime AS (
      SELECT
        a.ai_player_id AS player_id,
        COUNT(DISTINCT a.event_id)::int AS games_played,
        ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
        COALESCE(SUM(a.round_xp), 0)::int AS total_xp
      FROM ai_answer_bank a
      JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active = true
      WHERE a.error IS NULL
      GROUP BY a.ai_player_id
    ),
    combined AS (
      SELECT player_id, games_played, avg_accuracy, total_xp FROM human_alltime
      UNION ALL
      SELECT player_id, games_played, avg_accuracy, total_xp FROM ai_alltime
    ),
    ranked AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        games_played,
        NULL::int AS rounds_played,
        NULL::int AS rounds_won,
        NULL::timestamptz AS completed_at,
        NULL::int AS current_level,
        NULL::numeric(5,2) AS best_accuracy,
        RANK() OVER (ORDER BY avg_accuracy DESC, total_xp DESC) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, current_level, best_accuracy
    FROM ranked
    ORDER BY rank`
  );
  return result.rows;
}

async function loadLevelupRanked(): Promise<RawRankedRow[]> {
  const result = await dbPool.query<RawRankedRow>(
    `SELECT
       player_id,
       current_level,
       best_accuracy,
       NULL::int AS games_played,
       NULL::int AS rounds_played,
       NULL::int AS rounds_won,
       NULL::timestamptz AS completed_at,
       NULL::numeric(5,2) AS avg_accuracy,
       NULL::int AS total_xp,
       RANK() OVER (ORDER BY current_level DESC, best_accuracy DESC) AS rank
     FROM leaderboard_levelup
     ORDER BY rank`
  );
  return result.rows;
}

function rowMatchesFilter(
  row: RawRankedRow,
  identity: PlayerIdentity | undefined,
  flags: { includeHumans: boolean; includeAi: boolean },
  friendsOnly: boolean,
  followedIds: Set<string>,
  userId: string
): boolean {
  if (friendsOnly && row.player_id === userId) return false;
  if (friendsOnly && !followedIds.has(row.player_id)) return false;
  if (identity?.is_ai && !flags.includeAi) return false;
  if (!identity?.is_ai && !flags.includeHumans) return false;
  return true;
}

export async function GET(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return formatError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const rawTab = searchParams.get("tab") ?? "overall";
    const legacyFilter = searchParams.get("filter") ?? "all";
    const rawHumans = searchParams.get("humans");
    const rawAi = searchParams.get("ai");
    const rawFriends = searchParams.get("friends");

    if (!VALID_TABS.includes(rawTab as TabName)) {
      return formatError(
        `Invalid tab. Must be one of: ${VALID_TABS.join(", ")}`,
        400
      );
    }
    const tab = rawTab as TabName;

    if (!VALID_FILTERS.includes(legacyFilter as LegacyFilterName)) {
      return formatError(
        `Invalid filter. Must be one of: ${VALID_FILTERS.join(", ")}`,
        400
      );
    }

    const { includeHumans, includeAi } = computeIdentityFlags(rawHumans, rawAi);

    // Legacy `filter=favorites` maps to the Friends axis. The explicit `friends`
    // param, when present, takes precedence.
    const legacyFriends = legacyFilter === "favorites";
    const explicitFriends = parseOptionalBool(rawFriends);
    const friendsOnly = explicitFriends ?? legacyFriends;

    const userId = user.id;
    const [followedIds, rankedRows] = await Promise.all([
      loadFollowedIds(userId),
      (async () => {
        switch (tab) {
          case "overall": return loadOverallRanked();
          case "daily_today": {
            const rawDate = searchParams.get("date");
            const targetDate = rawDate ?? new Date().toISOString().slice(0, 10);
            if (!DATE_REGEX.test(targetDate)) {
              throw new Error("Invalid date format. Use YYYY-MM-DD.");
            }
            return loadDailyTodayRanked(targetDate);
          }
          case "daily_alltime": return loadDailyAlltimeRanked();
          case "levelup": return loadLevelupRanked();
        }
      })(),
    ]);

    const allPlayerIds = Array.from(new Set(rankedRows.map((r) => r.player_id)));
    const identityMap = await resolvePlayerIdentities(dbPool, allPlayerIds);

    const ownRow = rankedRows.find((r) => r.player_id === userId);
    const visibleRows: LeaderboardRow[] = [];

    for (const row of rankedRows) {
      const identity = identityMap.get(row.player_id);
      if (!rowMatchesFilter(row, identity, { includeHumans, includeAi }, friendsOnly, followedIds, userId)) {
        continue;
      }

      const base: BaseRow = {
        player_id: row.player_id,
        rank: row.rank,
        display_name: identity?.display_name ?? null,
        avatar_url: identity?.avatar_url ?? null,
        is_ai: identity?.is_ai ?? false,
      };

      if (tab === "levelup") {
        visibleRows.push({
          ...base,
          current_level: row.current_level ?? 0,
          best_accuracy: row.best_accuracy ?? 0,
        } as LevelupRow);
      } else if (tab === "daily_today") {
        visibleRows.push({
          ...base,
          avg_accuracy: row.avg_accuracy ?? 0,
          total_xp: row.total_xp ?? 0,
          completed_at: row.completed_at ? row.completed_at.toISOString() : '',
        } as DailyTodayRow);
      } else if (tab === "daily_alltime") {
        visibleRows.push({
          ...base,
          avg_accuracy: row.avg_accuracy ?? 0,
          total_xp: row.total_xp ?? 0,
          games_played: row.games_played ?? 0,
        } as DailyAlltimeRow);
      } else {
        visibleRows.push({
          ...base,
          avg_accuracy: row.avg_accuracy ?? 0,
          total_xp: row.total_xp ?? 0,
          games_played: row.games_played ?? 0,
          rounds_played: row.rounds_played ?? 0,
          rounds_won: row.rounds_won ?? 0,
        } as OverallRow);
      }

      if (visibleRows.length >= 50) break;
    }

    let ownEntry: LeaderboardRow | null = null;
    if (ownRow) {
      const identity = identityMap.get(ownRow.player_id);
      const base: BaseRow = {
        player_id: ownRow.player_id,
        rank: ownRow.rank,
        display_name: identity?.display_name ?? null,
        avatar_url: identity?.avatar_url ?? null,
        is_ai: identity?.is_ai ?? false,
      };

      if (tab === "levelup") {
        ownEntry = { ...base, current_level: ownRow.current_level ?? 0, best_accuracy: ownRow.best_accuracy ?? 0 } as LevelupRow;
      } else if (tab === "daily_today") {
        ownEntry = { ...base, avg_accuracy: ownRow.avg_accuracy ?? 0, total_xp: ownRow.total_xp ?? 0, completed_at: ownRow.completed_at ? ownRow.completed_at.toISOString() : '' } as DailyTodayRow;
      } else if (tab === "daily_alltime") {
        ownEntry = { ...base, avg_accuracy: ownRow.avg_accuracy ?? 0, total_xp: ownRow.total_xp ?? 0, games_played: ownRow.games_played ?? 0 } as DailyAlltimeRow;
      } else {
        ownEntry = { ...base, avg_accuracy: ownRow.avg_accuracy ?? 0, total_xp: ownRow.total_xp ?? 0, games_played: ownRow.games_played ?? 0, rounds_played: ownRow.rounds_played ?? 0, rounds_won: ownRow.rounds_won ?? 0 } as OverallRow;
      }

    }

    return NextResponse.json({
      tab,
      filter: legacyFilter,
      humans: includeHumans,
      ai: includeAi,
      friends: friendsOnly,
      rows: visibleRows,
      ownEntry,
    });
  } catch (error) {
    console.error("[leaderboard] Failed to load leaderboard:", error);
    const message = error instanceof Error ? error.message : "Unable to fetch leaderboard";
    return formatError(message, 500);
  }
}
