import { describe, it, expect } from "vitest";
import {
  AI_RATE_SETTING_KEYS,
  deriveFleetAvailability,
  deriveFleetTier,
} from "./fleetData";

// AIP-BUILD-FLEETFINAL-1103-060 (E5) — unit tests for the pure helpers only.
// No DB access (the fetch* functions are thin pool.query wrappers).

describe("deriveFleetAvailability", () => {
  const base = {
    deleted: false,
    hasCatalogRow: true,
    availabilityStatus: "available",
    isVision: true,
    isFree: false,
    isActive: true,
  };

  it("deleted wins over every other signal", () => {
    expect(
      deriveFleetAvailability({ ...base, deleted: true, hasCatalogRow: false })
    ).toEqual({ role: "excluded", reason: "deleted" });
  });

  it("no catalog row OR availability not_in_catalog => 'dead slug'", () => {
    expect(
      deriveFleetAvailability({
        ...base,
        hasCatalogRow: false,
        availabilityStatus: null,
      })
    ).toEqual({ role: "excluded", reason: "dead slug" });
    expect(
      deriveFleetAvailability({ ...base, availabilityStatus: "not_in_catalog" })
    ).toEqual({ role: "excluded", reason: "dead slug" });
  });

  it("text-only => audit 'text-only (auditor)', even paid + inactive", () => {
    expect(
      deriveFleetAvailability({ ...base, isVision: false, isActive: false })
    ).toEqual({ role: "audit", reason: "text-only (auditor)" });
    expect(
      deriveFleetAvailability({ ...base, isVision: null })
    ).toEqual({ role: "audit", reason: "text-only (auditor)" });
  });

  it("free + vision => play 'free+vision plays' regardless of is_active", () => {
    expect(
      deriveFleetAvailability({ ...base, isFree: true, isActive: false })
    ).toEqual({ role: "play", reason: "free+vision plays" });
  });

  it("paid + vision + active => play 'plays under budget'", () => {
    expect(deriveFleetAvailability(base)).toEqual({
      role: "play",
      reason: "plays under budget",
    });
  });

  it("paid + vision + inactive => excluded 'admin-deactivated'", () => {
    expect(
      deriveFleetAvailability({ ...base, isActive: false })
    ).toEqual({ role: "excluded", reason: "admin-deactivated" });
  });
});

describe("deriveFleetTier", () => {
  it("is_free => 'free'", () => {
    expect(
      deriveFleetTier({
        isFree: true,
        pricePromptUsd: 0,
        priceCompletionUsd: 0,
      })
    ).toBe("free");
  });

  it("paid with prompt+completion <= 1e-6 => 'cheap'", () => {
    expect(
      deriveFleetTier({
        isFree: false,
        pricePromptUsd: 0.5e-6,
        priceCompletionUsd: 0.5e-6,
      })
    ).toBe("cheap");
    expect(
      deriveFleetTier({
        isFree: false,
        pricePromptUsd: 0,
        priceCompletionUsd: 1e-6,
      })
    ).toBe("cheap");
  });

  it("paid above 1e-6, or paid with unknown price => 'premium'", () => {
    expect(
      deriveFleetTier({
        isFree: false,
        pricePromptUsd: 2e-6,
        priceCompletionUsd: 1e-6,
      })
    ).toBe("premium");
    expect(
      deriveFleetTier({
        isFree: false,
        pricePromptUsd: null,
        priceCompletionUsd: null,
      })
    ).toBe("premium");
  });

  it("no catalog row (is_free null) => null", () => {
    expect(
      deriveFleetTier({
        isFree: null,
        pricePromptUsd: null,
        priceCompletionUsd: null,
      })
    ).toBeNull();
  });
});

describe("AI_RATE_SETTING_KEYS", () => {
  it("covers the 14 D3 ai_* keys incl. ai_rpm_overrides", () => {
    expect(AI_RATE_SETTING_KEYS).toHaveLength(14);
    expect(AI_RATE_SETTING_KEYS).toContain("ai_rpm_free");
    expect(AI_RATE_SETTING_KEYS).toContain("ai_rpm_overrides");
    expect(AI_RATE_SETTING_KEYS).toContain("ai_benchmark_subset_size");
  });
});
