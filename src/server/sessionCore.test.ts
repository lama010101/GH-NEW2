import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockedFunction } from "vitest";
import { type CompeteSessionSnapshot } from "@/core/types";
import { dbPool } from "@/server/db";
import {
  getGameState,
  deriveStateFromEventStream,
  loadPendingInvitees,
  type ReconstructedGameState,
} from "@/server/getGameState";
import {
  validateJoinEligibility,
  cancelCompeteInvite,
  kickCompetePlayer,
  type DbTransactionClient,
  type SessionRow,
} from "./sessionCore";

vi.mock("@/server/db", () => ({
  dbPool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock("@/server/getGameState", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/getGameState")>();
  return {
    ...original,
    getGameState: vi.fn(),
    deriveStateFromEventStream: vi.fn(),
  };
});

const GAME_ID = "11111111-2222-3333-4444-555555555555";
const PLAYER_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const HOST_ID = "host0000-0000-0000-0000-000000000000";
const INVITEE_ID = "invitee0-0000-0000-0000-000000000000";
const TARGET_ID = "target0000-0000-0000-0000-000000000000";
const OTHER_PLAYER_ID = "other00000-0000-0000-0000-000000000000";

function mockPoolConnect(client: DbTransactionClient) {
  (dbPool as unknown as { connect: MockedFunction<() => Promise<DbTransactionClient>> }).connect.mockResolvedValue(client);
}

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

type LifecycleMockState = {
  players: {
    gameId: string;
    playerId: string;
    isHost: boolean;
    leftAt: Date | null;
    kicked: boolean;
  }[];
  invitations: {
    gameId: string;
    inviteeId: string;
    status: "pending" | "cancelled" | "accepted" | "declined";
    expiresAt: Date;
    createdAt: Date;
  }[];
  notifications: {
    userId: string;
    type: string;
    payload: { game_id: string };
    read: boolean;
  }[];
  follows: { followerId: string; followedId: string }[];
};

function createLifecycleMockClient(
  state: LifecycleMockState = {
    players: [],
    invitations: [],
    notifications: [],
    follows: [],
  }
) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("SELECT player_id, is_host FROM session_players")) {
      const [gameId, playerId] = (params ?? []) as [string, string];
      const player = state.players.find(
        (p) =>
          p.gameId === gameId && p.playerId === playerId && p.leftAt === null
      );
      return {
        rows: player ? [{ player_id: player.playerId, is_host: player.isHost }] : [],
      };
    }
    if (
      sql.includes("SELECT player_id FROM session_players") &&
      sql.includes("is_host = true")
    ) {
      const [gameId, playerId] = (params ?? []) as [string, string];
      const player = state.players.find(
        (p) =>
          p.gameId === gameId &&
          p.playerId === playerId &&
          p.isHost &&
          p.leftAt === null
      );
      return { rows: player ? [{ player_id: player.playerId }] : [] };
    }
    if (
      sql.includes("UPDATE session_players") &&
      sql.includes("left_at = now()")
    ) {
      const [gameId, playerId] = (params ?? []) as [string, string];
      const player = state.players.find(
        (p) => p.gameId === gameId && p.playerId === playerId
      );
      if (player) {
        player.leftAt = new Date();
        player.kicked = true;
      }
      return { rows: [] };
    }
    if (
      sql.includes("UPDATE game_invitations") &&
      sql.includes("status = 'cancelled'")
    ) {
      const [gameId, inviteeId] = (params ?? []) as [string, string];
      state.invitations
        .filter(
          (i) =>
            i.gameId === gameId &&
            i.inviteeId === inviteeId &&
            i.status === "pending"
        )
        .forEach((i) => {
          i.status = "cancelled";
        });
      return { rows: [] };
    }
    if (sql.includes("UPDATE notifications") && sql.includes("read = true")) {
      const [userId, gameId] = (params ?? []) as [string, string];
      state.notifications
        .filter(
          (n) =>
            n.userId === userId &&
            n.type === "lobby_invite" &&
            n.payload.game_id === gameId
        )
        .forEach((n) => {
          n.read = true;
        });
      return { rows: [] };
    }
    if (sql.includes("DELETE FROM public.player_follows")) {
      const [followerId, followedId] = (params ?? []) as [string, string];
      state.follows = state.follows.filter(
        (f) =>
          !(f.followerId === followerId && f.followedId === followedId)
      );
      return { rows: [] };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as DbTransactionClient;
  return { client, query, state };
}

type MockExecutorState = {
  profiles: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  }[];
  invitations: {
    gameId: string;
    inviteeId: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }[];
};

