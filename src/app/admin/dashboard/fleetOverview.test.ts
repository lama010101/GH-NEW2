import { describe, it, expect } from "vitest";
import {
  buildRecommendations,
  classifyEventAudit,
  classifyModelStatus,
  classifyProblem,
  compareSortValues,
  describeRun,
  isFreeVisionAlwaysOn,
  sortRows,
  type BuildRecommendationsInput,
  type ClassifyModelStatusInput,
  type RecommendationModelInput,
} from "./fleetOverview";
import {
  classifyPlayer,
  type CatalogModel,
  type FleetPlayer,
} from "@/core/aiEligibility";

// ADM-BUILD-FLEETDASH-1107-120 — unit tests for the fleet-overview pure logic.

const NOW = Date.parse("2026-11-07T12:00:00Z");
const H = 3_600_000;

function statusInput(
  over: Partial<ClassifyModelStatusInput> = {}
): ClassifyModelStatusInput {
  return {
    nowMs: NOW,
    catalogAvailable: true,
    eligibilityRole: "player",
    eligibilityReason: "paid_vision",
    isVision: true,
    isActiveDaily: true,
    isActivePractice: false,
    freeVisionAlwaysOn: false,
    spendTodayUsd: 0,
    dailyCapUsd: null,
    fleetSpendTodayUsd: 0,
    fleetCapUsd: null,
    fleetHalted: false,
    rateLimited: false,
    lastSuccessAtMs: NOW - 2 * H,
    lastActivityAtMs: null,
    ...over,
  };
}

