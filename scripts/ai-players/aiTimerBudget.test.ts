import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_PLAYER_TIMER_MS,
  AI_WORKER_CRITIQUE_CAP_MS,
  AI_WORKER_DB_GRACE_MS,
} from "@/core/aiPlayers";

// AIP-FIX-AITIMERKILL-1011-008: the supervisor hard-kill budget must outlive
// answer timer + critique cap, and every ai-players budget must come from
// src/core/aiPlayers.ts — never a re-declared literal.

const AI_PLAYERS_DIR = __dirname;
const SELF = basename(__filename);

function readScript(name: string): string {
  return readFileSync(resolve(AI_PLAYERS_DIR, name), "utf8");
}

describe("ai worker timer budget (AIP-FIX-AITIMERKILL-1011-008)", () => {
  it("hard-kill budget exceeds answer timer + critique cap", () => {
    const hardKillMs =
      AI_PLAYER_TIMER_MS + AI_WORKER_CRITIQUE_CAP_MS + AI_WORKER_DB_GRACE_MS;
    expect(hardKillMs).toBeGreaterThan(
      AI_PLAYER_TIMER_MS + AI_WORKER_CRITIQUE_CAP_MS
    );
    expect(AI_WORKER_DB_GRACE_MS).toBeGreaterThan(0);
    expect(AI_WORKER_CRITIQUE_CAP_MS).toBeGreaterThan(0);
  });

  it("daily-autoplay derives WORKER_HARD_KILL_MS from the three core constants", () => {
    const src = readScript("daily-autoplay.ts");
    expect(src).toMatch(
      /WORKER_HARD_KILL_MS\s*=\s*AI_PLAYER_TIMER_MS\s*\+\s*AI_WORKER_CRITIQUE_CAP_MS\s*\+\s*AI_WORKER_DB_GRACE_MS/
    );
  });

  it("generate-answers-v3 sources CRITIQUE_TIMEOUT_MS from core", () => {
    const src = readScript("generate-answers-v3.ts");
    expect(src).toMatch(/CRITIQUE_TIMEOUT_MS\s*=\s*AI_WORKER_CRITIQUE_CAP_MS/);
  });

  it("no scripts/ai-players file declares a literal critique cap or timer", () => {
    const files = readdirSync(AI_PLAYERS_DIR).filter(
      (f) => f.endsWith(".ts") && f !== SELF
    );
    for (const file of files) {
      const src = readScript(file);
      expect(src, `${file}: literal 30s ms cap`).not.toMatch(
        /\b30_000\b|\b30000\b/
      );
      expect(src, `${file}: literal 90s ms timer`).not.toMatch(
        /\b90_000\b|\b90000\b/
      );
      // A bare `= 90` seconds timer declaration. Latitude checks (`> 90`,
      // `< -90`) have no `=` before the 90 so they do not match.
      expect(src, `${file}: literal 90-second timer assignment`).not.toMatch(
        /=\s*90\b/
      );
    }
  });
});
