// dailyChallenge.ts — Lazy generation of the pinned daily challenge (§4.3).
// Single source of truth for getting-or-creating the daily_challenges row.
// Concurrency rule: after INSERT ON CONFLICT DO NOTHING, MUST re-SELECT the
// stored row — the winner's event_ids are canonical for everyone.

import { dbPool } from "./db";
import { dailySeed, selectDailyEventIds } from "@/core/dailySeed";
import { VALID_CONTINENTS } from "./events";

export interface DailyChallengeRow {
  date: string;
  seed: string;
  event_ids: string[];
}

/**
 * getOrCreateDailyChallenge — §4.3 lazy generation.
 * 1. SELECT from daily_challenges WHERE date = dateIso
 * 2. Found → use event_ids as-is
 * 3. Not found → compute seed, select 5 events via seeded PRNG,
 *    INSERT ON CONFLICT DO NOTHING, then RE-SELECT (canonical set).
 */
export async function getOrCreateDailyChallenge(dateIso: string): Promise<DailyChallengeRow> {
  // Step 1: try read first (fast path — most calls after first)
  const existing = await dbPool.query<{ date: string; seed: string; event_ids: string[] }>(
    `SELECT date::text, seed::text, event_ids FROM daily_challenges WHERE date = $1`,
    [dateIso]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Step 3a-b: compute seed + select events
  const seed = dailySeed(dateIso);
  const allEligibleIds = await fetchAllEligibleEventIds();
  const eventIds = selectDailyEventIds(seed, allEligibleIds);

  // Step 3c: INSERT ON CONFLICT DO NOTHING
  await dbPool.query(
    `INSERT INTO daily_challenges (date, seed, event_ids) VALUES ($1, $2, $3)
     ON CONFLICT (date) DO NOTHING`,
    [dateIso, seed, eventIds]
  );

  // Step 3d: RE-SELECT — the winner's set is canonical (§4.3 concurrency rule)
  const stored = await dbPool.query<{ date: string; seed: string; event_ids: string[] }>(
    `SELECT date::text, seed::text, event_ids FROM daily_challenges WHERE date = $1`,
    [dateIso]
  );
  if (stored.rows.length === 0) {
    throw new Error(`daily_challenges row not found after insert for date=${dateIso}`);
  }
  return stored.rows[0];
}

/**
 * fetchAllEligibleEventIds — all event IDs eligible for Daily:
 * status='validated', has location with non-null lat/lng, continent in
 * VALID_CONTINENTS, full year range (no year filter). Mirrors the
 * eligibility criteria in fetchEventsWithDetails (events.ts:40-74)
 * but returns only IDs (no join to images/hints).
 */
/**
 * startDailyAttempt — entry point for POST /api/daily/start.
 * Enforces one attempt per player per UTC date via daily_attempts PK.
 * Returns { status, gameId }:
 *   - "resume"     → existing in_progress attempt
 *   - "completed"  → existing completed/expired attempt
 *   - "new"        → newly created attempt
 * Uses dynamic import of sessionCore.createDailySession to avoid circular
 * dependency (sessionCore imports getOrCreateDailyChallenge from this module).
 */
export async function startDailyAttempt(
  playerId: string
): Promise<{ status: "new" | "resume" | "completed"; gameId: string }> {
  const todayIso = new Date().toISOString().slice(0, 10);

  // Finalize any stale in-progress attempts from past dates (D2 lazy finalization)
  const { finalizeDailyStaleAttempt, getTransactionClient } = await import("./sessionCore");
  const stale = await dbPool.query<{ game_id: string; date: string }>(
    `SELECT game_id, date::text FROM daily_attempts WHERE player_id = $1 AND date < $2 AND status = 'in_progress'`,
    [playerId, todayIso]
  );
  for (const staleRow of stale.rows) {
    const client = await getTransactionClient();
    try {
      await client.query("BEGIN");
      await finalizeDailyStaleAttempt(client, staleRow.game_id, playerId, staleRow.date);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Check for existing attempt today
  const existing = await dbPool.query<{ game_id: string; status: string }>(
    `SELECT game_id, status FROM daily_attempts WHERE date = $1 AND player_id = $2`,
    [todayIso, playerId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];

    // Resume: if the session never reached ROUND_ACTIVE, start it now.
    if (row.status === "in_progress") {
      const { getTransactionClient, ensureDailyRoundStarted } = await import("./sessionCore");
      const client = await getTransactionClient();
      try {
        await client.query("BEGIN");
        await ensureDailyRoundStarted(client, row.game_id, playerId);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const status: "resume" | "completed" =
      row.status === "in_progress" ? "resume" : "completed";
    return { status, gameId: row.game_id };
  }

  // No existing attempt — create new daily session
  const { createDailySession } = await import("./sessionCore");
  const snapshot = await createDailySession({ playerId, dateIso: todayIso });

  // Record the attempt (ON CONFLICT DO NOTHING handles race condition)
  const inserted = await dbPool.query(
    `INSERT INTO daily_attempts (date, player_id, game_id, status)
     VALUES ($1, $2, $3, 'in_progress')
     ON CONFLICT (date, player_id) DO NOTHING`,
    [todayIso, playerId, snapshot.gameId]
  );

  if ((inserted as unknown as { rowCount: number | null }).rowCount === 0) {
    // Race: another request won the insert while we were creating our session.
    // Re-query and return the winning attempt.
    const raceCheck = await dbPool.query<{ game_id: string; status: string }>(
      `SELECT game_id, status FROM daily_attempts WHERE date = $1 AND player_id = $2`,
      [todayIso, playerId]
    );
    if (raceCheck.rows.length > 0) {
      const row = raceCheck.rows[0];

      if (row.status === "in_progress") {
        const { getTransactionClient, ensureDailyRoundStarted } = await import("./sessionCore");
        const client = await getTransactionClient();
        try {
          await client.query("BEGIN");
          await ensureDailyRoundStarted(client, row.game_id, playerId);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      const status: "resume" | "completed" =
        row.status === "in_progress" ? "resume" : "completed";
      return { status, gameId: row.game_id };
    }
  }

  return { status: "new", gameId: snapshot.gameId };
}

async function fetchAllEligibleEventIds(): Promise<string[]> {
  const result = await dbPool.query<{ id: string }>(
    `SELECT e.id
     FROM events e
     JOIN locations l ON l.event_id = e.id
     WHERE e.status = 'validated'
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
       AND l.continent = ANY($1::text[])`,
    [[...VALID_CONTINENTS]]
  );
  return result.rows.map(r => r.id);
}
