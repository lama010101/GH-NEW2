import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";

/**
 * RATCHET GUARD — no NEW hardcoded `font-size: NNpx` in any CSS file.
 *
 * Rule: ENFORCE-CSS-NO-HARDCODED-TOKENS-001 (.devin/rules/css-no-hardcoded-tokens.md)
 *
 * All UI typography must use the global CSS tokens defined in
 * src/app/globals.css (--font-2xs .. --font-4xl). Hardcoded pixel values
 * for font-size are FORBIDDEN in component CSS.
 *
 * This test uses a RATCHET pattern:
 *   - BASELINE below = per-file count of hardcoded font-size lines,
 *     snapshotted on 2026-07-07.
 *   - The test FAILS if any file's count INCREASES above its baseline
 *     (i.e. new hardcoded font-sizes were added).
 *   - The test FAILS if a NEW file (not in baseline) has hardcoded font-sizes.
 *   - When a file is migrated to tokens, its count DECREASES; update the
 *     baseline to the new lower number. The baseline can only go DOWN.
 *
 * Task ref: ENFORCE-CSS-NO-HARDCODED-TOKENS-001
 */

const PROJECT_ROOT = resolve(__dirname, "..", ".."); // project root
const SRC_DIR = resolve(PROJECT_ROOT, "src");
const GLOBALS_CSS = "src/app/globals.css"; // excluded — defines the tokens

/**
 * BASELINE — per-file count of lines matching /font-size:\s*\d+px/
 * Snapshotted 2026-07-07. Can only decrease (ratchet).
 */
const BASELINE: Record<string, number> = {
  "src/app/prototype/round-results/round-results.module.css": 45,
  "src/components/compete/SessionComplete.module.css": 37,
  "src/app/prototype/profile/profile.module.css": 33,
  "src/app/prototype/final-results/final-results.module.css": 0,
  "src/components/compete/RoundCompleteSection.module.css": 25,
  "src/components/compete/LobbySection.module.css": 20,
  "src/app/prototype/lobby-settings-images/lobby-settings-images.module.css": 16,
  "src/components/compete/WhenCard.module.css": 14,
  "src/app/prototype/home-list/home.module.css": 14,
  "src/app/profile/profile.module.css": 14,
  "src/app/prototype/home/home.module.css": 13,
  "src/app/prototype/rank-images/rank-images.module.css": 12,
  "src/components/compete/WhereCard.module.css": 10,
  "src/app/help/help.module.css": 10,
  "src/components/HintModal.module.css": 9,
  "src/app/prototype/home-icon-bg/home.module.css": 9,
  "src/app/prototype/home-grid/home.module.css": 9,
  "src/components/ExperienceAccuracy.module.css": 8,
  "src/components/home/CompetePanel.module.css": 7,
  "src/app/compete/[gameId]/page.module.css": 5,
  "src/components/compete/RoundActiveSection.module.css": 2,
  "src/components/compete/RatingControl.module.css": 4,
  "src/components/WelcomeModal.module.css": 2,
  "src/app/practice/[gameId]/page.module.css": 2,
  "src/app/account/account.module.css": 2,
  "src/components/practice/PracticeSettingsModal.module.css": 1,
  "src/components/layout/TopBar.module.css": 1,
  "src/components/layout/LanguageDropdown.module.css": 1,
  "src/components/FullscreenImageViewer.module.css": 1,
  "src/app/practice/page.module.css": 1,
  "src/app/leaderboard/leaderboard.module.css": 1,
};

const HARDCODED_FONT_SIZE_RE = /font-size:\s*\d+px/g;

/** Recursively collect all .css file paths under dir, relative to PROJECT_ROOT. */
function collectCssFiles(dir: string, acc: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectCssFiles(full, acc);
    } else if (name.endsWith(".css")) {
      acc.push(relative(PROJECT_ROOT, full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

/** Count hardcoded font-size occurrences in CSS content. */
function countHardcodedFontSizes(content: string): number {
  const matches = content.match(HARDCODED_FONT_SIZE_RE);
  return matches ? matches.length : 0;
}

describe("CSS no-hardcoded-font-sizes ratchet guard (ENFORCE-CSS-NO-HARDCODED-TOKENS-001)", () => {
  const allCssFiles = collectCssFiles(SRC_DIR).filter(
    (f) => f !== GLOBALS_CSS
  );

  it("no file has MORE hardcoded font-sizes than its baseline (ratchet)", () => {
    const regressions: string[] = [];
    for (const file of allCssFiles) {
      const baseline = BASELINE[file] ?? 0;
      if (baseline === 0) continue; // new files checked in next test
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      const current = countHardcodedFontSizes(content);
      if (current > baseline) {
        regressions.push(
          "  " + file + ": " + current + " > baseline " + baseline +
          " (+" + (current - baseline) + " new hardcoded font-size(s))"
        );
      }
    }
    expect(
      regressions,
      regressions.length
        ? "REGRESSION — new hardcoded font-size:NNpx values added.\n" +
          "Use var(--font-*) tokens from src/app/globals.css instead.\n" +
          regressions.join("\n")
        : ""
    ).toHaveLength(0);
  });

  it("no NEW file (absent from baseline) has hardcoded font-sizes", () => {
    const newViolations: string[] = [];
    for (const file of allCssFiles) {
      if (file in BASELINE) continue;
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      const current = countHardcodedFontSizes(content);
      if (current > 0) {
        newViolations.push("  " + file + ": " + current + " hardcoded font-size(s)");
      }
    }
    expect(
      newViolations,
      newViolations.length
        ? "New CSS files with hardcoded font-sizes (use var(--font-*) tokens instead):\n" +
          newViolations.join("\n")
        : ""
    ).toHaveLength(0);
  });

  it("total hardcoded font-size count <= baseline total (ratchet only goes down)", () => {
    let currentTotal = 0;
    for (const file of allCssFiles) {
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      currentTotal += countHardcodedFontSizes(content);
    }
    const baselineTotal = Object.values(BASELINE).reduce((a, b) => a + b, 0);
    expect(
      currentTotal,
      "Total hardcoded font-sizes: " + currentTotal + " > baseline " + baselineTotal +
      ". The ratchet can only go down — migrate to var(--font-*) tokens."
    ).toBeLessThanOrEqual(baselineTotal);
  });
});
