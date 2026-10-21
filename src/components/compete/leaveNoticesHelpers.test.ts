import { describe, expect, it } from "vitest";
import type { SessionPlayer } from "@/core/types";
import {
  deriveNewlyLeft,
  isSolo,
  shouldShowNotices,
  toastKey,
} from "./leaveNoticesHelpers";

const p = (playerId: string, leftAt: string | null = null, extra: Partial<SessionPlayer> = {}): SessionPlayer => ({
  playerId,
  displayName: `P-${playerId}`,
  joinedAt: "2026-10-21T00:00:00.000Z",
  leftAt,
  ready: true,
  isHost: false,
  avatarUrl: null,
  hasSubmitted: false,
  ...extra,
});

const T1 = "2026-10-21T04:00:00.000Z";
const T2 = "2026-10-21T04:10:00.000Z";

describe("shouldShowNotices — sync + active statuses only", () => {
  it("true in sync ROUND_ACTIVE and ROUND_COMPLETE", () => {
    expect(shouldShowNotices("ROUND_ACTIVE", "sync")).toBe(true);
    expect(shouldShowNotices("ROUND_COMPLETE", "sync")).toBe(true);
  });
  it("false in LOBBY, SESSION_COMPLETE, and non-sync modes", () => {
    expect(shouldShowNotices("LOBBY", "sync")).toBe(false);
    expect(shouldShowNotices("SESSION_COMPLETE", "sync")).toBe(false);
    expect(shouldShowNotices("ROUND_ACTIVE", "async")).toBe(false);
    expect(shouldShowNotices("ROUND_COMPLETE", "async")).toBe(false);
    expect(shouldShowNotices("ROUND_ACTIVE", "practice")).toBe(false);
    expect(shouldShowNotices("ROUND_ACTIVE", "daily")).toBe(false);
  });
});

describe("deriveNewlyLeft — null→set transitions, local excluded", () => {
  it("first snapshot (prev=null) → [] (no toasts on hydration)", () => {
    expect(deriveNewlyLeft(null, [p("a"), p("b", T1)], "a")).toEqual([]);
  });
  it("other player null→set → returned", () => {
    const prev = [p("a"), p("b"), p("c")];
    const next = [p("a"), p("b", T1), p("c")];
    expect(deriveNewlyLeft(prev, next, "a").map((x) => x.playerId)).toEqual(["b"]);
  });
  it("already-left in prev → no toast", () => {
    const prev = [p("a"), p("b", T1)];
    const next = [p("a"), p("b", T1)];
    expect(deriveNewlyLeft(prev, next, "a")).toEqual([]);
  });
  it("new joiner absent from prev → no toast", () => {
    const prev = [p("a"), p("b")];
    const next = [p("a"), p("b"), p("d", T1)];
    expect(deriveNewlyLeft(prev, next, "a")).toEqual([]);
  });
  it("two players leave at once → both returned", () => {
    const prev = [p("a"), p("b"), p("c")];
    const next = [p("a"), p("b", T1), p("c", T1)];
    expect(deriveNewlyLeft(prev, next, "a").map((x) => x.playerId).sort()).toEqual(["b", "c"]);
  });
  it("local player leaving → excluded", () => {
    const prev = [p("a"), p("b")];
    const next = [p("a", T1), p("b")];
    expect(deriveNewlyLeft(prev, next, "a")).toEqual([]);
  });
  it("rejoin (leftAt→null) then leave again → new toast (new key)", () => {
    const rejoined = [p("a"), p("b")]; // b's leftAt reset to null on rejoin
    const leftAgain = [p("a"), p("b", T2)];
    const out = deriveNewlyLeft(rejoined, leftAgain, "a");
    expect(out).toHaveLength(1);
    expect(toastKey("b", T1)).not.toBe(toastKey("b", T2));
  });
  it("array reordering does not affect detection", () => {
    const prev = [p("a"), p("b"), p("c")];
    const next = [p("c"), p("b", T1), p("a")];
    expect(deriveNewlyLeft(prev, next, "a").map((x) => x.playerId)).toEqual(["b"]);
  });
});

describe("isSolo — local active AND all others left", () => {
  it("2 players, other left → true", () => {
    expect(isSolo([p("a"), p("b", T1)], "a")).toBe(true);
  });
  it("3 players, one left → false", () => {
    expect(isSolo([p("a"), p("b", T1), p("c")], "a")).toBe(false);
  });
  it("other active AI → false", () => {
    expect(isSolo([p("a"), p("bot", null, { isAi: true })], "a")).toBe(false);
  });
  it("local already left → false", () => {
    expect(isSolo([p("a", T1), p("b", T1)], "a")).toBe(false);
  });
  it("single-player game → false", () => {
    expect(isSolo([p("a")], "a")).toBe(false);
  });
  it("no localPlayerId → false", () => {
    expect(isSolo([p("a"), p("b", T1)], null)).toBe(false);
  });
  it("left player rejoins (leftAt→null) → false again", () => {
    expect(isSolo([p("a"), p("b")], "a")).toBe(false);
  });
});

describe("toastKey", () => {
  it("is playerId:leftAt", () => {
    expect(toastKey("x", T1)).toBe(`x:${T1}`);
  });
});
