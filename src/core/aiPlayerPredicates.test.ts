import { describe, it, expect } from "vitest";
import { AI_PLAYER_LIVE_SQL, AI_PLAYER_DAILY_SQL } from "./aiPlayerPredicates";

// AIP-FIX-AIELIGIBILITY-LB-1107-097 — unit proof for the shared AI-player
// eligibility predicates used by the leaderboard and daily-results routes.

describe("aiPlayerPredicates", () => {
  it("AI_PLAYER_LIVE_SQL requires active and non-deleted AI players", () => {
    expect(AI_PLAYER_LIVE_SQL).toContain("ap.is_active = true");
    expect(AI_PLAYER_LIVE_SQL).toContain("deleted_at IS NULL");
  });

  it("AI_PLAYER_DAILY_SQL requires daily-active, active, non-deleted AI players", () => {
    expect(AI_PLAYER_DAILY_SQL).toContain("ap.is_active_daily = true");
    expect(AI_PLAYER_DAILY_SQL).toContain("ap.is_active = true");
    expect(AI_PLAYER_DAILY_SQL).toContain("deleted_at IS NULL");
  });
});
