import { describe, it, expect, beforeEach, vi } from "vitest";
import { type CompeteSessionSnapshot } from "@/core/types";
import {
  validateJoinEligibility,
  type DbTransactionClient,
  type SessionRow,
} from "./sessionCore";

const GAME_ID = "11111111-2222-3333-4444-555555555555";
const PLAYER_ID = "abcdef12-3456-7890-abcd-ef1234567890";

type MockClientState = {
  playerRow: { kicked: boolean; left_at: Date | null } | null;
  activePlayers: string[];
};

function createMockClient(
  state: MockClientState = { playerRow: null, activePlayers: [] }
) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("pg_advisory_xact_lock")) {
      return { rows: [{}] };
    }
    if (sql.includes("SELECT kicked, left_at FROM session_players")) {
      return { rows: state.playerRow ? [state.playerRow] : [] };
    }
    if (sql.includes("SELECT player_id FROM session_players")) {
      const [requestedGameId] = params ?? [];
      if (requestedGameId !== GAME_ID) {
        return { rows: [] };
      }
      return {
        rows: state.activePlayers.map((id) => ({ player_id: id })),
      };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as DbTransactionClient;
  return { client, query };
}

function session(overrides: { mode?: SessionRow["mode"]; deadline?: Date } = {}) {
  return {
    mode: overrides.mode ?? "sync",
    session_deadline: overrides.deadline ?? null,
  } as unknown as SessionRow;
}

function snapshot(status: CompeteSessionSnapshot["status"]) {
  return { status } as unknown as CompeteSessionSnapshot;
}

describe("validateJoinEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects practice sessions immediately", async () => {
    const { client, query } = createMockClient();
    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session({ mode: "practice" }),
      snapshot("LOBBY")
    );

    expect(result).toEqual({
      ok: false,
      error: "Practice sessions cannot be joined",
      code: "PRACTICE_NOT_ALLOWED",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a kicked player", async () => {
    const { client, query } = createMockClient({
      playerRow: { kicked: true, left_at: null },
      activePlayers: [],
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("LOBBY")
    );

    expect(result).toEqual({
      ok: false,
      error: "You were removed from this game by the host",
      code: "PLAYER_KICKED",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      [GAME_ID]
    );
  });

  it("allows an active rejoiner to bypass capacity and in-progress checks", async () => {
    const { client, query } = createMockClient({
      playerRow: { kicked: false, left_at: null },
      activePlayers: Array.from({ length: 8 }, (_, i) => `player-${i}`),
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("ROUND_ACTIVE")
    );

    expect(result).toEqual({ ok: true, isActiveRejoiner: true });
    // Advisory lock and player row only — no active-count query.
    const sqls = query.mock.calls.map(([sql]) => sql);
    expect(sqls).toHaveLength(2);
    expect(sqls[0]).toContain("pg_advisory_xact_lock");
    expect(sqls[1]).toContain("SELECT kicked, left_at");
  });

  it("allows a new joiner when the session is not full and is in LOBBY", async () => {
    const { client, query } = createMockClient({
      playerRow: null,
      activePlayers: ["player-1", "player-2"],
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("LOBBY")
    );

    expect(result).toEqual({ ok: true, isActiveRejoiner: false });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT player_id FROM session_players"),
      [GAME_ID]
    );
  });

  it("rejects a new joiner when the session is full", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: Array.from({ length: 8 }, (_, i) => `player-${i}`),
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("LOBBY")
    );

    expect(result).toEqual({
      ok: false,
      error: "Session is full (8 players max)",
      code: "SESSION_FULL",
    });
  });

  it("rejects a new joiner in a sync session that is no longer in LOBBY", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: ["player-1"],
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("ROUND_ACTIVE")
    );

    expect(result).toEqual({
      ok: false,
      error: "Game already in progress",
      code: "GAME_IN_PROGRESS",
    });
  });

  it("allows a new joiner in an async session whose deadline has not passed", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: ["player-1"],
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session({ mode: "async", deadline: new Date(Date.now() + 86400000) }),
      snapshot("ROUND_ACTIVE")
    );

    expect(result).toEqual({ ok: true, isActiveRejoiner: false });
  });

  it("rejects a new joiner in an async session whose deadline has passed", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: ["player-1"],
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session({ mode: "async", deadline: new Date(Date.now() - 1000) }),
      snapshot("ROUND_ACTIVE")
    );

    expect(result).toEqual({
      ok: false,
      error: "Session deadline has passed",
      code: "DEADLINE_PASSED",
    });
  });

  it("applies the advisory lock and player row lock with the correct parameters", async () => {
    const { client, query } = createMockClient({
      playerRow: null,
      activePlayers: [],
    });

    await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session(),
      snapshot("LOBBY")
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("pg_advisory_xact_lock(hashtext($1)::bigint)"),
      [GAME_ID]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "SELECT kicked, left_at FROM session_players WHERE game_id = $1 AND player_id = $2 FOR UPDATE"
      ),
      [GAME_ID, PLAYER_ID]
    );
  });
});
