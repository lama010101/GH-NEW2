// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
//
// Read-only data assembly for GET /api/learn/event/[eventId].
//
// SECURITY MODEL (service-role reads bypass RLS — these checks are the ONLY
// protection against answer leaking):
//   - The route authenticates the caller before reaching this file.
//   - loadEventLearn verifies (a) the session exists and matches the claimed
//     mode, (b) the session belongs to the caller for solo modes, and
//     (c) a round_results row exists for (game_id, player_id, round_index)
//     where round_index is the event's position in the SESSION_CREATED
//     eventIds array — i.e. the caller FINISHED that event's round.
//   - computeExcludedEventIds strips every same-session event the caller has
//     NOT finished from related/nearby lists, so a future round's answer can
//     never leak through a list item.
//
// Query style mirrors src/server/seoEvents.ts (origin/claude/charming-mccarthy-
// tnpb11): dbPool + parameterized SQL, events LEFT JOIN locations.

import { dbPool } from "./db";
import type {
  EventLearnResponse,
  LearnClueItem,
  LearnListItem,
  LearnMode,
} from "@/core/learnTypes";

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS (unit-tested in learnEvent.test.ts — no DB access)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pass-through for the two hint.metadata keys the learn UI renders —
 * km (where tiers 2/4 landmark distance) and years (when tiers 2/4 year
 * distance). Never ships raw jsonb: anything that is not a finite,
 * non-negative number — or a numeric string for years — is dropped,
 * and no other key survives.
 */
export function sanitizeHintMetadata(
  raw: unknown
): { km?: number; years?: number | string } | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const src = raw as Record<string, unknown>;
  const out: { km?: number; years?: number | string } = {};
  const km = src.km;
  if (typeof km === "number" && Number.isFinite(km) && km >= 0) {
    out.km = km;
  }
  const years = src.years;
  if (typeof years === "number" && Number.isFinite(years) && years >= 0) {
    out.years = years;
  } else if (
    typeof years === "string" &&
    years.trim() !== "" &&
    Number.isFinite(Number(years)) &&
    Number(years) >= 0
  ) {
    out.years = years;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Session draw positions are round indexes. Any event whose round the caller
 * has NOT completed must be hidden from related/nearby lists — returning it
 * would leak a future round's answer.
 */
export function computeExcludedEventIds(
  sessionEventIds: readonly string[],
  completedRoundIndexes: ReadonlySet<number>
): Set<string> {
  const excluded = new Set<string>();
  sessionEventIds.forEach((id, idx) => {
    if (!completedRoundIndexes.has(idx)) excluded.add(id);
  });
  return excluded;
}

export type LearnCandidate = {
  id: string;
  title: string;
  year: number;
  category: string | null;
  /** locations.display_name via LEFT JOIN locations; null when no row. */
  location: string | null;
};

function byYearDiffThenTitle(selfYear: number) {
  return (a: LearnCandidate, b: LearnCandidate): number => {
    const da = Math.abs(a.year - selfYear);
    const db = Math.abs(b.year - selfYear);
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title);
  };
}

function toListItem(c: LearnCandidate): LearnListItem {
  return {
    id: c.id,
    title: c.title,
    year: c.year,
    category: c.category,
    location: c.location,
  };
}