describe("classifyModelStatus precedence", () => {
  it("1. provider removed model -> stopped, beats every later rule", () => {
    const r = classifyModelStatus(
      statusInput({
        catalogAvailable: false,
        eligibilityRole: "excluded",
        eligibilityReason: "dead_slug",
        isActiveDaily: false,
        isActivePractice: false,
        spendTodayUsd: 99,
        dailyCapUsd: 1,
        fleetHalted: true,
        rateLimited: true,
        lastSuccessAtMs: null,
      })
    );
    expect(r.status).toBe("stopped");
    expect(r.whyText).toContain("removed this model");
  });

  it("2. not eligible (admin_deactivated) -> off with plain reason", () => {
    const r = classifyModelStatus(
      statusInput({
        eligibilityRole: "excluded",
        eligibilityReason: "admin_deactivated",
      })
    );
    expect(r.status).toBe("off");
    expect(r.whyText).toContain("Not eligible");
    expect(r.whyText).toContain("master switch");
  });

  it("2b. no_mode_flags falls through to step 4 (switched off), not 'not eligible'", () => {
    const r = classifyModelStatus(
      statusInput({
        eligibilityRole: "excluded",
        eligibilityReason: "no_mode_flags",
        isActiveDaily: false,
        isActivePractice: false,
      })
    );
    expect(r.status).toBe("off");
    expect(r.whyText).toContain("Switched off by you");
  });

  it("3. text-only auditor -> off, still reviews", () => {
    const r = classifyModelStatus(
      statusInput({
        eligibilityRole: "auditor",
        eligibilityReason: "free_text_audit",
        isVision: false,
      })
    );
    expect(r.status).toBe("off");
    expect(r.whyText).toContain("Text-only");
    expect(r.whyText).toContain("reviews hints and audits");
  });

  it("4. both modes off -> off 'Switched off by you'", () => {
    const r = classifyModelStatus(
      statusInput({ isActiveDaily: false, isActivePractice: false })
    );
    expect(r.status).toBe("off");
    expect(r.whyText).toContain("Switched off by you");
  });

  it("4b. free+vision ignores off flags (always on) -> keeps evaluating", () => {
    const r = classifyModelStatus(
      statusInput({
        eligibilityReason: "free_vision",
        freeVisionAlwaysOn: true,
        isActiveDaily: false,
        isActivePractice: false,
      })
    );
    expect(r.status).toBe("playing");
  });

  it("5. own daily cap reached -> stopped with cap + restart note", () => {
    const r = classifyModelStatus(
      statusInput({
        spendTodayUsd: 0.5,
        dailyCapUsd: 0.5,
        lastActivityAtMs: NOW - 5 * 60_000,
      })
    );
    expect(r.status).toBe("stopped");
    expect(r.whyText).toContain("$0.50");
    expect(r.whyText).toContain("Restarts tomorrow");
    expect(r.whyText).toContain("UTC");
  });

  it("5b. own cap not reached -> falls through to playing", () => {
    const r = classifyModelStatus(
      statusInput({ spendTodayUsd: 0.4, dailyCapUsd: 0.5 })
    );
    expect(r.status).toBe("playing");
  });

  it("6a. fleet halted -> stopped, beats rate-limit and playing", () => {
    const r = classifyModelStatus(
      statusInput({ fleetHalted: true, rateLimited: true })
    );
    expect(r.status).toBe("stopped");
    expect(r.whyText).toContain("halted");
    expect(r.whyText).toContain("401");
  });

  it("6b. fleet cap reached -> stopped", () => {
    const r = classifyModelStatus(
      statusInput({ fleetSpendTodayUsd: 2, fleetCapUsd: 2 })
    );
    expect(r.status).toBe("stopped");
    expect(r.whyText).toContain("whole fleet");
  });

  it("7. recent rate-limit deferrals -> waiting", () => {
    const r = classifyModelStatus(statusInput({ rateLimited: true }));
    expect(r.status).toBe("waiting");
    expect(r.whyText).toContain("rate limit");
    expect(r.whyText).toContain("retries automatically");
  });

  it("8. success within 36h -> playing", () => {
    const r = classifyModelStatus(
      statusInput({ lastSuccessAtMs: NOW - 35 * H })
    );
    expect(r.status).toBe("playing");
  });

  it("8b. success older than 36h -> waiting", () => {
    const r = classifyModelStatus(
      statusInput({ lastSuccessAtMs: NOW - 37 * H })
    );
    expect(r.status).toBe("waiting");
    expect(r.whyText).toContain("36 hours");
  });

  it("9. never played -> waiting 'has not completed a play yet'", () => {
    const r = classifyModelStatus(statusInput({ lastSuccessAtMs: null }));
    expect(r.status).toBe("waiting");
    expect(r.whyText).toContain("has not completed a play yet");
  });
});

function recModel(
  over: Partial<RecommendationModelInput> = {}
): RecommendationModelInput {
  return {
    playerId: "p1",
    name: "Model One",
    modelId: "vendor/model-one",
    status: "playing",
    deadSlug: false,
    ownCapReached: false,
    ownCapUsd: null,
    capStoppedAtMs: null,
    rateLimitDays3d: 0,
    suggestible: false,
    dailyOn: true,
    practiceOn: true,
    ...over,
  };
}

function recInput(
  over: Partial<BuildRecommendationsInput> = {}
): BuildRecommendationsInput {
  return {
    nowMs: NOW,
    fleetSpendTodayUsd: 0.2,
    fleetCapUsd: 2,
    fleetHalted: false,
    practicePlaysLast7d: 5,
    alerts: [],
    models: [],
    ...over,
  };
}

