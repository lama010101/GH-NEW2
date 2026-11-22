import { describe, it, expect } from "vitest";
import {
  IMAGE_GEN_REGISTRY,
  getImageGenModel,
  type ImageGenRegistryEntry,
} from "./registry";
import {
  GENERATOR_POSITIVE_TEMPLATE,
  GENERATOR_NEGATIVE_TEMPLATE,
  buildGeneratorPrompt,
  buildGeneratorNegativePrompt,
  formatPromptYear,
} from "./promptTemplate";

// EDQ-BUILD-ADMINGEN-1122-815 — registry + prompt template contract tests.
// AIR existence was verified live against
// https://runware.ai/docs/models/index.json on 2026-11-22 (all "live").

const EXPECTED: Record<
  string,
  { airId: string | null; price: number | null; enabled: boolean }
> = {
  "bfl-flux-1-kontext-pro": { airId: "bfl:3@1", price: 0.04, enabled: true },
  "bfl-flux-1-1-pro": { airId: "bfl:2@1", price: 0.04, enabled: true },
  "bfl-flux-1-1-pro-ultra": { airId: "bfl:2@2", price: 0.06, enabled: true },
  "bfl-flux-1-kontext-max": { airId: "bfl:4@1", price: 0.08, enabled: true },
  "bfl-flux-1-schnell": { airId: "runware:100@1", price: 0.0006, enabled: true },
  "reve-image": { airId: null, price: 0.25, enabled: false },
};

describe("IMAGE_GEN_REGISTRY", () => {
  it("contains exactly the 6 seeded entries", () => {
    expect(IMAGE_GEN_REGISTRY).toHaveLength(6);
    expect(IMAGE_GEN_REGISTRY.map((m) => m.id).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    );
  });

  it.each(IMAGE_GEN_REGISTRY.map((m) => [m.id, m] as const))(
    "%s matches the seeded airId / price / enabled contract",
    (id, entry: ImageGenRegistryEntry) => {
      const exp = EXPECTED[id];
      expect(entry.airId).toBe(exp.airId);
      expect(entry.price_usd_est).toBe(exp.price);
      expect(entry.enabled).toBe(exp.enabled);
      expect(entry.provider).toBe("runware");
      expect(entry.requiredKeyName).toBe("RUNWARE_API_KEY");
    }
  );

  it("enabled entries all have an airId; disabled reve has none", () => {
    for (const m of IMAGE_GEN_REGISTRY) {
      if (m.enabled) expect(m.airId).not.toBeNull();
    }
    expect(getImageGenModel("reve-image")!.airId).toBeNull();
    expect(getImageGenModel("reve-image")!.notes).toBe("AIR pending from owner");
  });

  it("defaultSize is always a member of nativeSizes", () => {
    for (const m of IMAGE_GEN_REGISTRY) {
      const hit = m.nativeSizes.some(
        (s) => s.width === m.defaultSize.width && s.height === m.defaultSize.height
      );
      expect(hit, `${m.id} defaultSize not in nativeSizes`).toBe(true);
    }
  });

  it("kontext-max carries the fallback note", () => {
    expect(getImageGenModel("bfl-flux-1-kontext-max")!.notes).toBe("fallback");
  });

  it("nativeSizes honor per-family constraints", () => {
    const proIds = ["bfl-flux-1-1-pro", "bfl-flux-1-1-pro-ultra"];
    for (const id of proIds) {
      for (const s of getImageGenModel(id)!.nativeSizes) {
        expect(s.width % 32, `${id} w=${s.width}`).toBe(0);
        expect(s.height % 32, `${id} h=${s.height}`).toBe(0);
        expect(s.width).toBeGreaterThanOrEqual(256);
        expect(s.width).toBeLessThanOrEqual(1440);
        expect(s.height).toBeGreaterThanOrEqual(256);
        expect(s.height).toBeLessThanOrEqual(1440);
      }
    }
    for (const s of getImageGenModel("bfl-flux-1-schnell")!.nativeSizes) {
      expect(s.width % 64).toBe(0);
      expect(s.height % 64).toBe(0);
      expect(s.width).toBeGreaterThanOrEqual(128);
      expect(s.width).toBeLessThanOrEqual(2048);
      expect(s.height).toBeGreaterThanOrEqual(128);
      expect(s.height).toBeLessThanOrEqual(2048);
    }
    for (const id of ["bfl-flux-1-kontext-pro", "bfl-flux-1-kontext-max"]) {
      for (const s of getImageGenModel(id)!.nativeSizes) {
        expect(Number.isInteger(s.width)).toBe(true);
        expect(Number.isInteger(s.height)).toBe(true);
        expect(s.width).toBeGreaterThan(0);
        expect(s.height).toBeGreaterThan(0);
      }
    }
  });

  it("getImageGenModel returns undefined for unknown ids", () => {
    expect(getImageGenModel("nope")).toBeUndefined();
    expect(getImageGenModel("")).toBeUndefined();
  });
});

describe("promptTemplate", () => {
  it("positive template contains the spec wording and placeholders", () => {
    expect(GENERATOR_POSITIVE_TEMPLATE).toContain("{title}");
    expect(GENERATOR_POSITIVE_TEMPLATE).toContain("{year}");
    expect(GENERATOR_POSITIVE_TEMPLATE).toContain("{location}");
    expect(GENERATOR_POSITIVE_TEMPLATE).toContain("Documentary photograph");
    expect(GENERATOR_POSITIVE_TEMPLATE).toContain("period-true");
  });

  it("negative template matches the spec list verbatim", () => {
    expect(GENERATOR_NEGATIVE_TEMPLATE).toBe(
      "text, watermark, logo, signature, modern objects, anachronistic clothing or vehicles, plastic skin, oversaturated colors, cartoon, painting, illustration, collage, multiple scenes, frame, border"
    );
  });

  it("buildGeneratorPrompt substitutes title/year/location", () => {
    const p = buildGeneratorPrompt({
      title: "Moon landing",
      year: 1969,
      location: "Sea of Tranquility",
    });
    expect(p).toContain("Moon landing");
    expect(p).toContain("1969");
    expect(p).toContain("Sea of Tranquility");
    expect(p).not.toContain("{title}");
    expect(p).not.toContain("{year}");
    expect(p).not.toContain("{location}");
  });

  it("formatPromptYear renders BCE for negative years and signed ints pass through", () => {
    expect(formatPromptYear(-44)).toBe("44 BCE");
    expect(formatPromptYear(-1)).toBe("1 BCE");
    expect(formatPromptYear(0)).toBe("0");
    expect(formatPromptYear(1969)).toBe("1969");
    expect(formatPromptYear(null)).toBe("an unknown year");
    expect(formatPromptYear(undefined)).toBe("an unknown year");
  });

  it("missing fields degrade predictably (year fallback, others keep placeholders)", () => {
    const p = buildGeneratorPrompt({ title: "X" });
    expect(p).toContain("an unknown year");
    expect(p).toContain("{location}");
    expect(p).toContain("X");
  });

  it("buildGeneratorNegativePrompt returns the fixed template", () => {
    expect(buildGeneratorNegativePrompt()).toBe(GENERATOR_NEGATIVE_TEMPLATE);
  });
});
