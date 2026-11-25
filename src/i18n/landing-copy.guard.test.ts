import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "./config";

/**
 * LANDING COPY GUARD — UX-FIX-LANDINGPOLISH-1125-892.
 *
 * Asserts the landing page copy corrections landed and stay landed:
 *   1. hero ghost "Sign in / Sign up" link removed; nav_signin remains
 *      exactly twice (topbar button + mobile menu link);
 *   2. en/fr pipe_3_label + ai_eyebrow carry no "paint/peint" wording;
 *   3. en/fr final_eyebrow carries no "ready/prêt" wording;
 *   4. landing.lb_sample_note exists and is non-empty in all 11 locales
 *      and page.tsx references it;
 *   5. no locale's landing.how_title keeps the stale "three actions"
 *      wording — en must not match /three actions/i and each of the
 *      other 9 locales must differ from its origin/main f3dc27a0 value.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

function loadLanding(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(PROJECT_ROOT, "src/i18n", `${locale}.json`),
    "utf-8"
  );
  return JSON.parse(raw).landing;
}

const pageSrc = readFileSync(
  resolve(PROJECT_ROOT, "src/app/prototype/landing/page.tsx"),
  "utf-8"
);

// Stale how_title values at origin/main f3dc27a0 (before this change).
const STALE_HOW_TITLE_AT_F3DC27A0: Record<string, string> = {
  es: "Una escena. Tres acciones.",
  de: "Eine Szene. Drei Aktionen.",
  it: "Una scena. Tre azioni.",
  pt: "Uma cena. Três ações.",
  nl: "Eén scène. Drie acties.",
  ru: "Одна сцена. Три действия.",
  ja: "1つの場面、3つのアクション。",
  zh: "一个场景，三个动作。",
  ar: "مشهد واحد. ثلاث خطوات.",
};

describe("landing copy guard (UX-FIX-LANDINGPOLISH-1125-892)", () => {
  it("hero section has no signin_signup usage; nav_signin appears exactly twice", () => {
    const heroStart = pageSrc.indexOf("── HERO ──");
    const heroEnd = pageSrc.indexOf("── HOW TO PLAY ──");
    expect(heroStart).toBeGreaterThan(-1);
    expect(heroEnd).toBeGreaterThan(heroStart);
    const heroSlice = pageSrc.slice(heroStart, heroEnd);
    expect(heroSlice).not.toContain("signin_signup");
    expect((pageSrc.match(/nav_signin/g) ?? []).length).toBe(2);
  });

  it("en + fr pipe_3_label and ai_eyebrow contain no paint/peint wording", () => {
    for (const locale of ["en", "fr"] as const) {
      const landing = loadLanding(locale);
      expect(
        /paint|peint/i.test(landing.pipe_3_label),
        `${locale}.json landing.pipe_3_label still says paint/peint`
      ).toBe(false);
      expect(
        /paint|peint/i.test(landing.ai_eyebrow),
        `${locale}.json landing.ai_eyebrow still says paint/peint`
      ).toBe(false);
    }
  });

  it("en + fr final_eyebrow contains no ready/prêt wording", () => {
    for (const locale of ["en", "fr"] as const) {
      const landing = loadLanding(locale);
      expect(
        /ready|prêt/i.test(landing.final_eyebrow),
        `${locale}.json landing.final_eyebrow still says ready/prêt`
      ).toBe(false);
    }
  });

  it("landing.lb_sample_note exists and is non-empty in all 11 locales; page.tsx references it", () => {
    for (const locale of locales) {
      const landing = loadLanding(locale);
      expect(
        typeof landing.lb_sample_note === "string" &&
          landing.lb_sample_note.length > 0,
        `${locale}.json landing.lb_sample_note is missing or empty`
      ).toBe(true);
    }
    expect(pageSrc).toContain("lb_sample_note");
  });

  it("no locale how_title keeps the stale three-actions wording", () => {
    const enLanding = loadLanding("en");
    expect(
      /three actions/i.test(enLanding.how_title),
      "en.json landing.how_title still says three actions"
    ).toBe(false);
    for (const [locale, stale] of Object.entries(STALE_HOW_TITLE_AT_F3DC27A0)) {
      const landing = loadLanding(locale);
      expect(
        landing.how_title,
        `${locale}.json landing.how_title still equals its f3dc27a0 value`
      ).not.toBe(stale);
    }
  });
});
