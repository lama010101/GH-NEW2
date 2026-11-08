import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildQueue,
  assertPracticeHintsOff,
  type BuildQueueInput,
  type QueueInputPlayer,
} from "./aiWorkQueue";

// AIP-BUILD-FLEETFINAL-1103-060 — D7 queue ordering/caps + D2 assertion proof.

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const NOW = 1_800_000_000_000;

function player(over: Partial<QueueInputPlayer> = {}): QueueInputPlayer {
  return { playerId: "p-1", tier: "cheap", modes: ["daily", "practice"], ...over };
}

function input(over: Partial<BuildQueueInput> = {}): BuildQueueInput {
  return {
    players: [player()],
    dailyEventIds: [],
    candidates: [],
    successes: [],
    deferrals: [],
    errorRows: [],
    maxPlaysPerRun: 150,
    practicePerPlayerPerRun: 20,
    benchmarkSubsetSize: 50,
    now: NOW,
    ...over,
  };
}

describe("buildQueue — step 1 (daily misses)", () => {
  it("queues today's daily events the player lacks, in input order", () => {
    const q = buildQueue(
      input({
        dailyEventIds: ["d1", "d2", "d3"],
        successes: [{ playerId: "p-1", eventId: "d2" }],
      })
    );
    expect(q).toEqual([
      { playerId: "p-1", eventId: "d1", mode: "daily", step: 1 },
      { playerId: "p-1", eventId: "d3", mode: "daily", step: 1 },
    ]);
  });

  it("no daily items when the player lacks the daily mode", () => {
    const q = buildQueue(
      input({ players: [player({ modes: ["practice"] })], dailyEventIds: ["d1"] })
    );
    expect(q).toEqual([]);
  });
});

describe("buildQueue — step 2 (practice coverage)", () => {
  it("only events never played by ANY eligible player; lowest coverage first; sha256 tie-break", () => {
    // eligible coverage 0 for all three (success belongs to a non-eligible
    // player for e-high); coverage field still drives the ordering.
    const q = buildQueue(
      input({
        candidates: [
          { eventId: "e-high", coverage: 5 },
          { eventId: "e-low", coverage: 1 },
          { eventId: "e-mid", coverage: 3 },
          { eventId: "e-covered", coverage: 9 },
        ],
        successes: [
          { playerId: "non-eligible-bot", eventId: "e-high" }, // not in players[]
          { playerId: "non-eligible-bot", eventId: "e-covered" },
          { playerId: "p-1", eventId: "e-covered" }, // eligible success -> excluded
        ],
      })
    );
    expect(q.map((i) => i.eventId)).toEqual(["e-low", "e-mid", "e-high"]);
    expect(q.every((i) => i.mode === "practice" && i.step === 2)).toBe(true);
  });

  it("equal coverage => sha256(eventId) lexicographic order (computed independently)", () => {
    const ids = ["za-evt", "qb-evt", "mm-evt", "aa-evt"];
    const expected = [...ids].sort((a, b) => sha(a).localeCompare(sha(b)));
    const q = buildQueue(
      input({ candidates: ids.map((eventId) => ({ eventId, coverage: 0 })) })
    );
    expect(q.map((i) => i.eventId)).toEqual(expected);
  });

  it("an event played by ANOTHER eligible player is not a step-2 candidate", () => {
    const q = buildQueue(
      input({
        players: [player(), player({ playerId: "p-2" })],
        candidates: [
          { eventId: "e-virgin", coverage: 0 },
          { eventId: "e-p2did", coverage: 1 },
        ],
        successes: [{ playerId: "p-2", eventId: "e-p2did" }],
      })
    );
    const p1items = q.filter((i) => i.playerId === "p-1");
    expect(p1items.map((i) => i.eventId)).toEqual(["e-virgin"]);
  });

  it("events the player already succeeded on are excluded", () => {
    const q = buildQueue(
      input({
        candidates: [
          { eventId: "e-done", coverage: 0 },
          { eventId: "e-new", coverage: 0 },
        ],
        successes: [{ playerId: "p-1", eventId: "e-done" }],
      })
    );
    expect(q.map((i) => i.eventId)).toEqual(["e-new"]);
  });

  it("premium tier gets NO step 2", () => {
    const q = buildQueue(
      input({
        players: [player({ tier: "premium" })],
        candidates: [{ eventId: "e-1", coverage: 0 }],
        benchmarkSubsetSize: 0, // suppress step 3 for a clean assertion
      })
    );
    expect(q).toEqual([]);
  });

  it("daily ordering beats practice when an event is in both sets", () => {
    const q = buildQueue(
      input({
        dailyEventIds: ["e-x"],
        candidates: [{ eventId: "e-x", coverage: 0 }],
      })
    );
    expect(q).toHaveLength(1);
    expect(q[0]).toEqual({ playerId: "p-1", eventId: "e-x", mode: "daily", step: 1 });
  });
});

