import { describe, expect, it, vi } from "vitest";

// SessionComplete.tsx imports supabaseBrowser, which throws at module load
// when NEXT_PUBLIC_SUPABASE_* env vars are absent. The rank helper under test
// is pure, so the client is mocked out (mirrors AuthModal.test.tsx).
vi.mock("@/core/supabaseBrowser", () => ({
  supabaseBrowser: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  readSession: vi.fn().mockResolvedValue(null),
  forceClearAuthStorage: vi.fn(),
  getValidAccessToken: vi.fn().mockResolvedValue(null),
}));

import { resolveDailyRank } from "./SessionComplete";

const row = (player_id: string, rank: number) => ({ player_id, rank });

describe("resolveDailyRank — daily banner rank resolution", () => {
  it("returns the rank of the row matching playerId", () => {
    const rows = [row("p-a", 1), row("p-me", 7), row("p-b", 8)];
    expect(resolveDailyRank(rows, "p-me")).toBe(7);
  });

  it("returns null when the player's row is not found", () => {
    const rows = [row("p-a", 1), row("p-b", 2)];
    expect(resolveDailyRank(rows, "p-me")).toBeNull();
  });

  it("returns null while results are loading / unavailable (rows null)", () => {
    expect(resolveDailyRank(null, "p-me")).toBeNull();
  });

  it("returns null when playerId is null", () => {
    expect(resolveDailyRank([row("p-a", 1)], null)).toBeNull();
  });

  it("returns the shared rank on a RANK() tie", () => {
    const rows = [row("p-a", 1), row("p-me", 2), row("p-b", 2), row("p-c", 4)];
    expect(resolveDailyRank(rows, "p-me")).toBe(2);
    expect(resolveDailyRank(rows, "p-b")).toBe(2);
  });
});
