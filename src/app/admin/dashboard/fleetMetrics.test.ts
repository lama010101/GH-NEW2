import { describe, it, expect } from "vitest";
import {
  classifyFailure,
  coveragePct,
  deriveFailing,
  deriveModelState,
  derivePrice,
  deriveTrack,
  depthBucket,
  modelGroupKey,
} from "./fleetMetrics";

// ADMIN-BUILD-FLEETTRUTH-1101-031 — unit tests for the fleet-truth
// definitions. Pure fixtures only; no DB access.

describe("classifyFailure", () => {
  it("null error => null (OK play, not a failure)", () => {
    expect(classifyFailure(null)).toBeNull();
    expect(classifyFailure(undefined)).toBeNull();
    expect(classifyFailure("")).toBeNull();
  });

  it("classifies by cause in spec order", () => {
    expect(classifyFailure("OpenRouter request failed: 401 Unauthorized")).toBe("auth");
    expect(classifyFailure("OpenRouter request failed: 404 Not Found")).toBe("gone");
    expect(classifyFailure("HTTP 429 Too Many Requests")).toBe("rate_limit");
    expect(classifyFailure("Failed to parse AI guess")).toBe("bad_output");
    expect(classifyFailure("Final guess response missing finalGuess")).toBe("bad_output");
    expect(classifyFailure("socket hang up")).toBe("other");
  });
});

describe("deriveModelState", () => {
  const base = {
    is_active: true,
    is_active_practice: false,
    is_active_daily: true,
    availability_status: "available",
    has_catalog_row: true,
  };

  it("master off + Daily on => Paused (not counted as running)", () => {
    const s = deriveModelState({ ...base, is_active: false });
    expect(s.state).toBe("paused");
    expect(s.reason).toBe("Master switch off");
  });

  it("master on + no mode flag => Blocked 'No mode selected'", () => {
    const s = deriveModelState({
      ...base,
      is_active_practice: false,
      is_active_daily: false,
    });
    expect(s.state).toBe("blocked");
    expect(s.reason).toBe("No mode selected");
  });

  it("availability not_in_catalog => Blocked with that status as reason", () => {
    const s = deriveModelState({ ...base, availability_status: "not_in_catalog" });
    expect(s.state).toBe("blocked");
    expect(s.reason).toBe("not_in_catalog");
  });

  it("null availability (no catalog row) => NOT Blocked, flagged unverified", () => {
    const s = deriveModelState({
      ...base,
      availability_status: null,
      has_catalog_row: false,
    });
    expect(s.state).toBe("running");
    expect(s.unverified).toBe(true);
  });

  it("master on + Practice on + available => Running", () => {
    const s = deriveModelState({ ...base, is_active_practice: true });
    expect(s.state).toBe("running");
  });
});

describe("deriveFailing (auth rows excluded from the rate)", () => {
  it("fewer than 5 considered plays => never failing", () => {
    const r = deriveFailing({ plays_7d: 10, ok_7d: 0, auth_7d: 8 });
    expect(r.considered).toBe(2);
    expect(r.failing).toBe(false);
    expect(r.okRate).toBeNull();
  });

  it("401 rows excluded: plays 10, ok 4, auth 2 => 8 considered, 50% => NOT failing", () => {
    // Without the auth exclusion the rate would be 4/10 = 40% (failing).
    const r = deriveFailing({ plays_7d: 10, ok_7d: 4, auth_7d: 2 });
    expect(r.considered).toBe(8);
    expect(r.okRate).toBe(0.5);
    expect(r.failing).toBe(false);
  });

  it("ok-rate below 50% with >=5 considered => failing", () => {
    const r = deriveFailing({ plays_7d: 6, ok_7d: 1, auth_7d: 0 });
    expect(r.considered).toBe(6);
    expect(r.okRate).toBeCloseTo(1 / 6);
    expect(r.failing).toBe(true);
  });
});

describe("deriveTrack", () => {
  it("true => vision, false => text, null => unknown", () => {
    expect(deriveTrack(true)).toBe("vision");
    expect(deriveTrack(false)).toBe("text");
    expect(deriveTrack(null)).toBe("unknown");
  });
});

describe("derivePrice", () => {
  it("is_free true => Free; ':free' suffix is a fallback without a catalog row", () => {
    expect(derivePrice(true, "acme/model")).toBe("free");
    expect(derivePrice(null, "acme/model:free")).toBe("free");
    expect(derivePrice(false, "acme/model:free")).toBe("free");
  });
  it("is_free false => Paid; no row and no suffix => Unknown", () => {
    expect(derivePrice(false, "acme/model")).toBe("paid");
    expect(derivePrice(null, "acme/model")).toBe("unknown");
  });
});

describe("coverage depth buckets + pct", () => {
  it("buckets 0 / 1 / 2 / 3+ distinct models", () => {
    expect(depthBucket(0)).toBe("0");
    expect(depthBucket(1)).toBe("1");
    expect(depthBucket(2)).toBe("2");
    expect(depthBucket(3)).toBe("3+");
    expect(depthBucket(9)).toBe("3+");
  });
  it("coveragePct guards empty catalogue", () => {
    expect(coveragePct(136, 1238)).toBeCloseTo(10.985, 2);
    expect(coveragePct(3, 0)).toBe(0);
  });
});

describe("modelGroupKey", () => {
  it("track+price key; unknown track collapses to 'unknown'", () => {
    expect(modelGroupKey("vision", "free")).toBe("vision-free");
    expect(modelGroupKey("text", "paid")).toBe("text-paid");
    expect(modelGroupKey("unknown", "free")).toBe("unknown");
    expect(modelGroupKey("unknown", "unknown")).toBe("unknown");
  });
});