describe("buildQueue — step 3 (premium benchmark subset)", () => {
  it("premium player gets the first-N-in-hash-order subset it lacks", () => {
    const ids = ["ev-a", "ev-b", "ev-c", "ev-d", "ev-e"];
    const hashOrder = [...ids].sort((a, b) => sha(a).localeCompare(sha(b)));
    const subset = hashOrder.slice(0, 3);
    const q = buildQueue(
      input({
        players: [player({ tier: "premium", modes: ["daily", "practice"] })],
        candidates: ids.map((eventId) => ({ eventId, coverage: 0 })),
        successes: [{ playerId: "p-1", eventId: subset[0] }],
        benchmarkSubsetSize: 3,
      })
    );
    expect(q.map((i) => i.eventId)).toEqual(subset.slice(1));
    expect(q.every((i) => i.step === 3 && i.mode === "practice")).toBe(true);
  });

  it("non-premium players never get step 3", () => {
    const q = buildQueue(
      input({
        players: [player({ tier: "free" })],
        candidates: [{ eventId: "e-1", coverage: 0 }],
      })
    );
    expect(q.every((i) => i.step === 2)).toBe(true); // free goes through step 2
  });

  it("premium without practice mode gets nothing", () => {
    const q = buildQueue(
      input({
        players: [player({ tier: "premium", modes: ["daily"] })],
        candidates: [{ eventId: "e-1", coverage: 0 }],
      })
    );
    expect(q).toEqual([]);
  });
});

describe("buildQueue — step 4 (deferrals + error refresh)", () => {
  it("due deferral queued with its stored mode; future retry_after skipped", () => {
    const q = buildQueue(
      input({
        deferrals: [
          { playerId: "p-1", eventId: "e-due", mode: "practice", retryAfterAt: NOW - 1 },
          { playerId: "p-1", eventId: "e-now", mode: "practice", retryAfterAt: NOW },
          { playerId: "p-1", eventId: "e-later", mode: "practice", retryAfterAt: NOW + 60_000 },
          { playerId: "p-1", eventId: "e-open", mode: "daily", retryAfterAt: null },
        ],
      })
    );
    expect(q).toEqual([
      { playerId: "p-1", eventId: "e-due", mode: "practice", step: 4 },
      { playerId: "p-1", eventId: "e-now", mode: "practice", step: 4 },
      { playerId: "p-1", eventId: "e-open", mode: "daily", step: 4 },
    ]);
  });

  it("audit-mode deferrals are never emitted (audit runner owns them)", () => {
    const q = buildQueue(
      input({
        deferrals: [{ playerId: "p-1", eventId: "e-a", mode: "audit", retryAfterAt: null }],
      })
    );
    expect(q).toEqual([]);
  });

  it("error rows are refreshed in their stored mode; succeeded/other players' rows skipped", () => {
    const q = buildQueue(
      input({
        errorRows: [
          { playerId: "p-1", eventId: "e-err", mode: "daily" },
          { playerId: "p-1", eventId: "e-done", mode: "daily" },
          { playerId: "p-2", eventId: "e-other", mode: "daily" },
        ],
        successes: [{ playerId: "p-1", eventId: "e-done" }],
      })
    );
    expect(q).toEqual([{ playerId: "p-1", eventId: "e-err", mode: "daily", step: 4 }]);
  });

  it("step-4 respects current modes (daily deferral skipped without daily mode)", () => {
    const q = buildQueue(
      input({
        players: [player({ modes: ["practice"] })],
        deferrals: [
          { playerId: "p-1", eventId: "e-d", mode: "daily", retryAfterAt: null },
          { playerId: "p-1", eventId: "e-p", mode: "practice", retryAfterAt: null },
        ],
      })
    );
    expect(q).toEqual([{ playerId: "p-1", eventId: "e-p", mode: "practice", step: 4 }]);
  });
});