/** Same category, excluding self + excluded ids, |year diff| asc then title. */
export function rankRelated(
  candidates: readonly LearnCandidate[],
  self: { id: string; year: number; category: string | null },
  excluded: ReadonlySet<string>,
  limit = 4
): LearnListItem[] {
  if (self.category == null) return [];
  return candidates
    .filter(
      (c) => c.id !== self.id && !excluded.has(c.id) && c.category === self.category
    )
    .sort(byYearDiffThenTitle(self.year))
    .slice(0, limit)
    .map(toListItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE EVIDENCE — "player finished this event's round in this game"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-mode ownership/consistency evidence, all DB-derived:
 *   compete  → sessions.mode is a multiplayer mode ('sync'|'async'|'compete')
 *   practice → sessions.mode='practice' — including journey games, which
 *              share mode='practice' (LEARN-WIRE-CTA-1015-004; journey's own
 *              mode string keeps the journey_playthroughs requirement)
 *   daily    → sessions.mode='daily' AND a daily_attempts row exists for
 *              (game_id, player_id)
 *   journey  → a journey_playthroughs row exists for (session_id, player_id)
 */
async function sessionMatchesMode(
  gameId: string,
  playerId: string,
  mode: LearnMode
): Promise<boolean> {
  switch (mode) {
    case "compete": {
      const r = await dbPool.query<{ mode: string }>(
        `SELECT mode FROM sessions WHERE game_id = $1`,
        [gameId]
      );
      const m = r.rows[0]?.mode;
      return m === "sync" || m === "async" || m === "compete";
    }
    case "practice": {
      const r = await dbPool.query<{ ok: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM sessions WHERE game_id = $1 AND mode = 'practice')
              AS ok`,
        [gameId]
      );
      return r.rows[0]?.ok === true;
    }
    case "daily": {
      const r = await dbPool.query<{ ok: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM sessions WHERE game_id = $1 AND mode = 'daily')
              AND EXISTS(SELECT 1 FROM daily_attempts WHERE game_id = $1 AND player_id = $2)
              AS ok`,
        [gameId, playerId]
      );
      return r.rows[0]?.ok === true;
    }
    case "journey": {
      const r = await dbPool.query<{ ok: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM journey_playthroughs
           WHERE session_id = $1 AND player_id = $2
         ) AS ok`,
        [gameId, playerId]
      );
      return r.rows[0]?.ok === true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────────────────────────────────────

export type EventLearnResult =
  | { status: "ok"; data: EventLearnResponse }
  | { status: "forbidden" }
  | { status: "not_found" };

const RELATED_LIMIT = 4;

export async function loadEventLearn(params: {
  eventId: string;
  gameId: string;
  playerId: string;
  mode: LearnMode;
}): Promise<EventLearnResult> {
  const { eventId, gameId, playerId, mode } = params;

  if (!(await sessionMatchesMode(gameId, playerId, mode))) {
    return { status: "forbidden" };
  }

  // SESSION_CREATED payload pins the session's draw; position = round index.
  const sessionRes = await dbPool.query<{ event_ids: string[] | null }>(
    `SELECT payload->'eventIds' AS event_ids
     FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
     ORDER BY id ASC
     LIMIT 1`,
    [gameId]
  );
  const sessionEventIds = sessionRes.rows[0]?.event_ids;
  if (!Array.isArray(sessionEventIds)) {
    return { status: "forbidden" };
  }

  const targetRoundIndex = sessionEventIds.indexOf(eventId);
  if (targetRoundIndex < 0) {
    // The event is not part of this game at all.
    return { status: "forbidden" };
  }

  // Canonical per-player completion evidence: a round_results row exists only
  // for players who committed (or were closed out absent) that round.
  const completedRes = await dbPool.query<{ round_index: number }>(
    `SELECT round_index FROM round_results
     WHERE game_id = $1 AND player_id = $2`,
    [gameId, playerId]
  );
  const completedRoundIndexes = new Set(completedRes.rows.map((r) => r.round_index));
  if (!completedRoundIndexes.has(targetRoundIndex)) {
    return { status: "forbidden" };
  }

  const excluded = computeExcludedEventIds(sessionEventIds, completedRoundIndexes);

  const eventRes = await dbPool.query<{
    description: string | null;
    event_year: number;
    category: string | null;
  }>(
    `SELECT e.description, e.event_year, e.category
     FROM events e
     WHERE e.id = $1::uuid AND e.status = 'validated'`,
    [eventId]
  );
  const row = eventRes.rows[0];
  if (!row) {
    return { status: "not_found" };
  }

  const hintsRes = await dbPool.query<{
    tier: number;
    type: string;
    content: string;
    metadata: unknown;
  }>(
    `SELECT tier, type, content, metadata
     FROM hints
     WHERE event_id = $1::uuid AND type IN ('when', 'where')
     ORDER BY tier ASC, display_order ASC`,
    [eventId]
  );
  // Tier map: when tier2 = historical event, when tier4 = contemporary event,
  // where tier4 = nearby landmark (each with km/years metadata). where tier2
  // (remote landmark) is intentionally not shipped. Tier 5 content is ONE
  // comma-separated clue string per type (split client side by splitClueList).
  // Tiers 1/3 are not part of the new contract.
  let yearClues: string | null = null;
  let locationClues: string | null = null;
  let historicalEvent: LearnClueItem | null = null;
  let contemporaryEvent: LearnClueItem | null = null;
  let nearbyLandmark: LearnClueItem | null = null;
  for (const h of hintsRes.rows) {
    if (h.tier === 5) {
      if (h.type === "when" && yearClues === null) yearClues = h.content;
      else if (h.type === "where" && locationClues === null) {
        locationClues = h.content;
      }
      continue;
    }
    if (h.tier !== 2 && h.tier !== 4) continue;
    const metadata = sanitizeHintMetadata(h.metadata);
    const item: LearnClueItem = {
      content: h.content,
      ...(metadata ? { metadata } : {}),
    };
    if (h.type === "when") {
      if (h.tier === 2) historicalEvent = historicalEvent ?? item;
      else contemporaryEvent = contemporaryEvent ?? item;
    } else if (h.tier === 4) {
      nearbyLandmark = nearbyLandmark ?? item;
    }
  }

  const candidatesRes = await dbPool.query<{
    id: string;
    title: string;
    event_year: number;
    category: string | null;
    display_name: string | null;
  }>(
    `SELECT e.id, e.title, e.event_year, e.category, l.display_name
     FROM events e
     LEFT JOIN locations l ON l.event_id = e.id
     WHERE e.status = 'validated' AND e.id <> $1::uuid`,
    [eventId]
  );
  const candidates: LearnCandidate[] = candidatesRes.rows.map((c) => ({
    id: c.id,
    title: c.title,
    year: c.event_year,
    category: c.category,
    location: c.display_name,
  }));

  const data: EventLearnResponse = {
    description: row.description,
    yearClues,
    locationClues,
    historicalEvent,
    contemporaryEvent,
    nearbyLandmark,
    related: rankRelated(
      candidates,
      { id: eventId, year: row.event_year, category: row.category },
      excluded,
      RELATED_LIMIT
    ),
  };

  // Defense in depth: never ship an unfinished same-session event id.
  for (const item of data.related) {
    if (excluded.has(item.id)) {
      throw new Error("[learnEvent] exclusion invariant violated");
    }
  }

  return { status: "ok", data };
}
