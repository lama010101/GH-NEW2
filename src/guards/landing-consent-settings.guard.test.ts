import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * UX-FIX-CONSENTLINK-1125-896 — landing footer consent reopen guard.
 * Source-level guard: the landing footer must expose the existing consent
 * settings control through the single consent owner in src/core/consent.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const landingSrc = readFileSync(
  resolve(PROJECT_ROOT, "src/app/prototype/landing/page.tsx"),
  "utf-8"
);

function landingFooterSource(): string {
  const footerStart = landingSrc.indexOf("{/* ── FOOTER ── */}");
  if (footerStart < 0) return "";
  return landingSrc.slice(footerStart);
}

describe("landing footer cookie settings guard (UX-FIX-CONSENTLINK-1125-896)", () => {
  it("imports requestConsentReopen from the consent single source of truth", () => {
    expect(landingSrc).toMatch(
      /import\s*\{\s*requestConsentReopen\s*\}\s*from\s*["']@\/core\/consent["'];/
    );
  });

  it("uses the existing consent.settings key in the landing footer", () => {
    expect(landingSrc).toContain('useTranslations("consent")');
    expect(landingFooterSource()).toContain('tc("settings")');
  });

  it("calls requestConsentReopen from the landing footer control", () => {
    expect(landingFooterSource()).toContain("requestConsentReopen()");
  });
});