function createMockExecutor(state: MockExecutorState) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (
      sql.includes(
        "SELECT gi.invitee_id, p.display_name, p.avatar_url, gi.created_at"
      )
    ) {
      const [gameId] = (params ?? []) as [string];
      const now = new Date();
      const filtered = state.invitations
        .filter(
          (i) =>
            i.gameId === gameId &&
            i.status === "pending" &&
            i.expiresAt > now
        )
        .sort((a, b) => {
          const dt = a.createdAt.getTime() - b.createdAt.getTime();
          if (dt !== 0) return dt;
          return a.inviteeId.localeCompare(b.inviteeId);
        });
      const rows = filtered.map((i) => {
        const profile = state.profiles.find((p) => p.id === i.inviteeId);
        return {
          invitee_id: i.inviteeId,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          created_at: i.createdAt,
        };
      });
      return { rows };
    }
    return { rows: [] };
  });
  return {
    query,
    executor: { query } as unknown as NonNullable<
      Parameters<typeof loadPendingInvitees>[1]
    >,
  };
}

function session(
  overrides: { mode?: SessionRow["mode"]; deadline?: Date } = {}
) {
  return {
    mode: overrides.mode ?? "sync",
    session_deadline: overrides.deadline ?? null,
  } as unknown as SessionRow;
}

function snapshot(status: CompeteSessionSnapshot["status"]) {
  return { status } as unknown as CompeteSessionSnapshot;
}

function createReconstructedGameState(overrides: {
  gameId?: string;
  players?: {
    playerId: string;
    displayName: string;
    joinedAt: string;
    leftAt: string | null;
    ready: boolean;
    isHost: boolean;
    avatarUrl: string | null;
  }[];
} = {}): ReconstructedGameState {
  const gameId = overrides.gameId ?? GAME_ID;
  const players = overrides.players ?? [];
  return {
    session: {
      gameId,
      mode: "sync",
      roundTimerSec: 120,
      totalRounds: 5,
      yearMin: -400,
      yearMax: 2026,
      resultsAutoAdvanceSec: 90,
      selectedEras: [
        "ancient",
        "medieval",
        "earlymodern",
        "modern",
        "contemporary",
      ],
      selectedRegions: [],
      sessionDeadline: null,
      sessionDeadlineDays: null,
      createdAt: new Date().toISOString(),
      roomCode: "ROOM01",
      referenceYear: 1000,
    },
    players,
    currentRound: 0,
    phase: "LOBBY",
    rounds: [],
    events: [],
    roundEventContent: [],
    pendingInvitees: [],
  } as unknown as ReconstructedGameState;
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

  it("rejects the 31st joiner in an async (Relax) session at the 30-player cap", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: Array.from({ length: 30 }, (_, i) => `player-${i}`),
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session({ mode: "async", deadline: new Date(Date.now() + 86400000) }),
      snapshot("LOBBY")
    );

    expect(result).toEqual({
      ok: false,
      error: "Session is full (30 players max)",
      code: "SESSION_FULL",
    });
  });

  it("still rejects the 9th joiner in a sync (Rush) session at the unchanged 8-player cap", async () => {
    const { client } = createMockClient({
      playerRow: null,
      activePlayers: Array.from({ length: 8 }, (_, i) => `player-${i}`),
    });

    const result = await validateJoinEligibility(
      client,
      GAME_ID,
      PLAYER_ID,
      session({ mode: "sync" }),
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

describe("cancelCompeteInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deriveStateFromEventStream).mockReturnValue({
      currentRound: 0,
      currentPhase: "LOBBY",
    });
    vi.mocked(dbPool.query).mockResolvedValue({
      rows: [{ exists: false }],
    } as any);
  });

  it("host cancels a pending invite and syncs the notification to read", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: HOST_ID,
          isHost: true,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [
        {
          gameId: GAME_ID,
          inviteeId: INVITEE_ID,
          status: "pending",
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
        },
      ],
      notifications: [
        {
          userId: INVITEE_ID,
          type: "lobby_invite",
          payload: { game_id: GAME_ID },
          read: false,
        },
      ],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );
    vi.mocked(getGameState).mockResolvedValue(
      createReconstructedGameState({
        players: [
          {
            playerId: HOST_ID,
            displayName: "Host",
            joinedAt: new Date().toISOString(),
            leftAt: null,
            ready: false,
            isHost: true,
            avatarUrl: null,
          },
        ],
      })
    );

    const result = await cancelCompeteInvite({
      gameId: GAME_ID,
      playerId: HOST_ID,
      inviteeId: INVITEE_ID,
    });

    expect(result.gameId).toBe(GAME_ID);
    expect(result.status).toBe("LOBBY");
    expect(lifecycleState.invitations[0].status).toBe("cancelled");
    expect(lifecycleState.notifications[0].read).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE game_invitations"),
      [GAME_ID, INVITEE_ID]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE notifications"),
      [INVITEE_ID, GAME_ID]
    );
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects a non-host attempting to cancel an invite", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: OTHER_PLAYER_ID,
          isHost: false,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [],
      notifications: [],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );

    await expect(
      cancelCompeteInvite({
        gameId: GAME_ID,
        playerId: OTHER_PLAYER_ID,
        inviteeId: INVITEE_ID,
      })
    ).rejects.toThrow("Only the host can cancel invites");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE game_invitations"),
      expect.anything()
    );
  });

  it("leaves already-accepted invitations unchanged but still marks the notification read", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: HOST_ID,
          isHost: true,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [
        {
          gameId: GAME_ID,
          inviteeId: INVITEE_ID,
          status: "accepted",
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
        },
      ],
      notifications: [
        {
          userId: INVITEE_ID,
          type: "lobby_invite",
          payload: { game_id: GAME_ID },
          read: false,
        },
      ],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );
    vi.mocked(getGameState).mockResolvedValue(
      createReconstructedGameState({
        players: [
          {
            playerId: HOST_ID,
            displayName: "Host",
            joinedAt: new Date().toISOString(),
            leftAt: null,
            ready: false,
            isHost: true,
            avatarUrl: null,
          },
        ],
      })
    );

    const result = await cancelCompeteInvite({
      gameId: GAME_ID,
      playerId: HOST_ID,
      inviteeId: INVITEE_ID,
    });

    expect(lifecycleState.invitations[0].status).toBe("accepted");
    expect(lifecycleState.notifications[0].read).toBe(true);
    expect(result.status).toBe("LOBBY");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE notifications"),
      [INVITEE_ID, GAME_ID]
    );
  });
});

