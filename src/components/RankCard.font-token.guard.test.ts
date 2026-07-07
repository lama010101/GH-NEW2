import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GUARD TEST — prevents accidental revert of the global-font-token rank title.
 *
 * The rank card title (`.rankTitle` in RankCard.module.css) was aligned to the
 * global CSS typography scale (FIX-RANKCARD-TITLE-GLOBAL-FONT-001):
 *   font-size: var(--font-xl)   (= 20px, defined in src/app/globals.css)
 *
 * The home page title (`.cardTitleLeft`, `.tagline` in home.module.css) also
 * uses `var(--font-xl)`. Before this fix, `.rankTitle` used a hardcoded
 * `font-size: 17px`, making the rank title smaller than the home page title
 * and bypassing the global design tokens.
 *
 * This test asserts `.rankTitle` uses `var(--font-xl)` and does NOT use the
 * old hardcoded `17px`, so any revert fails `npm test` immediately.
 *
 * Task ref: FIX-RANKCARD-TITLE-GLOBAL-FONT-001
 */

const CSS_PATH = resolve(__dirname, "RankCard.module.css");
const cssSrc = readFileSync(CSS_PATH, "utf-8");

describe("RankCard — rank title uses global font token (FIX-RANKCARD-TITLE-GLOBAL-FONT-001)", () => {
  it(".rankTitle uses var(--font-xl) (global typography scale, = 20px)", () => {
    // Locate the .rankTitle rule and check it contains the global token.
    const rankTitleMatch = cssSrc.match(/\.rankTitle\s*\{[^}]*\}/);
    expect(rankTitleMatch).not.toBeNull();
    const rankTitleRule = rankTitleMatch![0];
    expect(rankTitleRule).toContain("font-size: var(--font-xl)");
  });

  it(".rankTitle does NOT use the old hardcoded 17px", () => {
    const rankTitleMatch = cssSrc.match(/\.rankTitle\s*\{[^}]*\}/);
    expect(rankTitleMatch).not.toBeNull();
    const rankTitleRule = rankTitleMatch![0];
    expect(rankTitleRule).not.toContain("font-size: 17px");
    expect(rankTitleRule).not.toMatch(/font-size:\s*17px/);
  });

  it(".rankTitle preserves color var(--gh-text-primary) and font-weight 800", () => {
    const rankTitleMatch = cssSrc.match(/\.rankTitle\s*\{[^}]*\}/);
    expect(rankTitleMatch).not.toBeNull();
    const rankTitleRule = rankTitleMatch![0];
    expect(rankTitleRule).toContain("color: var(--gh-text-primary)");
    expect(rankTitleRule).toContain("font-weight: 800");
  });
});
