import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDailyChallengeDate } from "@/core/dailyDate";
import { dbPool } from "@/server/db";
import { resolvePlayerIdentities, type PlayerIdentity } from "@/core/playerIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TABS = ["overall", "daily_today", "daily_alltime", "journey"] as const;
type TabName = (typeof VALID_TABS)[number];

// `levelup` is kept as an accepted alias for `journey`.
const TAB_ALIASES: Record<string, TabName> = { levelup: "journey" };

const VALID_SORTS: Record<TabName, readonly string[]> = {
  overall: ["accuracy", "xp"],
  daily_today: ["accuracy", "xp"],
  daily_alltime: ["accuracy", "xp"],
  journey: ["stage", "accuracy"],
};
const DEFAULT_SORT: Record<TabName, string> = {
  overall: "accuracy",
  daily_today: "accuracy",
  daily_alltime: "accuracy",
  journey: "stage",
};

// Test accounts all use one of these email domains; excluded from every
// HUMAN CTE. Anonymous guests (no auth.users email) are NOT excluded.
const TEST_ACCOUNT_EMAIL_DOMAINS = ["example.com", "example.local", "devin.local", "test.guess-history.com"] as const;
const TEST_ACCOUNT_DOMAIN_LIST = TEST_ACCOUNT_EMAIL_DOMAINS.map((d) => `'${d}'`).join(", ");
const testAccountFilterSql = (playerIdExpr: string): string =>
  `NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ${playerIdExpr} AND split_part(lower(u.email),'@',2) IN (${TEST_ACCOUNT_DOMAIN_LIST}))`;

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

type JourneyRow = BaseRow & {
  avg_accuracy: number;
  total_xp: number;
  highest_stage: number;
  stages_completed: number;
};

type LeaderboardRow = OverallRow | DailyTodayRow | DailyAlltimeRow | JourneyRow;

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
  best_accuracy: number | null;
  highest_stage: number | null;
  stages_completed: number | null;
};

async function loadOverallRanked(sort: string): Promise<RawRankedRow[]> {
  const orderBy = sort === "xp"
    ? "total_xp DESC NULLS LAST, avg_accuracy DESC NULLS LAST"
    : "avg_accuracy DESC NULLS LAST, total_xp DESC NULLS LAST";
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_stats AS (
      SELECT pgs.player_id, pgs.avg_accuracy, pgs.total_xp, pgs.games_played, pgs.rounds_played, pgs.rounds_won
      FROM player_global_stats pgs
      JOIN profiles pr ON pr.id = pgs.player_id
      WHERE pgs.games_played > 0
        AND ${testAccountFilterSql("pgs.player_id")}
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
        NULL::numeric(5,2) AS best_accuracy,
        NULL::int AS highest_stage,
        NULL::int AS stages_completed,
        RANK() OVER (ORDER BY ${orderBy}) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, best_accuracy, highest_stage, stages_completed
    FROM ranked
    ORDER BY rank`
  );
  return result.rows;
}

async function loadDailyTodayRanked(date: string, sort: string): Promise<RawRankedRow[]> {
  const orderBy = sort === "xp"
    ? "total_xp DESC NULLS LAST, avg_accuracy DESC NULLS LAST"
    : "avg_accuracy DESC NULLS LAST, best_accuracy DESC NULLS LAST";
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_daily AS (
      SELECT ld.player_id, ld.avg_accuracy, ld.total_xp, ld.completed_at, ld.best_round_accuracy AS best_accuracy
      FROM leaderboard_daily ld
      JOIN profiles pr ON pr.id = ld.player_id
      WHERE ld.date = $1
        AND ${testAccountFilterSql("ld.player_id")}
    ),
    ai_daily AS (
      SELECT
        a.ai_player_id AS player_id,
        ROUND(AVG(a.round_accuracy)::numeric, 2) AS avg_accuracy,
        COALESCE(SUM(a.round_xp), 0)::int AS total_xp,
        MAX(a.created_at) AS completed_at,
        MAX(a.round_accuracy)::numeric(5,2) AS best_accuracy
      FROM ai_answer_bank a
      JOIN ai_players ap ON ap.id = a.ai_player_id AND ap.is_active_daily = true AND ap.is_active = true AND ap.deleted_at IS NULL
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
        best_accuracy,
        NULL::int AS highest_stage,
        NULL::int AS stages_completed,
        RANK() OVER (ORDER BY ${orderBy}) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, best_accuracy, highest_stage, stages_completed
    FROM ranked
    ORDER BY rank`,
    [date]
  );
  return result.rows;
}