describe("kickCompetePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deriveStateFromEventStream).mockReturnValue({
      currentRound: 0,
      currentPhase: "LOBBY",
    });
    vi.mocked(dbPool.query).mockResolvedValue({
      rows: [{ exists: false }],
    } as any);
  });

  it("host kicks a player, cancels the invite, syncs notification read, and removes the follow", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: HOST_ID,
          isHost: true,
          leftAt: null,
          kicked: false,
        },
        {
          gameId: GAME_ID,
          playerId: TARGET_ID,
          isHost: false,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [
        {
          gameId: GAME_ID,
          inviteeId: TARGET_ID,
          status: "pending",
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
        },
      ],
      notifications: [
        {
          userId: TARGET_ID,
          type: "lobby_invite",
          payload: { game_id: GAME_ID },
          read: false,
        },
      ],
      follows: [{ followerId: HOST_ID, followedId: TARGET_ID }],
    };
    const { client, query, state } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );
    vi.mocked(getGameState).mockResolvedValue(
      createReconstructedGameState({
        players: [
          {
            playerId: HOST_ID,
            displayName: "Host",
            joinedAt: new Date().toISOString(),
            leftAt: null,
            ready: false,
            isHost: true,
            avatarUrl: null,
          },
          {
            playerId: TARGET_ID,
            displayName: "Target",
            joinedAt: new Date().toISOString(),
            leftAt: new Date().toISOString(),
            ready: false,
            isHost: false,
            avatarUrl: null,
          },
        ],
      })
    );

    const result = await kickCompetePlayer({
      gameId: GAME_ID,
      playerId: HOST_ID,
      targetPlayerId: TARGET_ID,
    });

    expect(state.players[1].leftAt).not.toBeNull();
    expect(state.players[1].kicked).toBe(true);
    expect(state.invitations[0].status).toBe("cancelled");
    expect(state.notifications[0].read).toBe(true);
    expect(state.follows).toHaveLength(0);
    expect(result.gameId).toBe(GAME_ID);
    expect(result.status).toBe("LOBBY");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE session_players"),
      [GAME_ID, TARGET_ID]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM public.player_follows"),
      [HOST_ID, TARGET_ID]
    );
  });

  it("rejects a non-host attempting to kick a player", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: OTHER_PLAYER_ID,
          isHost: false,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [],
      notifications: [],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );

    await expect(
      kickCompetePlayer({
        gameId: GAME_ID,
        playerId: OTHER_PLAYER_ID,
        targetPlayerId: TARGET_ID,
      })
    ).rejects.toThrow("Only the host can kick players");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE session_players"),
      expect.anything()
    );
  });

  it("rejects kicking a player who is not an active session member", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: HOST_ID,
          isHost: true,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [],
      notifications: [],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );

    await expect(
      kickCompetePlayer({
        gameId: GAME_ID,
        playerId: HOST_ID,
        targetPlayerId: TARGET_ID,
      })
    ).rejects.toThrow("Target player not found or already left");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE session_players"),
      expect.anything()
    );
  });

  it("rejects a host attempting to kick themselves", async () => {
    const lifecycleState: LifecycleMockState = {
      players: [
        {
          gameId: GAME_ID,
          playerId: HOST_ID,
          isHost: true,
          leftAt: null,
          kicked: false,
        },
      ],
      invitations: [],
      notifications: [],
      follows: [],
    };
    const { client, query } = createLifecycleMockClient(lifecycleState);
    mockPoolConnect(
      client as unknown as DbTransactionClient
    );

    await expect(
      kickCompetePlayer({
        gameId: GAME_ID,
        playerId: HOST_ID,
        targetPlayerId: HOST_ID,
      })
    ).rejects.toThrow("Cannot kick yourself");

    expect(query).not.toHaveBeenCalledWith("BEGIN");
  });
});

