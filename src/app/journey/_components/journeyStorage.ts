"use client";

// Journey client-side shared types + sessionStorage threading helpers
// (HJ-BUILD-JOURNEYUI-001).
//
// Threading model: startJourneyPlaythrough returns { gameId, playthroughId } —
// the play page (/practice/[gameId]) is an unmodified protected flow, so the
// playthroughId is threaded to Journey-owned screens via sessionStorage under
// `gh_journey_active_<stageId>` (mirrors the practice flow's own localStorage
// threading via `gh_practice_game_<playerId>`). The DB remains the source of
// truth — the marker is only a fast-path; journey_playthroughs/journey_player_progress
// rows fully re-derive state when the marker is absent.

export type JourneyStageRow = {
  id: string;
  stage_number: number;
  title: string | null;
  theme: string | null;
  learning_objective: string | null;
  difficulty_rating: number | null;
  min_accuracy_pct: number | string;
  pool_size: number;
  status: string;
};

export type JourneyProgressRow = {
  id: string;
  player_id: string;
  stage_id: string;
  status: "locked" | "unlocked" | "completed";
  best_accuracy_pct: number | string | null;
  best_badge: "gold" | "silver" | "bronze" | "completion" | null;
  attempts_count: number;
  first_completed_at: string | null;
  last_played_at: string | null;
};

export type ActiveJourneyPlaythrough = {
  stageId: string;
  playthroughId: string;
  gameId: string;
};

const ACTIVE_PREFIX = "gh_journey_active_";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeActivePlaythrough(entry: ActiveJourneyPlaythrough): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(
      ACTIVE_PREFIX + entry.stageId,
      JSON.stringify({ playthroughId: entry.playthroughId, gameId: entry.gameId })
    );
  } catch {
    // storage unavailable/quota — non-fatal, DB re-derivation covers it
  }
}

export function readActivePlaythrough(
  stageId: string
): { playthroughId: string; gameId: string } | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(ACTIVE_PREFIX + stageId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { playthroughId?: unknown; gameId?: unknown };
    if (typeof parsed.playthroughId === "string" && typeof parsed.gameId === "string") {
      return { playthroughId: parsed.playthroughId, gameId: parsed.gameId };
    }
  } catch {
    // malformed entry — treat as absent
  }
  return null;
}

export function clearActivePlaythrough(stageId: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(ACTIVE_PREFIX + stageId);
  } catch {
    // non-fatal
  }
}

// Scans sessionStorage for any `gh_journey_active_*` marker. Used by the stage
// list to hand off to the stage detail page (sole owner of completion+recap).
export function findAnyActivePlaythrough(): ActiveJourneyPlaythrough | null {
  const s = storage();
  if (!s) return null;
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (!key || !key.startsWith(ACTIVE_PREFIX)) continue;
      const stageId = key.slice(ACTIVE_PREFIX.length);
      const pt = readActivePlaythrough(stageId);
      if (pt) return { stageId, ...pt };
    }
  } catch {
    // enumeration unavailable — treat as absent
  }
  return null;
}
