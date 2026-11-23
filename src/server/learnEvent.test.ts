// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-FIX-HINTMETA-NONEARBY-1015-003 /
// LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
// Pure-function tests for learnEvent.ts ranking/exclusion/metadata helpers.
// No DB access — dbPool is a lazy proxy and is never queried here.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { learnModeForSession } from "@/core/learnTypes";
import {
  computeExcludedEventIds,
  haversineKm,
  loadEventLearn,
  rankByLocation,
  rankTimeline,
  sanitizeHintMetadata,
  type LearnCandidate,
  type LearnSelf,
} from "./learnEvent";

const mockDbQuery = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  dbPool: { query: mockDbQuery },
}));

const cand = (
  id: string,
  year: number,
  lat: number | null = null,
  lng: number | null = null
): LearnCandidate => ({
  id,
  title: `T-${id}`,
  year,
  location: `L-${id}`,
  lat,
  lng,
});

const selfAt = (year: number, lat: number | null = 0, lng: number | null = 0): LearnSelf => ({
  id: "self",
  title: "T-self",
  year,
  location: "L-self",
  lat,
  lng,
});

const NO_EXCLUDED = new Set<string>();

describe("learnModeForSession", () => {
  it("maps every SessionMode value", () => {
    expect(learnModeForSession("sync")).toBe("compete");
    expect(learnModeForSession("async")).toBe("compete");
    expect(learnModeForSession("daily")).toBe("daily");
    expect(learnModeForSession("practice")).toBe("practice");
  });

  it("returns null for unknown/empty values", () => {
    expect(learnModeForSession("compete")).toBeNull();
    expect(learnModeForSession("journey")).toBeNull();
    expect(learnModeForSession("")).toBeNull();
    expect(learnModeForSession(null)).toBeNull();
    expect(learnModeForSession(undefined)).toBeNull();
  });
});

describe("sanitizeHintMetadata", () => {
  it("keeps a finite km number", () => {
    expect(sanitizeHintMetadata({ km: 12.5 })).toEqual({ km: 12.5 });
  });

  it("keeps a valid years number", () => {
    expect(sanitizeHintMetadata({ years: 12 })).toEqual({ years: 12 });
  });

  it("keeps a numeric-string years value", () => {
    expect(sanitizeHintMetadata({ years: "8" })).toEqual({ years: "8" });
  });

  it("keeps km and years together", () => {
    expect(sanitizeHintMetadata({ km: 3, years: 7 })).toEqual({ km: 3, years: 7 });
  });

  it("drops NaN and Infinity km", () => {
    expect(sanitizeHintMetadata({ km: NaN })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: Infinity })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: -Infinity })).toBeUndefined();
  });

  it("drops negative km and negative years (number and string)", () => {
    expect(sanitizeHintMetadata({ km: -1 })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: -5 })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "-5" })).toBeUndefined();
  });

  it("drops non-numeric years strings", () => {
    expect(sanitizeHintMetadata({ years: "abc" })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "" })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: "12bc" })).toBeUndefined();
  });

  it("drops non-number km (numeric string is not accepted for km)", () => {
    expect(sanitizeHintMetadata({ km: "12" })).toBeUndefined();
    expect(sanitizeHintMetadata({ km: null })).toBeUndefined();
  });

  it("drops years objects/arrays/booleans", () => {
    expect(sanitizeHintMetadata({ years: { n: 5 } })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: [5] })).toBeUndefined();
    expect(sanitizeHintMetadata({ years: true })).toBeUndefined();
  });

  it("drops unknown extra keys", () => {
    expect(
      sanitizeHintMetadata({ km: 4, secret: "x", image: "u", foo: 1 })
    ).toEqual({ km: 4 });
  });

  it("returns undefined when nothing valid remains", () => {
    expect(sanitizeHintMetadata({ foo: "bar" })).toBeUndefined();
  });

  it("non-object inputs → undefined", () => {
    expect(sanitizeHintMetadata(null)).toBeUndefined();
    expect(sanitizeHintMetadata(undefined)).toBeUndefined();
    expect(sanitizeHintMetadata("str")).toBeUndefined();
    expect(sanitizeHintMetadata(5)).toBeUndefined();
    expect(sanitizeHintMetadata([{ km: 1 }])).toBeUndefined();
  });
});

describe("computeExcludedEventIds", () => {
  it("returns ids whose round index is not completed", () => {
    const ids = ["e0", "e1", "e2", "e3"];
    const excluded = computeExcludedEventIds(ids, new Set([0, 2]));
    expect([...excluded].sort()).toEqual(["e1", "e3"]);
  });

  it("empty when every round is completed", () => {
    const excluded = computeExcludedEventIds(["e0", "e1"], new Set([0, 1]));
    expect(excluded.size).toBe(0);
  });

  it("empty session draw → empty set", () => {
    expect(computeExcludedEventIds([], new Set()).size).toBe(0);
  });
});