describe("buildQueue — caps", () => {
  it("practicePerPlayerPerRun caps only practice items, not daily or deferrals", () => {
    const q = buildQueue(
      input({
        dailyEventIds: ["d1", "d2"],
        candidates: [
          { eventId: "c1", coverage: 0 },
          { eventId: "c2", coverage: 0 },
          { eventId: "c3", coverage: 0 },
        ],
        deferrals: [{ playerId: "p-1", eventId: "e-def", mode: "practice", retryAfterAt: null }],
        practicePerPlayerPerRun: 2,
      })
    );
    const practiceItems = q.filter((i) => i.mode === "practice");
    expect(practiceItems).toHaveLength(2); // 2 practice slots: step-2 pair wins over the deferral
    expect(q.filter((i) => i.mode === "daily")).toHaveLength(2);
    expect(q.filter((i) => i.eventId === "e-def")).toHaveLength(0); // cap already spent
  });

  it("maxPlaysPerRun truncates the concatenated queue", () => {
    const q = buildQueue(
      input({
        players: [player(), player({ playerId: "p-2" })],
        dailyEventIds: ["d1", "d2", "d3"],
        maxPlaysPerRun: 4,
      })
    );
    expect(q).toHaveLength(4); // p-1's 3 daily + first of p-2's
    expect(q[3].playerId).toBe("p-2");
  });

  it("daily misses of LATER players beat an earlier player's refresh backlog", () => {
    // PROD 2026-11-05 regression: p-1's 5 step-4 error refreshes consumed the
    // whole cap in raw emission order, starving p-2's 3 step-1 daily misses.
    const q = buildQueue(
      input({
        players: [player(), player({ playerId: "p-2" })],
        dailyEventIds: ["d1", "d2", "d3"],
        errorRows: [1, 2, 3, 4, 5].map((n) => ({
          playerId: "p-1",
          eventId: `e-err-${n}`,
          mode: "daily" as const,
        })),
        maxPlaysPerRun: 6,
      })
    );
    expect(q.filter((i) => i.step === 1)).toHaveLength(6); // all daily misses first
    expect(q.filter((i) => i.playerId === "p-2" && i.step === 1)).toHaveLength(3);
    expect(q.every((i) => i.step === 1)).toBe(true); // no refresh item fits
  });

  it("zero caps => empty queue", () => {
    expect(
      buildQueue(input({ dailyEventIds: ["d1"], maxPlaysPerRun: 0 }))
    ).toEqual([]);
    expect(
      buildQueue(
        input({ candidates: [{ eventId: "c", coverage: 0 }], practicePerPlayerPerRun: 0 })
      )
    ).toEqual([]);
  });
});

describe("assertPracticeHintsOff (D2)", () => {
  const clean = {
    play_mode: "practice",
    hints_off: true,
    hints_requested: [] as unknown,
    hint_penalty_applied: { whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 0 },
  };

  it("a canonical practice row passes", () => {
    expect(() => assertPracticeHintsOff(clean)).not.toThrow();
    expect(() =>
      assertPracticeHintsOff({ ...clean, hints_requested: null, hint_penalty_applied: null })
    ).not.toThrow();
    expect(() =>
      assertPracticeHintsOff({ ...clean, hints_requested: "[]" })
    ).not.toThrow();
  });

  it("daily rows are never checked", () => {
    expect(() =>
      assertPracticeHintsOff({
        play_mode: "daily",
        hints_off: false,
        hints_requested: [{ tier: 1, type: "when" }],
        hint_penalty_applied: { whenPenaltyRate: 30, wherePenaltyRate: 0, validHintCount: 1 },
      })
    ).not.toThrow();
  });

  it("practice + non-empty hints_requested throws", () => {
    expect(() =>
      assertPracticeHintsOff({ ...clean, hints_requested: [{ tier: 1, type: "when" }] })
    ).toThrow(/non-empty hints_requested/);
  });

  it("practice + non-zero penalties throws", () => {
    expect(() =>
      assertPracticeHintsOff({ ...clean, hint_penalty_applied: { whenPenaltyRate: 30, wherePenaltyRate: 0, validHintCount: 0 } })
    ).toThrow(/non-zero hint penalties/);
    expect(() =>
      assertPracticeHintsOff({ ...clean, hint_penalty_applied: { whenPenaltyRate: 0, wherePenaltyRate: 50, validHintCount: 0 } })
    ).toThrow(/non-zero hint penalties/);
    expect(() =>
      assertPracticeHintsOff({ ...clean, hint_penalty_applied: { whenPenaltyRate: 0, wherePenaltyRate: 0, validHintCount: 2 } })
    ).toThrow(/non-zero hint penalties/);
  });

  it("practice + hints_off false throws", () => {
    expect(() => assertPracticeHintsOff({ ...clean, hints_off: false })).toThrow(/hints_off=true/);
  });
});
