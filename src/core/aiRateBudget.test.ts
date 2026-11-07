import { describe, it, expect } from "vitest";
import {
  parseRateSettings,
  TokenBucket,
  parseRetryAfterMs,
  backoffMs,
  classifyOutcome,
  DEFAULT_RATE_SETTINGS,
} from "./aiRateBudget";

// AIP-BUILD-FLEETFINAL-1103-060 — D3 rate-budget primitives proof.
// All timing is injected (now/rand) — no real timers anywhere.

describe("parseRateSettings", () => {
  it("empty/missing rows => full D3 defaults", () => {
    expect(parseRateSettings([])).toEqual(DEFAULT_RATE_SETTINGS);
    expect(parseRateSettings(null)).toEqual(DEFAULT_RATE_SETTINGS);
    expect(parseRateSettings(undefined)).toEqual(DEFAULT_RATE_SETTINGS);
  });

  it("defaults are the D3 values", () => {
    expect(DEFAULT_RATE_SETTINGS).toEqual({
      rpmFree: 15,
      rpmPaid: 20,
      rpmOverrides: {
        "qwen/qwen3-vl-8b-instruct": 6,
        "google/gemini-2.5-flash-lite": 10,
      },
      freeRpdFleet: 900,
      rpdPaidModel: 1500,
      globalRpd: 3000,
      runMaxPlays: 150,
      runMaxAudits: 120,
      callsPerPlay: 3,
      backoffBaseMs: 30_000,
      backoffMaxMs: 600_000,
      maxCooldownsPerModel: 3,
      practicePerPlayerPerRun: 20,
      benchmarkSubsetSize: 50,
    });
  });

  it("numeric jsonb values coerce (number and numeric string)", () => {
    const s = parseRateSettings([
      { key: "ai_rpm_free", value: 12 },
      { key: "ai_rpm_paid", value: "25" },
      { key: "ai_global_rpd", value: 4000 },
    ]);
    expect(s.rpmFree).toBe(12);
    expect(s.rpmPaid).toBe(25);
    expect(s.globalRpd).toBe(4000);
    expect(s.freeRpdFleet).toBe(900); // untouched default
  });

  it("invalid values fall back per-key (zero, negative, NaN, junk, arrays)", () => {
    const s = parseRateSettings([
      { key: "ai_rpm_free", value: 0 },
      { key: "ai_rpm_paid", value: -5 },
      { key: "ai_free_rpd_fleet", value: "not a number" },
      { key: "ai_global_rpd", value: null },
      { key: "ai_run_max_plays", value: [150] },
      { key: "ai_backoff_base_ms", value: {} },
    ]);
    expect(s.rpmFree).toBe(15);
    expect(s.rpmPaid).toBe(20);
    expect(s.freeRpdFleet).toBe(900);
    expect(s.globalRpd).toBe(3000);
    expect(s.runMaxPlays).toBe(150);
    expect(s.backoffBaseMs).toBe(30_000);
  });

  it("overrides: object replaces defaults; bad entries dropped", () => {
    const s = parseRateSettings([
      { key: "ai_rpm_overrides", value: { "a/b": 3, "c/d": "7", "e/f": -1, "g/h": "x" } },
    ]);
    expect(s.rpmOverrides).toEqual({ "a/b": 3, "c/d": 7 });
  });

  it("overrides: {} clears; non-object keeps D3 defaults", () => {
    expect(
      parseRateSettings([{ key: "ai_rpm_overrides", value: {} }]).rpmOverrides
    ).toEqual({});
    expect(
      parseRateSettings([{ key: "ai_rpm_overrides", value: "junk" }]).rpmOverrides
    ).toEqual(DEFAULT_RATE_SETTINGS.rpmOverrides);
    expect(
      parseRateSettings([{ key: "ai_rpm_overrides", value: [1, 2] }]).rpmOverrides
    ).toEqual(DEFAULT_RATE_SETTINGS.rpmOverrides);
  });

  it("unknown keys ignored; malformed rows skipped", () => {
    const s = parseRateSettings([
      { key: "unrelated", value: 5 },
      { key: 42, value: 5 },
      null as unknown as { key: string; value: number },
    ]);
    expect(s).toEqual(DEFAULT_RATE_SETTINGS);
  });
});

