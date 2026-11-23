import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "./config";

/**
 * HONESTY GUARD — the home-page AI-content notice + "How we work" modal
 * must not claim human review.
 *
 * Rule: V1-BUILD-AIDISCLAIMER-1123-843 (modelled on
 * src/i18n/landing-honesty.guard.test.ts / COPY-FIX-HONESTCLAIMS-1112-107)
 *
 * Audit EDQ-PLAN-TRUTHLOOP-1111-103 proved no human review step exists.
 * The aiNotice copy must therefore never claim that content is "checked by
 * humans", "verified", or otherwise human-reviewed. Automated cross-checks
 * are allowed and described as still rolling out.
 *
 * This test FAILS if:
 *   - any locale's aiNotice section matches FALSE_CLAIM_RE, or
 *   - any of the seven aiNotice keys is missing in any locale, or
 *   - a non-en locale value is identical to the en value (untranslated).
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const FALSE_CLAIM_RE =
  /checked by humans|human check|verified before it reaches you|verified by humans|human review/i;

const KEYS = ["short", "link", "title", "body1", "body2", "body3", "close"] as const;

function loadAiNotice(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(PROJECT_ROOT, "src/i18n", `${locale}.json`),
    "utf-8"
  );
  return JSON.parse(raw).aiNotice;
}

describe("aiNotice honesty guard (V1-BUILD-AIDISCLAIMER-1123-843)", () => {
  const enAiNotice = loadAiNotice("en");

  it("no locale aiNotice section has human-review claims", () => {
    for (const locale of locales) {
      const aiNotice = loadAiNotice(locale);
      expect(
        FALSE_CLAIM_RE.test(JSON.stringify(aiNotice)),
        `${locale}.json aiNotice still claims human review/verification`
      ).toBe(false);
    }
  });

  it("all seven aiNotice keys exist in every locale", () => {
    for (const locale of locales) {
      const aiNotice = loadAiNotice(locale);
      for (const key of KEYS) {
        expect(
          typeof aiNotice[key] === "string" && aiNotice[key].length > 0,
          `${locale}.json aiNotice.${key} is missing or empty`
        ).toBe(true);
      }
    }
  });

  it("non-en locale values differ from en values", () => {
    for (const locale of locales) {
      if (locale === "en") continue;
      const aiNotice = loadAiNotice(locale);
      for (const key of KEYS) {
        expect(
          aiNotice[key] !== enAiNotice[key],
          `${locale}.json aiNotice.${key} is identical to en.json`
        ).toBe(true);
      }
    }
  });
});
