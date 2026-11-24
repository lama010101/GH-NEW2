import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PLACEMENT GUARD — the AI-content notice must reach the guest path, not only
 * /home. Guest-first Play Now goes landing -> /practice/{gameId} and never
 * passes /home, so <AiContentNotice /> must also render on:
 *
 *   - the public landing page (/prototype/landing),
 *   - the practice results state (/practice/[gameId], SESSION_COMPLETE),
 *   - the daily results page (/daily/game/[gameId]/results), and
 *   - the journey stage result surface — which lives inside
 *     /practice/[gameId] (SessionComplete journeyResult branch; /journey is
 *     the stage list and /journey/[stageId] is a redirect), so the practice
 *     entry below covers it.
 *
 * Rule: UX-BUILD-V1CLOSE-1124-868 item A (source-text assertion, same style
 * as src/i18n/landing-honesty.guard.test.ts).
 *
 * This test FAILS if any listed page source does not import AiContentNotice
 * or does not render <AiContentNotice />.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const PAGES = [
  "src/app/prototype/landing/page.tsx",
  // Practice results state AND journey stage result surface (single owner).
  "src/app/practice/[gameId]/page.tsx",
  "src/app/daily/game/[gameId]/results/page.tsx",
] as const;

describe("aiNotice placement guard (UX-BUILD-V1CLOSE-1124-868 item A)", () => {
  for (const page of PAGES) {
    it(`${page} imports AiContentNotice`, () => {
      const src = readFileSync(resolve(PROJECT_ROOT, page), "utf-8");
      expect(
        /import\s*{\s*AiContentNotice\s*}\s*from\s*["']@\/components\/AiContentNotice["']/.test(src),
        `${page} does not import AiContentNotice`
      ).toBe(true);
    });

    it(`${page} renders <AiContentNotice />`, () => {
      const src = readFileSync(resolve(PROJECT_ROOT, page), "utf-8");
      expect(
        src.includes("<AiContentNotice"),
        `${page} does not render <AiContentNotice />`
      ).toBe(true);
    });
  }
});