async function loadDailyAlltimeRanked(sort: string): Promise<RawRankedRow[]> {
  const orderBy = sort === "xp"
    ? "total_xp DESC NULLS LAST, avg_accuracy DESC NULLS LAST"
    : "avg_accuracy DESC NULLS LAST, total_xp DESC NULLS LAST";
  const result = await dbPool.query<RawRankedRow>(
    `WITH human_alltime AS (
      SELECT lda.player_id, lda.games_played, lda.avg_accuracy, lda.total_xp
      FROM leaderboard_daily_alltime lda
      JOIN profiles pr ON pr.id = lda.player_id
      WHERE ${testAccountFilterSql("lda.player_id")}
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
        NULL::numeric(5,2) AS best_accuracy,
        NULL::int AS highest_stage,
        NULL::int AS stages_completed,
        RANK() OVER (ORDER BY ${orderBy}) AS rank
      FROM combined
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, best_accuracy, highest_stage, stages_completed
    FROM ranked
    ORDER BY rank`
  );
  return result.rows;
}

async function loadJourneyRanked(sort: string): Promise<RawRankedRow[]> {
  const orderBy = sort === "accuracy"
    ? "avg_accuracy DESC NULLS LAST, highest_stage DESC NULLS LAST, total_xp DESC NULLS LAST"
    : "highest_stage DESC NULLS LAST, avg_accuracy DESC NULLS LAST, total_xp DESC NULLS LAST";
  const result = await dbPool.query<RawRankedRow>(
    `WITH att AS (
      SELECT
        p.player_id,
        COALESCE(MAX(s.stage_number) FILTER (WHERE p.status = 'completed'), 0)::int AS highest_stage,
        COUNT(*) FILTER (WHERE p.status = 'completed')::int AS stages_completed,
        ROUND(AVG(p.best_accuracy_pct)::numeric, 2) AS avg_accuracy
      FROM journey_player_progress p
      JOIN journey_stages s ON s.id = p.stage_id
      WHERE p.attempts_count > 0
      GROUP BY p.player_id
    ),
    xp AS (
      SELECT player_id, COALESCE(SUM(xp_awarded), 0)::int AS total_xp
      FROM journey_playthroughs
      GROUP BY player_id
    ),
    human_journey AS (
      SELECT
        att.player_id,
        att.highest_stage,
        att.stages_completed,
        att.avg_accuracy,
        COALESCE(x.total_xp, 0)::int AS total_xp
      FROM att
      JOIN profiles pr ON pr.id = att.player_id
      LEFT JOIN xp x ON x.player_id = att.player_id
      WHERE ${testAccountFilterSql("att.player_id")}
    ),
    ranked AS (
      SELECT
        player_id,
        avg_accuracy,
        total_xp,
        NULL::int AS games_played,
        NULL::int AS rounds_played,
        NULL::int AS rounds_won,
        NULL::timestamptz AS completed_at,
        NULL::numeric(5,2) AS best_accuracy,
        highest_stage,
        stages_completed,
        RANK() OVER (ORDER BY ${orderBy}) AS rank
      FROM human_journey
    )
    SELECT player_id, rank, avg_accuracy, total_xp, games_played, rounds_played, rounds_won,
           completed_at, best_accuracy, highest_stage, stages_completed
    FROM ranked
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
    const normalizedTab = TAB_ALIASES[rawTab] ?? rawTab;
    const legacyFilter = searchParams.get("filter") ?? "all";
    const rawHumans = searchParams.get("humans");
    const rawAi = searchParams.get("ai");
    const rawFriends = searchParams.get("friends");

    if (!VALID_TABS.includes(normalizedTab as TabName)) {
      return formatError(
        `Invalid tab. Must be one of: ${VALID_TABS.join(", ")}`,
        400
      );
    }
    const tab = normalizedTab as TabName;

    const rawSort = searchParams.get("sort");
    const validSorts = VALID_SORTS[tab];
    let sort: string;
    if (rawSort === null) {
      sort = DEFAULT_SORT[tab];
    } else if (!validSorts.includes(rawSort)) {
      return formatError(
        `Invalid sort for tab ${tab}. Must be one of: ${validSorts.join(", ")}`,
        400
      );
    } else {
      sort = rawSort;
    }

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
          case "overall": return loadOverallRanked(sort);
          case "daily_today": {
            const rawDate = searchParams.get("date");
            const targetDate = rawDate ?? getDailyChallengeDate();
            if (!DATE_REGEX.test(targetDate)) {
              throw new Error("Invalid date format. Use YYYY-MM-DD.");
            }
            return loadDailyTodayRanked(targetDate, sort);
          }
          case "daily_alltime": return loadDailyAlltimeRanked(sort);
          case "journey": return loadJourneyRanked(sort);
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

      if (tab === "journey") {
        visibleRows.push({
          ...base,
          avg_accuracy: row.avg_accuracy ?? 0,
          total_xp: row.total_xp ?? 0,
          highest_stage: row.highest_stage ?? 0,
          stages_completed: row.stages_completed ?? 0,
        } as JourneyRow);
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

      if (tab === "journey") {
        ownEntry = { ...base, avg_accuracy: ownRow.avg_accuracy ?? 0, total_xp: ownRow.total_xp ?? 0, highest_stage: ownRow.highest_stage ?? 0, stages_completed: ownRow.stages_completed ?? 0 } as JourneyRow;
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
      sort,
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