describe("buildRecommendations", () => {
  it("empty input -> no items (page renders 'Nothing needs you')", () => {
    // practicePlaysLast7d > 0 suppresses the info item; spend 10% < 50% but
    // no suggestible models -> nothing.
    expect(buildRecommendations(recInput())).toEqual([]);
  });

  it("fleet halt -> critical first", () => {
    const items = buildRecommendations(recInput({ fleetHalted: true }));
    expect(items[0].severity).toBe("critical");
    expect(items[0].title).toContain("halted");
    expect(items[0].todo).toContain("key");
  });

  it("dead slug -> warning, never succeed again, remove todo", () => {
    const items = buildRecommendations(
      recInput({ models: [recModel({ deadSlug: true })] })
    );
    const it0 = items.find((i) => i.title.includes("never succeed"));
    expect(it0?.severity).toBe("warning");
    expect(it0?.todo).toContain("Remove");
  });

  it("own cap -> warning with stop time and headroom todo", () => {
    const items = buildRecommendations(
      recInput({
        models: [
          recModel({
            ownCapReached: true,
            ownCapUsd: 0.25,
            capStoppedAtMs: NOW - 3 * H,
          }),
        ],
      })
    );
    const it0 = items.find((i) => i.title.includes("own daily cap"));
    expect(it0?.severity).toBe("warning");
    expect(it0?.text).toContain("restarts tomorrow");
    expect(it0?.todo).toContain("headroom");
  });

  it("own cap + no fleet headroom -> different todo", () => {
    const items = buildRecommendations(
      recInput({
        fleetSpendTodayUsd: 2,
        fleetCapUsd: 2,
        models: [recModel({ ownCapReached: true, ownCapUsd: 0.25 })],
      })
    );
    const it0 = items.find((i) => i.title.includes("own daily cap"));
    expect(it0?.todo).toContain("fleet cap is the limit");
  });

  it("rate-limit streak >=3 days -> warning, nothing broken", () => {
    const items = buildRecommendations(
      recInput({ models: [recModel({ rateLimitDays3d: 3 })] })
    );
    const it0 = items.find((i) => i.title.includes("held back"));
    expect(it0?.severity).toBe("warning");
    expect(it0?.text).toContain("nothing is broken");
    expect(it0?.todo).toContain("swap");
  });

  it("rate-limit streak 2 days -> no item", () => {
    const items = buildRecommendations(
      recInput({ models: [recModel({ rateLimitDays3d: 2 })] })
    );
    expect(items.find((i) => i.title.includes("held back"))).toBeUndefined();
  });

  it("fleet spend >=80% cap -> warning", () => {
    const items = buildRecommendations(
      recInput({ fleetSpendTodayUsd: 1.6, fleetCapUsd: 2 })
    );
    const it0 = items.find((i) => i.title.includes("daily limit"));
    expect(it0?.severity).toBe("warning");
    expect(it0?.text).toContain("80%");
  });

  it("spend <50% cap + suggestible model off -> info naming up to 3 models", () => {
    const models = [
      recModel({ playerId: "a", name: "Alpha", suggestible: true, dailyOn: false, practiceOn: true }),
      recModel({ playerId: "b", name: "Beta", suggestible: true, dailyOn: true, practiceOn: false }),
      recModel({ playerId: "c", name: "Gamma", suggestible: true, dailyOn: false, practiceOn: false }),
      recModel({ playerId: "d", name: "Delta", suggestible: true, dailyOn: false, practiceOn: false }),
      recModel({ playerId: "e", name: "Epsilon", suggestible: false, dailyOn: false, practiceOn: false }),
    ];
    const items = buildRecommendations(
      recInput({ fleetSpendTodayUsd: 0.5, fleetCapUsd: 2, models })
    );
    const it0 = items.find((i) => i.title.includes("Money is not"));
    expect(it0?.severity).toBe("info");
    expect(it0?.todo).toContain("Alpha");
    expect(it0?.todo).toContain("Beta");
    expect(it0?.todo).toContain("Delta"); // alphabetical top-3
    expect(it0?.todo).not.toContain("Gamma"); // 4th, cut off
    expect(it0?.todo).not.toContain("Epsilon"); // not suggestible
  });

  it("zero practice plays in 7d -> informational item", () => {
    const items = buildRecommendations(recInput({ practicePlaysLast7d: 0 }));
    const it0 = items.find((i) => i.title.includes("Practice plays"));
    expect(it0?.severity).toBe("info");
    expect(it0?.text).toContain("no scheduler");
  });

  it("stored alerts -> items with alertId + plain kind text", () => {
    const items = buildRecommendations(
      recInput({
        alerts: [
          {
            id: "alert-1",
            kind: "auth_fleet",
            severity: "critical",
            message: "OpenRouter key rejected (HTTP 401) by 3 models; Daily run halted",
            occurrences: 2,
          },
        ],
      })
    );
    const it0 = items.find((i) => i.alertId === "alert-1");
    expect(it0?.severity).toBe("critical");
    expect(it0?.title).toContain("Key rejected");
    // live-data items have no alertId
    expect(
      items.filter((i) => i.alertId === undefined).every((i) => !i.title.includes("Key rejected") || i.severity === "critical")
    ).toBe(true);
  });

  it("ordering: critical before warning before info", () => {
    const items = buildRecommendations(
      recInput({
        fleetHalted: true,
        fleetSpendTodayUsd: 1.7,
        fleetCapUsd: 2,
        practicePlaysLast7d: 0,
        alerts: [
          { id: "a1", kind: "budget", severity: "warning", message: "cap reached", occurrences: 1 },
        ],
      })
    );
    const ranks = items.map((i) => i.severity);
    expect(ranks[0]).toBe("critical");
    expect(ranks.indexOf("info")).toBeGreaterThan(ranks.lastIndexOf("warning"));
  });
});