describe("rankTimeline", () => {
  const self = selfAt(1900);

  it("places current between 2 newer and 2 older, newest first", () => {
    const out = rankTimeline(
      [
        cand("a", 1850),
        cand("b", 1890),
        cand("c", 1910),
        cand("d", 1950),
        cand("e", 1700),
        cand("f", 2000),
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["d", "c", "self", "b", "a"]);
    expect(out.filter((i) => i.isCurrent).map((i) => i.id)).toEqual(["self"]);
  });

  it("returns fewer items when one side is short", () => {
    const out = rankTimeline([cand("a", 1890)], self, NO_EXCLUDED);
    expect(out.map((i) => i.id)).toEqual(["self", "a"]);
  });

  it("only the current event when there are no candidates", () => {
    expect(rankTimeline([], self, NO_EXCLUDED).map((i) => i.id)).toEqual(["self"]);
  });

  it("drops excluded ids and the self duplicate, dedupes repeated ids", () => {
    const out = rankTimeline(
      [cand("x", 1901), cand("y", 1902), cand("y", 1902), cand("self", 1900)],
      self,
      new Set(["x"])
    );
    expect(out.map((i) => i.id)).toEqual(["y", "self"]);
  });

  it("same-year events count as older and tie-break by title", () => {
    const out = rankTimeline(
      [cand("b", 1900), cand("a", 1900), cand("c", 1900)],
      self,
      NO_EXCLUDED
    );
    expect(out.map((i) => i.id)).toEqual(["self", "a", "b"]);
  });

  it("items carry id/title/year/location/isCurrent only", () => {
    const out = rankTimeline([cand("a", 1890)], self, NO_EXCLUDED);
    expect(out[1]).toEqual({
      id: "a",
      title: "T-a",
      year: 1890,
      location: "L-a",
      isCurrent: false,
    });
  });
});

describe("haversineKm", () => {
  it("is 0 for identical points and ~111km per degree of latitude", () => {
    expect(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe("rankByLocation", () => {
  const self = selfAt(1900, 0, 0);

  it("returns current + 4 closest, current first, nearest first", () => {
    const out = rankByLocation(
      [
        cand("far", 1800, 40, 40),
        cand("n1", 1800, 1, 0),
        cand("n3", 1800, 3, 0),
        cand("n2", 1800, 2, 0),
        cand("n4", 1800, 4, 0),
        cand("n5", 1800, 5, 0),
      ],
      self,
      NO_EXCLUDED
    );
    expect(out.map((p) => p.id)).toEqual(["self", "n1", "n2", "n3", "n4"]);
    expect(out[0]).toMatchObject({ isCurrent: true, km: 0, lat: 0, lng: 0 });
    expect(out[1].isCurrent).toBe(false);
    expect(out[1].km).toBe(111);
  });

  it("skips candidates without coordinates and excluded ids", () => {
    const out = rankByLocation(
      [cand("nocoord", 1800), cand("x", 1800, 1, 0), cand("y", 1800, 2, 0)],
      self,
      new Set(["x"])
    );
    expect(out.map((p) => p.id)).toEqual(["self", "y"]);
  });

  it("empty when the current event has no coordinates", () => {
    const out = rankByLocation(
      [cand("a", 1800, 1, 1)],
      selfAt(1900, null, null),
      NO_EXCLUDED
    );
    expect(out).toEqual([]);
  });

  it("current event alone when nothing else has coordinates", () => {
    const out = rankByLocation([cand("a", 1800)], self, NO_EXCLUDED);
    expect(out.map((p) => p.id)).toEqual(["self"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadEventLearn i18n overlay (I18N-BUILD-OVERLAYCORE-1123-852)
// dbPool is mocked; translation queries are served by the same mock so the
// full loadEventLearn path (English queries + overlay fetch) is exercised.
// ─────────────────────────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>;

const LEARN_EVENT_ROW: MockRow = {
  description: "Self desc EN",
  title: "Self Title EN",
  event_year: 1900,
  latitude: 0,
  longitude: 0,
  display_name: "Self Loc EN",
};

const LEARN_HINT_ROWS: MockRow[] = [
  { id: "h-t2", tier: 2, type: "when", content: "Tier2 EN", metadata: null },
  { id: "h-t4w", tier: 4, type: "when", content: "Contemp EN", metadata: { km: 5 } },
  { id: "h-t4l", tier: 4, type: "where", content: "Nearby EN", metadata: { km: 9 } },
  { id: "h-t5w", tier: 5, type: "when", content: "Year clues EN", metadata: null },
  { id: "h-t5l", tier: 5, type: "where", content: "Loc clues EN", metadata: null },
];

const LEARN_CANDIDATE_ROWS: MockRow[] = [
  { id: "c1", title: "Cand One EN", event_year: 1950, display_name: "Loc C1 EN", latitude: 1, longitude: 0 },
  { id: "c2", title: "Cand Two EN", event_year: 1920, display_name: "Loc C2 EN", latitude: 2, longitude: 0 },
  { id: "c3", title: "Cand Three EN", event_year: 1850, display_name: "Loc C3 EN", latitude: 3, longitude: 0 },
  { id: "c4", title: "Cand Four EN", event_year: 1800, display_name: "Loc C4 EN", latitude: 4, longitude: 0 },
  { id: "c5", title: "Cand Five EN", event_year: 1700, display_name: "Loc C5 EN", latitude: 40, longitude: 40 },
];

const LEARN_EVENT_TR: MockRow[] = [
  { event_id: "e0", title: "Self Title FR", description: "Self desc FR", category: "Cat FR", theme: "Theme FR" },
  { event_id: "c1", title: "Cand One FR", description: "D1 FR", category: null, theme: null },
  { event_id: "c2", title: "", description: null, category: null, theme: null },
  { event_id: "c3", title: "Cand Three FR", description: null, category: null, theme: null },
  { event_id: "c4", title: "Cand Four FR", description: null, category: null, theme: null },
];

const LEARN_HINT_TR: MockRow[] = [
  { hint_id: "h-t5w", content: "Year clues FR" },
  { hint_id: "h-t5l", content: "Loc clues FR" },
  { hint_id: "h-t4w", content: "   " },
  { hint_id: "h-t4l", content: "Nearby FR" },
];

const LEARN_LOCATION_TR: MockRow[] = [
  { event_id: "e0", display_name: "Self Loc FR", country: "France" },
  { event_id: "c1", display_name: "Loc C1 FR", country: "C1" },
  { event_id: "c2", display_name: "Loc C2 FR", country: "C2" },
  { event_id: "c3", display_name: null, country: null },
  { event_id: "c4", display_name: "Loc C4 FR", country: "C4" },
];

function installLearnFixture() {
  mockDbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const ids = Array.isArray(params?.[0]) ? (params[0] as string[]) : [];
    if (sql.includes("event_translations")) {
      return {
        rows: LEARN_EVENT_TR.filter((r) => ids.includes(r.event_id as string)),
      };
    }
    if (sql.includes("hint_translations")) {
      return { rows: ids.includes("e0") ? LEARN_HINT_TR : [] };
    }
    if (sql.includes("location_translations")) {
      return {
        rows: LEARN_LOCATION_TR.filter((r) => ids.includes(r.event_id as string)),
      };
    }
    if (sql.includes("FROM sessions")) return { rows: [{ ok: true }] };
    if (sql.includes("SESSION_CREATED")) {
      return { rows: [{ event_ids: ["e0", "e1", "e2"] }] };
    }
    if (sql.includes("round_results")) {
      return { rows: [0, 1, 2].map((round_index) => ({ round_index })) };
    }
    if (sql.includes("FROM hints")) return { rows: LEARN_HINT_ROWS };
    if (sql.includes("e.id <> $1::uuid")) return { rows: LEARN_CANDIDATE_ROWS };
    if (sql.includes("FROM events e")) return { rows: [LEARN_EVENT_ROW] };
    return { rows: [] };
  });
}

function learnParams(lang?: string | null) {
  return {
    eventId: "e0",
    gameId: "game-1",
    playerId: "player-1",
    mode: "practice" as const,
    ...(lang !== undefined ? { lang } : {}),
  };
}

const ORIGIN = { lat: 0, lng: 0 };
const mapPt = (
  id: string,
  title: string,
  year: number,
  location: string | null,
  lat: number,
  lng: number,
  isCurrent: boolean
) => ({
  id,
  title,
  year,
  location,
  lat,
  lng,
  km: isCurrent ? 0 : Math.round(haversineKm(ORIGIN, { lat, lng })),
  isCurrent,
});

const EN_DATA = {
  title: "Self Title EN",
  description: "Self desc EN",
  yearClues: "Year clues EN",
  locationClues: "Loc clues EN",
  contemporaryEvent: { content: "Contemp EN", metadata: { km: 5 } },
  nearbyLandmark: { content: "Nearby EN", metadata: { km: 9 } },
  timeline: [
    { id: "c1", title: "Cand One EN", year: 1950, location: "Loc C1 EN", isCurrent: false },
    { id: "c2", title: "Cand Two EN", year: 1920, location: "Loc C2 EN", isCurrent: false },
    { id: "e0", title: "Self Title EN", year: 1900, location: "Self Loc EN", isCurrent: true },
    { id: "c3", title: "Cand Three EN", year: 1850, location: "Loc C3 EN", isCurrent: false },
    { id: "c4", title: "Cand Four EN", year: 1800, location: "Loc C4 EN", isCurrent: false },
  ],
  mapPoints: [
    mapPt("e0", "Self Title EN", 1900, "Self Loc EN", 0, 0, true),
    mapPt("c1", "Cand One EN", 1950, "Loc C1 EN", 1, 0, false),
    mapPt("c2", "Cand Two EN", 1920, "Loc C2 EN", 2, 0, false),
    mapPt("c3", "Cand Three EN", 1850, "Loc C3 EN", 3, 0, false),
    mapPt("c4", "Cand Four EN", 1800, "Loc C4 EN", 4, 0, false),
  ],
};

const FR_DATA = {
  title: "Self Title FR",
  description: "Self desc FR",
  yearClues: "Year clues FR",
  locationClues: "Loc clues FR",
  contemporaryEvent: { content: "Contemp EN", metadata: { km: 5 } },
  nearbyLandmark: { content: "Nearby FR", metadata: { km: 9 } },
  timeline: [
    { id: "c1", title: "Cand One FR", year: 1950, location: "Loc C1 EN", isCurrent: false },
    { id: "c2", title: "Cand Two EN", year: 1920, location: "Loc C2 EN", isCurrent: false },
    { id: "e0", title: "Self Title FR", year: 1900, location: "Self Loc EN", isCurrent: true },
    { id: "c3", title: "Cand Three FR", year: 1850, location: "Loc C3 EN", isCurrent: false },
    { id: "c4", title: "Cand Four FR", year: 1800, location: "Loc C4 EN", isCurrent: false },
  ],
  mapPoints: [
    mapPt("e0", "Self Title FR", 1900, "Self Loc FR", 0, 0, true),
    mapPt("c1", "Cand One FR", 1950, "Loc C1 FR", 1, 0, false),
    mapPt("c2", "Cand Two EN", 1920, "Loc C2 FR", 2, 0, false),
    mapPt("c3", "Cand Three FR", 1850, "Loc C3 EN", 3, 0, false),
    mapPt("c4", "Cand Four FR", 1800, "Loc C4 FR", 4, 0, false),
  ],
};

describe("loadEventLearn i18n overlay", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
    installLearnFixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("without lang returns the English payload and runs no translation queries", async () => {
    const result = await loadEventLearn(learnParams());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const sqls = mockDbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.filter((s) => s.includes("_translations"))).toHaveLength(0);
    expect(sqls).toHaveLength(6);
    expect(result.data).toEqual(EN_DATA);
  });

  it("with lang=null behaves identically to no lang", async () => {
    const result = await loadEventLearn(learnParams(null));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const sqls = mockDbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.filter((s) => s.includes("_translations"))).toHaveLength(0);
    expect(result.data).toEqual(EN_DATA);
  });

  it("with lang='fr' overlays title, description, hints and rendered items", async () => {
    const result = await loadEventLearn(learnParams("fr"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const sqls = mockDbQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.filter((s) => s.includes("_translations"))).toHaveLength(3);
    expect(sqls).toHaveLength(9);

    expect(result.data).toEqual(FR_DATA);

    // Response shape is unchanged.
    expect(Object.keys(result.data).sort()).toEqual(
      [
        "contemporaryEvent",
        "description",
        "locationClues",
        "mapPoints",
        "nearbyLandmark",
        "timeline",
        "title",
        "yearClues",
      ].sort()
    );
    for (const item of result.data.timeline) {
      expect(Object.keys(item).sort()).toEqual(
        ["id", "isCurrent", "location", "title", "year"].sort()
      );
    }
    for (const item of result.data.mapPoints) {
      expect(Object.keys(item).sort()).toEqual(
        ["id", "isCurrent", "km", "lat", "lng", "location", "title", "year"].sort()
      );
    }

    // Only the rendered item ids were requested for translation (c5 is
    // truncated by ranking and never fetched).
    const trCall = mockDbQuery.mock.calls.find((c) =>
      String(c[0]).includes("event_translations")
    );
    expect(trCall).toBeDefined();
    expect([...(trCall![1] as [string[], string])[0]].sort()).toEqual(
      ["c1", "c2", "c3", "c4", "e0"].sort()
    );
  });
});
