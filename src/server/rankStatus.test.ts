import { beforeEach, describe, expect, it, vi } from "vitest";
import { RANK_GATE_COUNTED_MODES, RANK_GATE_WINDOW_ROUNDS } from "@/core/rank";

// RANK-BUILD-ACCGATE-1103-003: rankStatus DB layer with a MOCKED pool.
// No test touches a real DB — getDbPool is module-mocked.

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDbPool: () => ({ query: mocks.query }),
}));

import { evaluateAndPersistRank } from "./rankStatus";

const PID = "11111111-2222-3333-4444-555555555555";

function mockReads(stats: { total_xp: number; max_rank_tier: number } | null, rollingAcc: string | null, sampled: number) {
  mocks.query
    .mockResolvedValueOnce({ rows: stats ? [stats] : [] })
    .mockResolvedValueOnce({ rows: [{ rolling_acc: rollingAcc, rounds_sampled: String(sampled) }] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateAndPersistRank — rolling window query", () => {
  it("queries with the constant modes array, window 200, NULL filters and the locked ordering", async () => {
    mockReads({ total_xp: 0, max_rank_tier: 1 }, null, 0);
    await evaluateAndPersistRank(PID);

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const [sql, params] = mocks.query.mock.calls[1];
    expect(params).toEqual([PID, [...RANK_GATE_COUNTED_MODES], RANK_GATE_WINDOW_ROUNDS]);
    expect(params[2]).toBe(200);
    expect(sql).toContain("s.mode = ANY($2::text[])");
    expect(sql).toContain("rr.location_score IS NOT NULL");
    expect(sql).toContain("rr.time_score IS NOT NULL");
    expect(sql).toContain("ORDER BY s.created_at DESC NULLS LAST, rr.round_index DESC");
    expect(sql).toContain("LIMIT $3");
    expect(sql).toContain("AVG((w.location_score + w.time_score) / 2.0)");
  });

  it("reads total_xp and max_rank_tier from the player's own row only", async () => {
    mockReads({ total_xp: 0, max_rank_tier: 1 }, null, 0);
    await evaluateAndPersistRank(PID);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("SELECT total_xp, max_rank_tier");
    expect(sql).toContain("FROM player_global_stats");
    expect(sql).toContain("WHERE player_id = $1");
    expect(params).toEqual([PID]);
  });
});

describe("evaluateAndPersistRank — guarded write", () => {
  it("writes via GREATEST when the evaluated tier is higher", async () => {
    // XP 6_000, stored t2, acc 30 >= floor 25, sample 60 >= 50 → t3.
    mockReads({ total_xp: 6_000, max_rank_tier: 2 }, "30.0", 60);
    mocks.query.mockResolvedValueOnce({ rows: [] }); // UPDATE result

    const snap = await evaluateAndPersistRank(PID);

    expect(snap.maxRankTier).toBe(3);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    const [sql, params] = mocks.query.mock.calls[2];
    expect(sql).toContain("UPDATE player_global_stats");
    expect(sql).toContain("SET max_rank_tier = GREATEST(max_rank_tier, $2)");
    expect(sql).toContain("WHERE player_id = $1");
    expect(params).toEqual([PID, 3]);
  });

  it("does NOT write when the gate blocks promotion", async () => {
    // Same XP/stored tier but accuracy 10 < 25 → stays t2, no UPDATE.
    mockReads({ total_xp: 6_000, max_rank_tier: 2 }, "10.0", 60);
    const snap = await evaluateAndPersistRank(PID);
    expect(snap.maxRankTier).toBe(2);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("does NOT write when the evaluated tier equals the stored tier", async () => {
    // Already t3 with data that only supports t3 → no write.
    mockReads({ total_xp: 6_000, max_rank_tier: 3 }, "30.0", 60);
    const snap = await evaluateAndPersistRank(PID);
    expect(snap.maxRankTier).toBe(3);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("never demotes: stored tier survives lower evaluated data", async () => {
    mockReads({ total_xp: 0, max_rank_tier: 8 }, null, 0);
    const snap = await evaluateAndPersistRank(PID);
    expect(snap.maxRankTier).toBe(8);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("defaults to total_xp 0 / max_rank_tier 1 when the stats row is absent", async () => {
    mockReads(null, null, 0);
    const snap = await evaluateAndPersistRank(PID);
    expect(snap).toEqual({ totalXp: 0, maxRankTier: 1, rollingAccPct: null, roundsSampled: 0 });
  });
});