describe("classifyEventAudit", () => {
  it("plurality true / false, ties -> unsure", () => {
    expect(classifyEventAudit(3, 1, 0)).toBe("true");
    expect(classifyEventAudit(1, 3, 0)).toBe("false");
    expect(classifyEventAudit(2, 2, 0)).toBe("unsure");
    expect(classifyEventAudit(1, 1, 1)).toBe("unsure");
    expect(classifyEventAudit(0, 0, 0)).toBe("unsure");
    expect(classifyEventAudit(2, 0, 2)).toBe("unsure");
  });
});

describe("classifyProblem", () => {
  it("maps error text to the 5 plain classes", () => {
    expect(classifyProblem("OpenRouter request failed: 429")).toBe("rate_limit");
    expect(classifyProblem("RATE_LIMIT_DEFERRED retry_after_ms=5000")).toBe("rate_limit");
    expect(classifyProblem("OpenRouter request failed: 404")).toBe("not_found");
    expect(classifyProblem("OpenRouter request failed: 401")).toBe("unauthorized");
    expect(classifyProblem("OpenRouter request failed: 403")).toBe("unauthorized");
    expect(classifyProblem("fetch failed: ETIMEDOUT")).toBe("timeout");
    expect(classifyProblem("HARD_KILL: worker exceeded 150000ms")).toBe("timeout");
    expect(classifyProblem("Failed to parse AI guess")).toBe("other");
    expect(classifyProblem(null)).toBe("other");
  });
});

describe("describeRun", () => {
  const base = {
    status: "ok" as const,
    halt_reason: null,
    plays_ok: 6,
    plays_attempted: 6,
    plays_failed: 0,
    failed_rate_limit: 0,
  };
  it("ok with refusals", () => {
    expect(describeRun({ ...base, failed_rate_limit: 6 })).toContain(
      "6 calls were refused by the provider (rate limit)"
    );
  });
  it("halted auth_fleet", () => {
    expect(
      describeRun({ ...base, status: "halted", halt_reason: "auth_fleet" })
    ).toContain("key was rejected (401)");
  });
  it("halted budget", () => {
    expect(
      describeRun({ ...base, status: "halted", halt_reason: "budget" })
    ).toContain("spending limit");
  });
  it("partial", () => {
    expect(
      describeRun({ ...base, status: "partial", plays_failed: 2 })
    ).toContain("2 of 6 plays failed");
  });
});

