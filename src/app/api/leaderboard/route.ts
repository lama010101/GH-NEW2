import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { dbPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TABS = ["overall", "daily_today", "daily_alltime", "levelup"] as const;
type TabName = (typeof VALID_TABS)[number];

const VALID_FILTERS = ["all", "favorites"] as const;
type FilterName = (typeof VALID_FILTERS)[number];

type BaseRow = {
  player_id: string;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
    const rawFilter = searchParams.get("filter") ?? "all";

    if (!VALID_TABS.includes(rawTab as TabName)) {
      return formatError(
        `Invalid tab. Must be one of: ${VALID_TABS.join(", ")}`,
        400
      );
    }
    const tab = rawTab as TabName;

    if (!VALID_FILTERS.includes(rawFilter as FilterName)) {
      return formatError(
        `Invalid filter. Must be one of: ${VALID_FILTERS.join(", ")}`,
        400
      );
    }
    const filter = rawFilter as FilterName;
    const userId = user.id;

    switch (tab) {
      case "overall": {
        const result = await dbPool.query<OverallRow>(
          `WITH ranked AS (
            SELECT
              player_id,
              avg_accuracy,
              total_xp,
              games_played,
              rounds_played,
              rounds_won,
              RANK() OVER (ORDER BY avg_accuracy DESC, total_xp DESC) AS rank
            FROM player_global_stats
          ),
          visible AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.games_played,
              r.rounds_played,
              r.rounds_won,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE (
              $2 = 'all'
              OR r.player_id IN (
                SELECT followed_id FROM player_follows WHERE follower_id = $1
              )
            )
              AND r.player_id <> $1
            ORDER BY r.rank
            LIMIT 50
          ),
          own AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.games_played,
              r.rounds_played,
              r.rounds_won,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE r.player_id = $1
          )
          SELECT * FROM visible
          UNION
          SELECT * FROM own
          ORDER BY rank`,
          [userId, filter]
        );

        const ownEntry = result.rows.find((r) => r.player_id === userId) ?? null;

        return NextResponse.json({
          tab,
          filter,
          rows: result.rows,
          ownEntry,
        });
      }

      case "daily_today": {
        const rawDate = searchParams.get("date");
        const targetDate =
          rawDate ?? new Date().toISOString().slice(0, 10);

        if (!DATE_REGEX.test(targetDate)) {
          return formatError("Invalid date format. Use YYYY-MM-DD.", 400);
        }

        const result = await dbPool.query<DailyTodayRow>(
          `WITH ranked AS (
            SELECT
              player_id,
              avg_accuracy,
              total_xp,
              completed_at,
              RANK() OVER (ORDER BY avg_accuracy DESC, total_xp DESC) AS rank
            FROM leaderboard_daily
            WHERE date = $3
          ),
          visible AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.completed_at::text AS completed_at,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE (
              $2 = 'all'
              OR r.player_id IN (
                SELECT followed_id FROM player_follows WHERE follower_id = $1
              )
            )
              AND r.player_id <> $1
            ORDER BY r.rank
            LIMIT 50
          ),
          own AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.completed_at::text AS completed_at,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE r.player_id = $1
          )
          SELECT * FROM visible
          UNION
          SELECT * FROM own
          ORDER BY rank`,
          [userId, filter, targetDate]
        );

        const ownEntry = result.rows.find((r) => r.player_id === userId) ?? null;

        return NextResponse.json({
          tab,
          filter,
          date: targetDate,
          rows: result.rows,
          ownEntry,
        });
      }

      case "daily_alltime": {
        const result = await dbPool.query<DailyAlltimeRow>(
          `WITH ranked AS (
            SELECT
              player_id,
              avg_accuracy,
              total_xp,
              games_played,
              RANK() OVER (ORDER BY avg_accuracy DESC, total_xp DESC) AS rank
            FROM leaderboard_daily_alltime
          ),
          visible AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.games_played,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE (
              $2 = 'all'
              OR r.player_id IN (
                SELECT followed_id FROM player_follows WHERE follower_id = $1
              )
            )
              AND r.player_id <> $1
            ORDER BY r.rank
            LIMIT 50
          ),
          own AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.avg_accuracy::float AS avg_accuracy,
              r.total_xp,
              r.games_played,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE r.player_id = $1
          )
          SELECT * FROM visible
          UNION
          SELECT * FROM own
          ORDER BY rank`,
          [userId, filter]
        );

        const ownEntry = result.rows.find((r) => r.player_id === userId) ?? null;

        return NextResponse.json({
          tab,
          filter,
          rows: result.rows,
          ownEntry,
        });
      }

      case "levelup": {
        const result = await dbPool.query<LevelupRow>(
          `WITH ranked AS (
            SELECT
              player_id,
              current_level,
              best_accuracy,
              RANK() OVER (ORDER BY current_level DESC, best_accuracy DESC) AS rank
            FROM leaderboard_levelup
          ),
          visible AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.current_level,
              r.best_accuracy,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE (
              $2 = 'all'
              OR r.player_id IN (
                SELECT followed_id FROM player_follows WHERE follower_id = $1
              )
            )
              AND r.player_id <> $1
            ORDER BY r.rank
            LIMIT 50
          ),
          own AS (
            SELECT
              r.rank::int AS rank,
              r.player_id,
              r.current_level,
              r.best_accuracy,
              p.display_name,
              p.avatar_url
            FROM ranked r
            LEFT JOIN profiles p ON p.id = r.player_id
            WHERE r.player_id = $1
          )
          SELECT * FROM visible
          UNION
          SELECT * FROM own
          ORDER BY rank`,
          [userId, filter]
        );

        const ownEntry = result.rows.find((r) => r.player_id === userId) ?? null;

        return NextResponse.json({
          tab,
          filter,
          rows: result.rows,
          ownEntry,
        });
      }

      default: {
        // Exhaustiveness check; should never reach because of validation above.
        return formatError("Invalid tab", 400);
      }
    }
  } catch (error) {
    console.error("[leaderboard] Failed to load leaderboard:", error);
    const message = error instanceof Error ? error.message : "Unable to fetch leaderboard";
    return formatError(message, 500);
  }
}
