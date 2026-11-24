// I18N-BUILD-GAMEOVERLAY-1124-865
// Unit tests for src/server/localizedSnapshot.ts — fetchContentTranslations
// is mocked; overlayText/overlayNullableText stay real. No DB.

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CompeteSessionSnapshot, RoundEventContent } from "@/core/types";

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  dbPool: { query: vi.fn() },
}));

vi.mock("./contentTranslations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./contentTranslations")>();
  return { ...actual, fetchContentTranslations: mockFetch };
});

import { localizeSnapshot } from "./localizedSnapshot";

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "22222222-2222-4222-8222-222222222222";
const EVENT_C = "33333333-3333-4333-8333-333333333333";

function hint(id: string, eventId: string, content: string, order: number) {
  return {
    id,
    event_id: eventId,
    tier: order,
    type: "where",
    content,
    metadata: { order },
    display_order: order,
  };
}

// Fully revealed round: ROUND_STARTED + ROUND_COMPLETE fired — every text
// field populated, answer fields visible.
function revealedRound(): RoundEventContent {
  return {
    eventId: EVENT_A,
    title: "Moon landing",
    year: 1969,
    latitude: 0.674,
    longitude: 23.473,
    locationName: "Mare Tranquillitatis",
    region: "space",
    imageUrl: "https://example.com/a.jpg",
    description: "First crewed landing on the Moon",
    hints: [hint("h-a1", EVENT_A, "Near the lunar equator", 1), hint("h-a2", EVENT_A, "July or December", 2)],
    playerRoundResults: {
      "player-1": {
        score: 100,
        accuracy: 90,
        cumulativeScore: 100,
        cumulativeAccuracy: 90,
        didSubmit: true,
        locationScore: 50,
        timeScore: 50,
        guessYear: 1969,
        guessLat: 0.6,
        guessLng: 23.4,
        distanceKm: 10,
        yearDiff: 0,
        region: "space",
        rank: 1,
        badges: [],
        nearMisses: [],
      },
    },
  };
}

// Pre-reveal round: no ROUND_STARTED yet — title/description/hints/imageUrl
// empty, answer fields hidden. Translations exist for EVENT_B but must NOT
// leak through the overlay.
function gatedRound(): RoundEventContent {
  return {
    eventId: EVENT_B,
    title: "",
    year: 0,
    latitude: 0,
    longitude: 0,
    locationName: null,
    imageUrl: null,
    description: null,
    hints: [],
  };
}

// Mid-state round: ROUND_STARTED fired (content visible) but no
// ROUND_COMPLETE yet — locationName still null while title/description/
// hints are populated. The location translation must not be added.
function midStateRound(): RoundEventContent {
  return {
    eventId: EVENT_C,
    title: "Berlin Wall falls",
    year: 0,
    latitude: 0,
    longitude: 0,
    locationName: null,
    imageUrl: "https://example.com/c.jpg",
    description: "Checkpoint Charlie incident",
    hints: [hint("h-c1", EVENT_C, "A divided city", 1)],
  };
}

function makeSnapshot(): CompeteSessionSnapshot {
  return {
    gameId: "game-1",
    status: "ROUND_ACTIVE",
    config: {
      mode: "practice",
      roundTimerSec: 60,
      totalRounds: 3,
      yearMin: 1900,
      yearMax: 2000,
      resultsAutoAdvanceSec: 0,
      selectedEras: [],
      selectedRegions: [],
      hostPlayerId: null,
      sessionDeadline: null,
      sessionDeadlineDays: null,
      startedAt: null,
      completedAt: null,
      referenceYear: 2024,
    },
    players: [],
    currentRoundIndex: 0,
    allPlayersReady: true,
    roundStartsAt: null,
    roundEndsAt: null,
    viewerPlayerId: "player-1",
    rounds: [revealedRound(), gatedRound(), midStateRound()],
    readyForNext: [],
    roomCode: "ROOM1",
    pendingInvitees: [],
  };
}

