// LEARN-BUILD-EVENTMODAL-API-1015-001
// Response contract for GET /api/learn/event/[eventId]?gameId=<id>&mode=<m>.
// Shared by the server assembly (src/server/learnEvent.ts) and the client
// modal (src/components/learn/*). Do not add server-only imports here.

export type LearnMode = "compete" | "practice" | "daily" | "journey";

export const LEARN_MODES: readonly LearnMode[] = [
  "compete",
  "practice",
  "daily",
  "journey",
];

/**
 * Maps the repo's SessionMode ("practice" | "sync" | "async" | "daily",
 * src/core/types.ts) to the learn route's mode. Journey games carry
 * sessions.mode='practice' so they map to "practice" (accepted server-side
 * since LEARN-WIRE-CTA-1015-004). Unknown values -> null: render no CTA.
 */
export function learnModeForSession(
  sessionMode: string | null | undefined
): LearnMode | null {
  switch (sessionMode) {
    case "sync":
    case "async":
      return "compete";
    case "daily":
      return "daily";
    case "practice":
      return "practice";
    default:
      return null;
  }
}

export type LearnClueItem = {
  content: string;
  /**
   * Sanitized subset of hints.metadata (see sanitizeHintMetadata in
   * src/server/learnEvent.ts): km = landmark distance for where tiers 2/4,
   * years = year distance for when tiers 2/4. Never raw jsonb.
   */
  metadata?: { km?: number; years?: number | string };
};

/** One row of the "Related events" timeline (newest first). */
export type LearnTimelineItem = {
  id: string;
  title: string;
  year: number;
  /** locations.display_name for the event; null when no location row. */
  location: string | null;
  /** True for the event being learned about (placed between older/newer). */
  isCurrent: boolean;
};

/** One pin of the "Related location" map. */
export type LearnMapPoint = {
  id: string;
  title: string;
  year: number;
  location: string | null;
  lat: number;
  lng: number;
  /** Great-circle km from the current event; 0 for the current event. */
  km: number;
  isCurrent: boolean;
};

// FUTURE (product owner, 2026-10-19): the AI players will be asked to explain
// HOW they guessed the year / location of each event. That reasoning must be
// stored and surfaced in this modal (extend EventLearnResponse + the
// "How to find the year/location" cards) so users learn to guess better.
//
// LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011 — "About this event" contract:
// fixed section order What happened / How to find the year / How to find the
// location / Related to this event. yearClues/locationClues are ONE
// comma-separated string each (hints.content of the tier-5 row for that
// type); the modal splits them via splitClueList (src/core/learnFormat.ts).
export type EventLearnResponse = {
  /** events.description — "What happened". */
  description: string | null;
  /** hints.content of the when/tier-5 row, or null when absent. */
  yearClues: string | null;
  /** hints.content of the where/tier-5 row, or null when absent. */
  locationClues: string | null;
  /** when/tier-4 hint row. */
  contemporaryEvent: LearnClueItem | null;
  /** where/tier-4 hint row. */
  nearbyLandmark: LearnClueItem | null;
  /**
   * Up to 2 nearest older + the current event + up to 2 nearest newer events,
   * ordered newest -> oldest. Always contains the current event.
   */
  timeline: LearnTimelineItem[];
  /**
   * Current event + up to 4 nearest events by distance. Empty when the
   * current event has no coordinates.
   */
  mapPoints: LearnMapPoint[];
};
