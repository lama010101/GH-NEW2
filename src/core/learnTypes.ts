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

export type LearnListItem = {
  id: string;
  title: string;
  year: number;
  category: string | null;
  /** locations.display_name for the event; null when no location row. */
  location: string | null;
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
  /** when/tier-2 hint row. */
  historicalEvent: LearnClueItem | null;
  /** when/tier-4 hint row. */
  contemporaryEvent: LearnClueItem | null;
  /** where/tier-4 hint row. */
  nearbyLandmark: LearnClueItem | null;
  /** Same-category events; each entry carries category, year and location. */
  related: LearnListItem[];
};
