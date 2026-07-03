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
