import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "./config";

/**
 * HONESTY GUARD — the public landing page must not claim human review.
 *
 * Rule: COPY-FIX-HONESTCLAIMS-1112-107
 *
 * Audit EDQ-PLAN-TRUTHLOOP-1111-103 proved no human review step exists.
 * The landing copy must therefore never claim that content is "checked by
 * humans", "verified", or otherwise human-reviewed. Automated cross-checks
 * are allowed and described as still rolling out.
 *
 * This test FAILS if:
 *   - en.json's landing section matches FALSE_CLAIM_RE, or
 *   - src/app/prototype/landing/page.tsx source matches FALSE_CLAIM_RE, or
 *   - any of the four honesty keys is missing in any locale, or
 *   - a non-en locale value is identical to the en value (untranslated).
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const FALSE_CLAIM_RE =
  /checked by humans|human check|verified before it reaches you|verified by humans|human review/i;

const KEYS = ["ai_sub", "pipe_4_label", "pipe_4_desc", "faq_a3"] as const;

function loadLanding(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(PROJECT_ROOT, "src/i18n", `${locale}.json`),
    "utf-8"
  );
  return JSON.parse(raw).landing;
}

describe("landing honesty guard (COPY-FIX-HONESTCLAIMS-1112-107)", () => {
  const enLanding = loadLanding("en");

  it("en.json landing section has no human-review claims", () => {
    expect(
      FALSE_CLAIM_RE.test(JSON.stringify(enLanding)),
      "en.json landing section still claims human review/verification"
    ).toBe(false);
  });

  it("prototype landing page source has no human-review claims", () => {
    const src = readFileSync(
      resolve(PROJECT_ROOT, "src/app/prototype/landing/page.tsx"),
      "utf-8"
    );
    expect(
      FALSE_CLAIM_RE.test(src),
      "src/app/prototype/landing/page.tsx still claims human review/verification"
    ).toBe(false);
  });

  it("all four honesty keys exist in every locale", () => {
    for (const locale of locales) {
      const landing = loadLanding(locale);
      for (const key of KEYS) {
        expect(
          typeof landing[key] === "string" && landing[key].length > 0,
          `${locale}.json landing.${key} is missing or empty`
        ).toBe(true);
      }
    }
  });

  it("non-en locale values differ from en values", () => {
    for (const locale of locales) {
      if (locale === "en") continue;
      const landing = loadLanding(locale);
      for (const key of KEYS) {
        expect(
          landing[key] !== enLanding[key],
          `${locale}.json landing.${key} is identical to en.json`
        ).toBe(true);
      }
    }
  });
});
