// OPS-GATE-AIFLEET-DAILYTRUE-1124-885 — single owner of the "proven-true"
// event-id lookup used by the Daily AI gate (scripts/ai-players/daily-autoplay.ts).
//
// Proven-true = the latest event_reliability row (EDQ-BUILD-REVIEWQUEUE-1124-872)
// has reliability >= RELIABILITY_PLAY_MIN (95 — the threshold constant is owned
// by src/core/eventReliability.ts, never duplicated here) AND the event is not
// quarantined: events.retired_at IS NULL AND events.status = 'validated'.
// event_wikidata_verification status is NEVER truth.
//
// The query throws on any DB error — including a missing relation — so the
// caller can fail closed (zero OpenRouter calls, zero writes).

import type { Pool } from "pg";
import { RELIABILITY_PLAY_MIN } from "@/core/eventReliability";

export async function fetchProvenTrueEventIds(
  pool: Pick<Pool, "query">
): Promise<string[]> {
  const { rows } = await pool.query<{ event_id: string }>(
    `SELECT r.event_id
     FROM event_reliability r
     JOIN events e ON e.id = r.event_id
     WHERE r.reliability >= $1
       AND e.retired_at IS NULL
       AND e.status = 'validated'`,
    [RELIABILITY_PLAY_MIN]
  );
  return rows.map((r) => r.event_id);
}
