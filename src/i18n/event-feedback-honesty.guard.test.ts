import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locales } from "./config";

/**
 * UX-BUILD-EVENTFEEDBACK-1128-925 honesty guard.
 *
 * Player correction copy must describe submissions as claims reviewed
 * automatically by AI. It must never claim verification, validation, human
 * checking, or team confirmation. The detector is tested against a deliberately
 * violating inline fixture and then against the real locale keys.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const FALSE_CLAIM_RE =
  /verified|validated|checked by humans|human check|human review|confirmed by our team/i;

const KEY_PREFIX = "learn_feedback_";

function loadGame(locale: string): Record<string, string> {
  const raw = readFileSync(
    resolve(PROJECT_ROOT, "src/i18n", `${locale}.json`),
    "utf-8"
  );
  return JSON.parse(raw).game;
}

function feedbackEntries(game: Record<string, string>): [string, string][] {
  return Object.entries(game).filter(([key]) => key.startsWith(KEY_PREFIX));
}

function hasFalseClaim(entries: [string, string][]): boolean {
  return entries.some(([, value]) => FALSE_CLAIM_RE.test(value));
}

describe("event feedback honesty guard (UX-BUILD-EVENTFEEDBACK-1128-925)", () => {
  it("detects a deliberately violating inline fixture", () => {
    expect(
      hasFalseClaim([
        ["learn_feedback_success", "Thanks — this was verified by humans."],
      ])
    ).toBe(true);
    expect(
      hasFalseClaim([
        ["learn_feedback_success", "Thanks — confirmed by our team."],
      ])
    ).toBe(true);
  });

  it("real learn_feedback keys contain no verification or human-review claims", () => {
    for (const locale of locales) {
      const entries = feedbackEntries(loadGame(locale));
      expect(entries.length, `${locale}.json has no learn_feedback keys`).toBeGreaterThan(0);
      expect(
        hasFalseClaim(entries),
        `${locale}.json learn_feedback copy contains a forbidden claim`
      ).toBe(false);
    }
  });

  it("every locale has the same learn_feedback key set as en", () => {
    const enKeys = feedbackEntries(loadGame("en")).map(([key]) => key).sort();
    for (const locale of locales) {
      const keys = feedbackEntries(loadGame(locale)).map(([key]) => key).sort();
      expect(keys, `${locale}.json learn_feedback key set`).toEqual(enKeys);
    }
  });

  it("the English success copy says AI review, delay, and evidence plainly", () => {
    const copy = loadGame("en").learn_feedback_success;
    expect(copy).toContain("reviewed automatically by AI");
    expect(copy).toContain("can take time");
    expect(copy).toContain("not changed without evidence");
  });
});
