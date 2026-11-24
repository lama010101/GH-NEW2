import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "./config";

/**
 * HONESTY GUARD — the public /how-we-work page copy must not claim human
 * review or event accuracy.
 *
 * Rule: UX-BUILD-V1CLOSE-1124-868 item B (modelled on
 * src/i18n/ai-notice.guard.test.ts / landing-honesty.guard.test.ts)
 *
 * Audit EDQ-PLAN-TRUTHLOOP-1111-103 proved no human review step exists, and
 * the page rules forbid claims that events are verified/validated/checked/
 * reviewed/accurate/true/reliable. Permitted verbs about events: audit,
 * cross-check, log, flag, improving.
 *
 * This test FAILS if:
 *   - any locale is missing a howWeWork key (11-locale key parity), or
 *   - en.json or fr.json howWeWork matches FALSE_CLAIM_RE, or
 *   - en.json or fr.json howWeWork matches FORBIDDEN_EVENT_CLAIM_RE.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const FALSE_CLAIM_RE =
  /checked by humans|human check|verified before it reaches you|verified by humans|human review/i;

const FORBIDDEN_EVENT_CLAIM_RE =
  /\b(verified|validated|checked|reviewed|accurate|true|reliable)\b/i;

const KEYS = [
  "meta_title",
  "meta_desc",
  "title",
  "intro",
  "ai_note",
  "improve_title",
  "improve_audit",
  "improve_ai",
  "improve_reports",
  "translation_note",
  "early_version",
  "stats_title",
  "stat_events",
  "stat_french",
  "stat_ai_players",
  "stat_daily",
  "learn_more",
] as const;

function loadHowWeWork(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(PROJECT_ROOT, "src/i18n", `${locale}.json`),
    "utf-8"
  );
  return JSON.parse(raw).howWeWork;
}

describe("howWeWork honesty guard (UX-BUILD-V1CLOSE-1124-868 item B)", () => {
  it("all howWeWork keys exist in every locale (key parity)", () => {
    for (const locale of locales) {
      const howWeWork = loadHowWeWork(locale);
      for (const key of KEYS) {
        expect(
          typeof howWeWork[key] === "string" && howWeWork[key].length > 0,
          `${locale}.json howWeWork.${key} is missing or empty`
        ).toBe(true);
      }
    }
  });

  it("en + fr howWeWork have no human-review claims", () => {
    for (const locale of ["en", "fr"] as const) {
      const howWeWork = loadHowWeWork(locale);
      expect(
        FALSE_CLAIM_RE.test(JSON.stringify(howWeWork)),
        `${locale}.json howWeWork still claims human review/verification`
      ).toBe(false);
    }
  });

  it("en + fr howWeWork make no forbidden event claims", () => {
    for (const locale of ["en", "fr"] as const) {
      const howWeWork = loadHowWeWork(locale);
      expect(
        FORBIDDEN_EVENT_CLAIM_RE.test(JSON.stringify(howWeWork)),
        `${locale}.json howWeWork claims events are verified/validated/checked/reviewed/accurate/true/reliable`
      ).toBe(false);
    }
  });
});