describe("sort comparator", () => {
  type Row = { id: string; sort: Record<string, string | number | null> };
  const rows: Row[] = [
    { id: "b", sort: { n: 10, s: "b", d: "2026-01-02" } },
    { id: "a", sort: { n: 2, s: "a", d: "2026-01-03" } },
    { id: "c", sort: { n: null, s: null, d: null } },
    { id: "d", sort: { n: 1, s: "10", d: "2026-01-01" } },
  ];

  it("numbers sort numerically, not as strings (2 < 10)", () => {
    const asc = sortRows(rows, "n", "asc", "number").map((r) => r.id);
    expect(asc).toEqual(["d", "a", "b", "c"]); // null last
    const desc = sortRows(rows, "n", "desc", "number").map((r) => r.id);
    expect(desc).toEqual(["b", "a", "d", "c"]); // null STILL last
  });

  it("text sorts lexically ('10' < 'a' < 'b'), null last", () => {
    const asc = sortRows(rows, "s", "asc", "text").map((r) => r.id);
    expect(asc).toEqual(["d", "a", "b", "c"]); // "10" < "a" < "b", null last
  });

  it("dates sort chronologically", () => {
    const asc = sortRows(rows, "d", "asc", "date").map((r) => r.id);
    expect(asc).toEqual(["d", "b", "a", "c"]);
  });

  it("compareSortValues: number vs string never equal-mixes", () => {
    expect(compareSortValues(2, 10, "number")).toBeLessThan(0);
    expect(compareSortValues("2026-01-01", "2026-01-02", "date")).toBeLessThan(0);
    expect(compareSortValues("a", "B", "text")).toBeLessThan(0);
  });
});

describe("isFreeVisionAlwaysOn derivation", () => {
  const catalog = (over: Partial<CatalogModel>): CatalogModel => ({
    id: "vendor/model",
    isFree: true,
    isVision: true,
    contextLength: null,
    maxCompletion: null,
    promptPrice: 0,
    completionPrice: 0,
    ...over,
  });
  const player = (over: Partial<FleetPlayer>): FleetPlayer => ({
    id: "p1",
    model_id: "vendor/model",
    is_active: true,
    is_active_daily: false,
    is_active_practice: false,
    deleted_at: null,
    ...over,
  });

  it("true only for the free_vision eligibility reason", () => {
    expect(isFreeVisionAlwaysOn("free_vision")).toBe(true);
    for (const r of [
      "paid_vision",
      "free_text_audit",
      "paid_text_audit",
      "admin_deactivated",
      "no_mode_flags",
      "dead_slug",
      "budget",
      "deleted",
      "text_only_inactive_paid",
      "",
    ]) {
      expect(isFreeVisionAlwaysOn(r)).toBe(false);
    }
  });

  it("classifyPlayer yields free_vision (both modes) for free+vision regardless of flags", () => {
    const v = classifyPlayer(
      player({ is_active_daily: false, is_active_practice: false }),
      catalog({}),
      { action: "proceed" }
    );
    expect(v.reason).toBe("free_vision");
    expect(v.modes).toEqual(["daily", "practice"]);
    expect(isFreeVisionAlwaysOn(v.reason)).toBe(true);
  });

  it("paid vision with flags off is NOT always-on", () => {
    const v = classifyPlayer(
      player({ is_active_daily: false, is_active_practice: false }),
      catalog({ isFree: false, promptPrice: 1e-5, completionPrice: 1e-5 }),
      { action: "proceed" }
    );
    expect(v.reason).not.toBe("free_vision");
    expect(isFreeVisionAlwaysOn(v.reason)).toBe(false);
  });

  it("free text-only model is an auditor, NOT always-on", () => {
    const v = classifyPlayer(
      player({}),
      catalog({ isVision: false }),
      { action: "proceed" }
    );
    expect(v.reason).toBe("free_text_audit");
    expect(isFreeVisionAlwaysOn(v.reason)).toBe(false);
  });
});