describe("loadPendingInvitees", () => {
  it("returns the correct set of pending invitees with profile data", async () => {
    const now = Date.now();
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const state: MockExecutorState = {
      profiles: [
        {
          id: INVITEE_ID,
          display_name: "Invitee One",
          avatar_url: "https://example.com/a.png",
        },
        {
          id: OTHER_PLAYER_ID,
          display_name: null,
          avatar_url: null,
        },
      ],
      invitations: [
        {
          gameId: GAME_ID,
          inviteeId: INVITEE_ID,
          status: "pending",
          expiresAt: new Date(now + 3600000),
          createdAt,
        },
        {
          gameId: GAME_ID,
          inviteeId: OTHER_PLAYER_ID,
          status: "pending",
          expiresAt: new Date(now + 3600000),
          createdAt,
        },
      ],
    };
    const { executor, query } = createMockExecutor(state);

    const result = await loadPendingInvitees(GAME_ID, executor);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      playerId: INVITEE_ID,
      displayName: "Invitee One",
      avatarUrl: "https://example.com/a.png",
      invitedAt: createdAt.toISOString(),
    });
    expect(result[1]).toEqual({
      playerId: OTHER_PLAYER_ID,
      displayName: OTHER_PLAYER_ID.slice(0, 8),
      avatarUrl: null,
      invitedAt: createdAt.toISOString(),
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("gi.status = 'pending'"),
      [GAME_ID]
    );
    expect(query.mock.calls[0][0]).toContain("gi.expires_at > now()");
  });

  it("excludes cancelled and expired invitations", async () => {
    const EXPIRED_ID = "expired0-0000-0000-0000-000000000000";
    const now = Date.now();
    const state: MockExecutorState = {
      profiles: [
        { id: INVITEE_ID, display_name: "Pending", avatar_url: null },
        { id: OTHER_PLAYER_ID, display_name: "Cancelled", avatar_url: null },
        { id: EXPIRED_ID, display_name: "Expired", avatar_url: null },
      ],
      invitations: [
        {
          gameId: GAME_ID,
          inviteeId: INVITEE_ID,
          status: "pending",
          expiresAt: new Date(now + 3600000),
          createdAt: new Date(now - 2000),
        },
        {
          gameId: GAME_ID,
          inviteeId: OTHER_PLAYER_ID,
          status: "cancelled",
          expiresAt: new Date(now + 3600000),
          createdAt: new Date(now - 2000),
        },
        {
          gameId: GAME_ID,
          inviteeId: EXPIRED_ID,
          status: "pending",
          expiresAt: new Date(now - 1000),
          createdAt: new Date(now - 2000),
        },
      ],
    };
    const { executor, query } = createMockExecutor(state);

    const result = await loadPendingInvitees(GAME_ID, executor);

    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe(INVITEE_ID);
    expect(query.mock.calls[0][0]).toContain("gi.status = 'pending'");
    expect(query.mock.calls[0][0]).toContain("gi.expires_at > now()");
  });

  it("returns an empty array when the session has no pending invitees", async () => {
    const state: MockExecutorState = { profiles: [], invitations: [] };
    const { executor } = createMockExecutor(state);

    const result = await loadPendingInvitees(GAME_ID, executor);

    expect(result).toEqual([]);
  });
});
