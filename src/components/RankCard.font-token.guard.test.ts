import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GUARD TEST — prevents accidental revert of global-font-token text in RankCard.
 *
 * ALL text elements in RankCard.module.css were aligned to the global CSS
 * typography scale (FIX-RANKCARD-TITLE-GLOBAL-FONT-001):
 *   .rankTitle    → var(--font-xl)   (= 20px — matches home page title)
 *   .rankXp       → var(--font-sm)   (= 14px — secondary labels, matches TopBar XP)
 *   .rankMedTier  → var(--font-2xs)  (= 12px — badges/counters, global minimum)
 *   .rankXp i     → var(--font-2xs)  (= 12px — "XP" unit suffix)
 *   .rankNextLine → var(--font-2xs)  (= 12px — "Next … XP to …" label)
 *
 * Before this fix, 4 of 5 font-sizes were hardcoded with raw px values, and
 * 3 of them (10px, 9px, 11px) were BELOW the global 12px minimum defined in
 * src/app/globals.css (--font-2xs: "minimum size, never below").
 *
 * This test asserts every text rule uses a var(--font-*) token and does NOT
 * contain any hardcoded px font-size, so any revert fails `npm test`.
 *
 * Task ref: FIX-RANKCARD-TITLE-GLOBAL-FONT-001
 */

const CSS_PATH = resolve(__dirname, "RankCard.module.css");
const cssSrc = readFileSync(CSS_PATH, "utf-8");

/** Extract a single CSS rule body by selector. */
function ruleBody(src: string, selector: string): string | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*\\}"
  );
  const m = src.match(re);
  return m ? m[0] : null;
}

describe("RankCard — all text uses global font tokens (FIX-RANKCARD-TITLE-GLOBAL-FONT-001)", () => {
  describe(".rankTitle (rank title — matches home page title size)", () => {
    it("uses var(--font-xl) (= 20px)", () => {
      const r = ruleBody(cssSrc, ".rankTitle");
      expect(r).not.toBeNull();
      expect(r!).toContain("font-size: var(--font-xl)");
    });

    it("does NOT use hardcoded px", () => {
      const r = ruleBody(cssSrc, ".rankTitle");
      expect(r).not.toBeNull();
      expect(r!).not.toMatch(/font-size:\s*\d+px/);
    });

    it("preserves color var(--gh-text-primary) and font-weight 800", () => {
      const r = ruleBody(cssSrc, ".rankTitle");
      expect(r).not.toBeNull();
      expect(r!).toContain("color: var(--gh-text-primary)");
      expect(r!).toContain("font-weight: 800");
    });
  });

  describe(".rankXp (XP count number — secondary label)", () => {
    it("uses var(--font-sm) (= 14px, matches TopBar XP text)", () => {
      const r = ruleBody(cssSrc, ".rankXp");
      expect(r).not.toBeNull();
      expect(r!).toContain("font-size: var(--font-sm)");
    });

    it("does NOT use hardcoded px", () => {
      const r = ruleBody(cssSrc, ".rankXp");
      expect(r).not.toBeNull();
      expect(r!).not.toMatch(/font-size:\s*\d+px/);
    });
  });

  describe(".rankXp i (XP unit suffix)", () => {
    it("uses var(--font-2xs) (= 12px, global minimum)", () => {
      const r = ruleBody(cssSrc, ".rankXp i");
      expect(r).not.toBeNull();
      expect(r!).toContain("font-size: var(--font-2xs)");
    });

    it("does NOT use hardcoded px", () => {
      const r = ruleBody(cssSrc, ".rankXp i");
      expect(r).not.toBeNull();
      expect(r!).not.toMatch(/font-size:\s*\d+px/);
    });
  });

  describe(".rankMedTier (tier badge T1–T10)", () => {
    it("uses var(--font-2xs) (= 12px, global minimum for badges)", () => {
      const r = ruleBody(cssSrc, ".rankMedTier");
      expect(r).not.toBeNull();
      expect(r!).toContain("font-size: var(--font-2xs)");
    });

    it("does NOT use hardcoded px", () => {
      const r = ruleBody(cssSrc, ".rankMedTier");
      expect(r).not.toBeNull();
      expect(r!).not.toMatch(/font-size:\s*\d+px/);
    });
  });

  describe(".rankNextLine (Next-rank label line)", () => {
    it("uses var(--font-2xs) (= 12px, global minimum)", () => {
      const r = ruleBody(cssSrc, ".rankNextLine");
      expect(r).not.toBeNull();
      expect(r!).toContain("font-size: var(--font-2xs)");
    });

    it("does NOT use hardcoded px", () => {
      const r = ruleBody(cssSrc, ".rankNextLine");
      expect(r).not.toBeNull();
      expect(r!).not.toMatch(/font-size:\s*\d+px/);
    });
  });

  describe("whole file — no hardcoded px font-sizes remain", () => {
    it("contains zero `font-size: NNpx` declarations anywhere", () => {
      expect(cssSrc).not.toMatch(/font-size:\s*\d+px/);
    });

    it("all font-size declarations use var(--font-*) tokens", () => {
      const fontSizes = cssSrc.match(/font-size:\s*[^;]+/g) ?? [];
      expect(fontSizes.length).toBeGreaterThanOrEqual(5);
      for (const fs of fontSizes) {
        expect(fs).toMatch(/var\(--font-/);
      }
    });
  });
});
