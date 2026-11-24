import { dbPool } from "./db";
import type { Pool } from "pg";

type DbExecutor = Pick<Pool, "query">;

/**
 * UX-BUILD-V1CLOSE-1124-868 item B — read-only aggregates for the public
 * /how-we-work page. Aggregates only: counts and one share, no row ids.
 *
 * The four numbers are exactly the CTO-approved set:
 *   1. events in the game      = events.status='validated' AND retired_at IS NULL
 *   2. French coverage          = distinct event_id with an fr
 *                                event_translations row inside that catalog,
 *                                expressed as a share of it (null when the
 *                                catalog is empty)
 *   3. AI players active        = ai_players.is_active AND deleted_at IS NULL
 *   4. daily challenges         = count(daily_challenges)
 *
 * Deliberately NOT included (CTO ruling): event_wikidata_verification run
 * logs, ai_events_needing_review, ai_event_audits, fleet-run statuses.
 */
export type ImprovementStats = {
  eventsInGame: number;
  frenchCoverage: number | null;
  activeAiPlayers: number;
  dailyChallengesGenerated: number;
};

export async function fetchImprovementStats(
  executor: DbExecutor = dbPool
): Promise<ImprovementStats> {
  const [eventsResult, frenchResult, aiResult, dailyResult] = await Promise.all([
    executor.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM events
       WHERE status = 'validated' AND retired_at IS NULL`
    ),
    executor.query<{ count: string }>(
      `SELECT COUNT(DISTINCT et.event_id)::text AS count
       FROM event_translations et
       JOIN events e ON e.id = et.event_id
       WHERE e.status = 'validated'
         AND e.retired_at IS NULL
         AND et.language_code = 'fr'`
    ),
    executor.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ai_players
       WHERE is_active = true AND deleted_at IS NULL`
    ),
    executor.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM daily_challenges`
    ),
  ]);

  const eventsInGame = Number(eventsResult.rows[0]?.count ?? 0);
  const withFrench = Number(frenchResult.rows[0]?.count ?? 0);

  return {
    eventsInGame,
    frenchCoverage: eventsInGame > 0 ? withFrench / eventsInGame : null,
    activeAiPlayers: Number(aiResult.rows[0]?.count ?? 0),
    dailyChallengesGenerated: Number(dailyResult.rows[0]?.count ?? 0),
  };
}
