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

export type LearnHint = {
  tier: number;
  content: string;
  /**
   * Sanitized subset of hints.metadata (see sanitizeHintMetadata in
   * src/server/learnEvent.ts): km = landmark distance for where tiers 2/4,
   * years = year distance for when tiers 2/4. Never raw jsonb.
   */
  metadata?: { km?: number; years?: number | string };
};

export type LearnLocation = {
  lat: number;
  lng: number;
  name?: string;
};

export type LearnEvent = {
  id: string;
  title: string;
  description: string | null;
  year: number;
  category: string | null;
  slug: string;
  location: LearnLocation | null;
};

export type LearnListItem = {
  id: string;
  title: string;
  year: number;
  slug: string;
};

export type EventLearnResponse = {
  event: LearnEvent;
  howToGuess: { when: LearnHint[]; where: LearnHint[] };
  related: LearnListItem[];
};