describe("TokenBucket (injected clock)", () => {
  it("capacity 1: first take ok, second fails, refill after 1/rate seconds", () => {
    let t = 1_000_000;
    const b = new TokenBucket({ now: () => t, refillPerSec: 0.25 }); // 15 rpm
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    t += 4000; // 4s at 0.25/s => exactly 1 token
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
  });

  it("partial refill accumulates (never exceeds capacity)", () => {
    let t = 0;
    const b = new TokenBucket({ now: () => t, refillPerSec: 1, capacity: 2, initialTokens: 0 });
    t += 1500; // +1.5 tokens
    expect(b.tokensAvailable).toBeCloseTo(1.5, 9);
    t += 10_000; // way over capacity
    expect(b.tokensAvailable).toBe(2);
  });

  it("tryTake(n) is all-or-nothing", () => {
    let t = 0;
    const b = new TokenBucket({ now: () => t, refillPerSec: 1, capacity: 3 });
    expect(b.tryTake(2)).toBe(true);
    expect(b.tryTake(2)).toBe(false); // only 1 left — nothing taken
    expect(b.tokensAvailable).toBe(1);
    t += 2000;
    expect(b.tryTake(2)).toBe(true);
  });

  it("msUntil: 0 when available, correct wait when empty, Infinity when unreachable", () => {
    let t = 0;
    const b = new TokenBucket({ now: () => t, refillPerSec: 0.5 }); // 30 rpm
    expect(b.msUntil()).toBe(0);
    expect(b.tryTake()).toBe(true);
    expect(b.msUntil()).toBeCloseTo(2000, 9); // need 1 token at 0.5/s
    expect(b.msUntil(5)).toBe(Number.POSITIVE_INFINITY); // > capacity
    t += 2000;
    expect(b.msUntil()).toBe(0);
  });

  it("refillPerSec <= 0 never refills; clock skew does not drain tokens", () => {
    let t = 1000;
    const dead = new TokenBucket({ now: () => t, refillPerSec: 0 });
    expect(dead.tryTake()).toBe(true);
    expect(dead.tryTake()).toBe(false);
    t += 60_000;
    expect(dead.tryTake()).toBe(false);
    expect(dead.msUntil()).toBe(Number.POSITIVE_INFINITY);

    const skew = new TokenBucket({ now: () => t, refillPerSec: 1 });
    expect(skew.tryTake()).toBe(true);
    t -= 500; // clock moved backwards
    expect(skew.tokensAvailable).toBeLessThan(1);
    expect(skew.tryTake()).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("retry_after_ms=<n> token (the worker RATE_LIMIT_DEFERRED contract)", () => {
    expect(
      parseRetryAfterMs("RATE_LIMIT_DEFERRED retry_after_ms=45000 Parasail/upstream_provider_shared_pool")
    ).toBe(45000);
  });

  it("Retry-After seconds (header, json, and snake-case forms)", () => {
    expect(parseRetryAfterMs("OpenRouter request failed: 429 Retry-After: 30")).toBe(30_000);
    expect(parseRetryAfterMs('{"retry_after": 12}')).toBe(12_000);
    expect(parseRetryAfterMs("retry-after=2.5")).toBe(2500);
  });

  it("Retry-After HTTP-date against injected now", () => {
    const now = () => Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(
      parseRetryAfterMs("Retry-After: Wed, 21 Oct 2015 07:28:30 GMT", now)
    ).toBe(30_000);
    // A date in the past means 'now' => 0.
    expect(
      parseRetryAfterMs("Retry-After: Wed, 21 Oct 2015 07:27:00 GMT", now)
    ).toBe(0);
  });

  it("no parseable hint => null", () => {
    expect(parseRetryAfterMs("OpenRouter request failed: 429 Too Many Requests")).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("retry_after_ms=abc")).toBeNull();
  });

  it("retry_after_ms wins when both forms are present", () => {
    expect(parseRetryAfterMs("x retry_after_ms=5000 y retry-after: 99")).toBe(5000);
  });
});

describe("backoffMs (injected rand)", () => {
  it("exponential cap: attempt grows the ceiling, capped at max", () => {
    const r1 = () => 1;
    expect(backoffMs(0, 30_000, 600_000, r1)).toBe(30_000);
    expect(backoffMs(1, 30_000, 600_000, r1)).toBe(60_000);
    expect(backoffMs(5, 30_000, 600_000, r1)).toBe(600_000); // 960k capped
    expect(backoffMs(20, 30_000, 600_000, r1)).toBe(600_000);
  });

  it("full jitter: rand() scales [0, cap]", () => {
    expect(backoffMs(0, 30_000, 600_000, () => 0)).toBe(0);
    expect(backoffMs(0, 30_000, 600_000, () => 0.5)).toBe(15_000);
    expect(backoffMs(2, 30_000, 600_000, () => 0.25)).toBe(30_000); // cap 120k * .25
  });

  it("out-of-range rand is clamped; invalid base/max => 0", () => {
    expect(backoffMs(0, 30_000, 600_000, () => 5)).toBe(30_000);
    expect(backoffMs(0, 30_000, 600_000, () => -1)).toBe(0);
    expect(backoffMs(0, 0, 600_000, () => 1)).toBe(0);
    expect(backoffMs(0, 30_000, -1, () => 1)).toBe(0);
    expect(backoffMs(-3, 30_000, 600_000, () => 1)).toBe(30_000); // attempt floored at 0
  });
});

describe("classifyOutcome (consistent with aiFailureCauses)", () => {
  it("null/empty/undefined => ok", () => {
    expect(classifyOutcome(null)).toBe("ok");
    expect(classifyOutcome(undefined)).toBe("ok");
    expect(classifyOutcome("")).toBe("ok");
  });

  it("RATE_LIMIT_DEFERRED marker => rate_limit_deferred", () => {
    expect(
      classifyOutcome("RATE_LIMIT_DEFERRED retry_after_ms=30000 Parasail/upstream_provider_shared_pool")
    ).toBe("rate_limit_deferred");
  });

  it("plain 429 => rate_limit_deferred (never an immediate retry either)", () => {
    expect(classifyOutcome("OpenRouter request failed: 429 Too Many Requests")).toBe(
      "rate_limit_deferred"
    );
  });

  it("auth/gone => permanent", () => {
    expect(classifyOutcome("OpenRouter request failed: 401 Unauthorized")).toBe("permanent");
    expect(classifyOutcome("OpenRouter request failed: 404 Not Found")).toBe("permanent");
  });

  it("bad_output and other failures => transient", () => {
    expect(classifyOutcome("Failed to parse AI final guess response: EOF")).toBe("transient");
    expect(classifyOutcome("OpenRouter request failed: 500 Internal Server Error")).toBe("transient");
    expect(classifyOutcome("fetch failed: connect ECONNREFUSED")).toBe("transient");
    expect(classifyOutcome("TRUNCATED_LENGTH: finish_reason=length")).toBe("transient");
  });
});
