// OPS-GATE-AIFLEET-POOLPLAY-1124-886 — single owner of the proven-true
// event pool for AI-fleet plays.
//
// Proven-true = latest fact-check reliability >= RELIABILITY_PLAY_MIN (95)
// AND events.status = 'validated' AND events.retired_at IS NULL
// (retired_at is the quarantine marker — EDQ-BUILD-REVIEWQUEUE-1124-872 /
// fix/edq-reviewqueue-quarantine-1124). event_wikidata_verification is NOT
// truth and is never consulted here.
//
// Fail-closed contract: callers treat an empty set, a thrown query error or
// a missing relation identically — log one line, exit 0, zero OpenRouter
// calls, zero answer writes.

import type { Pool } from "pg";
import { RELIABILITY_PLAY_MIN } from "@/core/eventReliability";

export const PROVEN_TRUE_EVENTS_SQL = `SELECT er.event_id
  FROM public.event_reliability er
  JOIN public.events e ON e.id = er.event_id
  WHERE er.reliability >= $1
    AND e.status = 'validated'
    AND e.retired_at IS NULL`;

/** Returns the proven-true event ids. Throws on query failure — callers
 *  decide the fail-closed exit (the fleet runners log + return 0). */
export async function fetchProvenTrueEventIds(
  pool: Pick<Pool, "query">
): Promise<Set<string>> {
  const res = await pool.query<{ event_id: string }>(PROVEN_TRUE_EVENTS_SQL, [
    RELIABILITY_PLAY_MIN,
  ]);
  return new Set(res.rows.map((r) => r.event_id));
}