function frTranslations() {
  return {
    events: new Map([
      [
        EVENT_A,
        {
          title: "Alunissage sur la Lune",
          description: "Premier atterrissage habité",
          category: null,
          theme: null,
        },
      ],
      [
        EVENT_B,
        {
          title: "Titre FR B",
          description: "Desc FR B",
          category: null,
          theme: null,
        },
      ],
      [
        EVENT_C,
        {
          title: "Chute du mur de Berlin",
          description: "Incident au checkpoint Charlie",
          category: null,
          theme: null,
        },
      ],
    ]),
    hints: new Map([
      ["h-a1", { content: "Près de l'équateur lunaire" }],
      ["h-c1", { content: "Une ville divisée" }],
    ]),
    locations: new Map([
      [EVENT_A, { displayName: "Mer de la Tranquillité", country: "Lune" }],
      [EVENT_B, { displayName: "Lieu FR B", country: "X" }],
      [EVENT_C, { displayName: "Berlin", country: "Allemagne" }],
    ]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("localizeSnapshot", () => {
  it("returns the identical object with zero fetch calls when lang is null", async () => {
    const snapshot = makeSnapshot();
    const result = await localizeSnapshot(snapshot, null);
    expect(result).toBe(snapshot);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches translations once for the distinct non-empty eventIds", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    await localizeSnapshot(makeSnapshot(), "fr");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toEqual([EVENT_A, EVENT_B, EVENT_C]);
    expect(mockFetch.mock.calls[0][1]).toBe("fr");
  });

  it("overlays title/description/locationName/hints on a revealed round", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    const snapshot = makeSnapshot();
    const result = await localizeSnapshot(snapshot, "fr");
    const round = result.rounds[0];

    expect(round.title).toBe("Alunissage sur la Lune");
    expect(round.description).toBe("Premier atterrissage habité");
    expect(round.locationName).toBe("Mer de la Tranquillité");
    expect(round.hints.map((h) => h.content)).toEqual([
      "Près de l'équateur lunaire",
      "July or December",
    ]);
  });

  it("keeps non-text fields byte-identical", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    const snapshot = makeSnapshot();
    const result = await localizeSnapshot(snapshot, "fr");
    const before = snapshot.rounds[0];
    const after = result.rounds[0];

    expect(after.year).toBe(before.year);
    expect(after.latitude).toBe(before.latitude);
    expect(after.longitude).toBe(before.longitude);
    expect(after.imageUrl).toBe(before.imageUrl);
    expect(after.region).toBe(before.region);
    expect(after.playerRoundResults).toEqual(before.playerRoundResults);
    expect(after.hints[0].tier).toBe(before.hints[0].tier);
    expect(after.hints[0].type).toBe(before.hints[0].type);
    expect(after.hints[0].metadata).toEqual(before.hints[0].metadata);
    expect(after.hints[0].display_order).toBe(before.hints[0].display_order);
    expect(after.hints[0].event_id).toBe(before.hints[0].event_id);
  });

  it("keeps a pre-reveal round fully empty even when translations exist", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    const result = await localizeSnapshot(makeSnapshot(), "fr");
    const round = result.rounds[1];

    expect(round.title).toBe("");
    expect(round.description).toBeNull();
    expect(round.locationName).toBeNull();
    expect(round.hints).toEqual([]);
    expect(round.imageUrl).toBeNull();
  });

  it("does not add a locationName the English snapshot did not expose", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    const result = await localizeSnapshot(makeSnapshot(), "fr");
    const round = result.rounds[2];

    expect(round.title).toBe("Chute du mur de Berlin");
    expect(round.description).toBe("Incident au checkpoint Charlie");
    expect(round.locationName).toBeNull();
    expect(round.hints[0].content).toBe("Une ville divisée");
  });

  it("does not mutate the input snapshot", async () => {
    mockFetch.mockResolvedValue(frTranslations());
    const snapshot = makeSnapshot();
    const frozen = JSON.parse(JSON.stringify(snapshot));
    await localizeSnapshot(snapshot, "fr");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(frozen);
  });

  it("returns a snapshot deep-equal to the input when translation maps are empty", async () => {
    mockFetch.mockResolvedValue({
      events: new Map(),
      hints: new Map(),
      locations: new Map(),
    });
    const snapshot = makeSnapshot();
    const result = await localizeSnapshot(snapshot, "fr");
    expect(result).toEqual(snapshot);
    expect(result).not.toBe(snapshot);
  });

  it("returns the English snapshot when the translation fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("db down"));
    const snapshot = makeSnapshot();
    const result = await localizeSnapshot(snapshot, "fr");
    expect(result).toEqual(snapshot);
  });
});
