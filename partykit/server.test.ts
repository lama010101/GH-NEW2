import { describe, it, expect, vi, beforeEach } from "vitest";
import GameServer from "./server";

const GAME_ID = "game-1";
const PLAYER_A = "11111111-1111-1111-1111-111111111111";
const PLAYER_B = "22222222-2222-2222-2222-222222222222";
const PLAYER_C = "33333333-3333-3333-3333-333333333333";

function mockRoom(connections: Array<{ id: string; send: ReturnType<typeof vi.fn> }>) {
  return {
    id: GAME_ID,
    env: {
      NEXTJS_BASE_URL: "http://localhost:3000",
      PARTYKIT_SECRET: "test-secret",
    },
    storage: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getAlarm: vi.fn().mockResolvedValue(null),
      setAlarm: vi.fn().mockResolvedValue(undefined),
      deleteAlarm: vi.fn().mockResolvedValue(undefined),
    },
    getConnection: vi.fn(),
    getConnections: vi.fn(() => connections),
    broadcast: vi.fn(),
  };
}

function makeConnection(playerId: string) {
  const send = vi.fn();
  return { id: `conn-${playerId}`, send };
}

function makeSnapshot(options: {
  viewerPlayerId: string;
  dbVersion: { roundEventVersion: number; playerEventVersions: Record<string, number> };
  status?: string;
}) {
  const { viewerPlayerId, dbVersion, status = "ROUND_COMPLETE" } = options;
  const playerSnapshots: Record<string, { dbVersion: { roundEventVersion: number; playerEventVersions: Record<string, number> } }> = {};
  for (const pid of [PLAYER_A, PLAYER_B, PLAYER_C]) {
    playerSnapshots[pid] = { dbVersion };
  }
  return {
    gameId: GAME_ID,
    status,
    config: {
      mode: "async",
      roundTimerSec: 0,
      totalRounds: 3,
      yearMin: -400,
      yearMax: 2025,
      resultsAutoAdvanceSec: 90,
      selectedEras: [],
      selectedRegions: [],
      hostPlayerId: PLAYER_A,
      sessionDeadline: null,
      startedAt: null,
      completedAt: null,
    },
    players: [
      { playerId: PLAYER_A, displayName: "A", ready: true, isHost: true, hasSubmitted: true, leftAt: null },
      { playerId: PLAYER_B, displayName: "B", ready: true, isHost: false, hasSubmitted: false, leftAt: null },
      { playerId: PLAYER_C, displayName: "C", ready: true, isHost: false, hasSubmitted: false, leftAt: null },
    ],
    currentRoundIndex: 0,
    roundEndsAt: null,
    roundTimerSec: 0,
    resultsAutoAdvanceSec: 90,
    resultPhaseStartedAt: null,
    viewerPlayerId,
    playerSnapshots,
    dbVersion,
    events: [],
  };
}

describe("DO dbVersion gate (per-player comparison)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "not found",
      })
    );
  });

  it("a. accepts T1 snapshot on cold last", () => {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, PLAYER_A);
    (server as any).connections.set(connB.id, PLAYER_B);
    (server as any).connections.set(connC.id, PLAYER_C);

    const t1 = makeSnapshot({
      viewerPlayerId: PLAYER_A,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 19248, [PLAYER_B]: 0, [PLAYER_C]: 0 },
      },
    });

    (server as any).applySnapshotAndBroadcast(t1);

    expect(connA.send).toHaveBeenCalledTimes(1);
    expect(connB.send).toHaveBeenCalledTimes(1);
    expect(connC.send).toHaveBeenCalledTimes(1);
  });

  it("b. accepts T2 snapshot that is fresher for its own player even if another player's dimension is lower", () => {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, PLAYER_A);
    (server as any).connections.set(connB.id, PLAYER_B);
    (server as any).connections.set(connC.id, PLAYER_C);

    const t1 = makeSnapshot({
      viewerPlayerId: PLAYER_A,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 19248, [PLAYER_B]: 0, [PLAYER_C]: 0 },
      },
    });
    (server as any).applySnapshotAndBroadcast(t1);

    const callsBeforeB = connB.send.mock.calls.length;

    const t2 = makeSnapshot({
      viewerPlayerId: PLAYER_B,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 0, [PLAYER_B]: 19249, [PLAYER_C]: 0 },
      },
    });
    (server as any).applySnapshotAndBroadcast(t2);

    expect(connB.send.mock.calls.length).toBeGreaterThan(callsBeforeB);
    const lastBCall = connB.send.mock.calls[connB.send.mock.calls.length - 1][0];
    const payload = JSON.parse(lastBCall);
    expect(payload.type).toBe("STATE_UPDATE");
    expect(payload.snapshot.viewerPlayerId).toBe(PLAYER_B);
    expect(payload.snapshot.dbVersion.playerEventVersions[PLAYER_B]).toBe(19249);
  });

  it("c. rejects an older snapshot for the same player (negative control)", () => {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, PLAYER_A);
    (server as any).connections.set(connB.id, PLAYER_B);
    (server as any).connections.set(connC.id, PLAYER_C);

    const t1 = makeSnapshot({
      viewerPlayerId: PLAYER_A,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 19248, [PLAYER_B]: 0, [PLAYER_C]: 0 },
      },
    });
    (server as any).applySnapshotAndBroadcast(t1);

    const t2 = makeSnapshot({
      viewerPlayerId: PLAYER_B,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 0, [PLAYER_B]: 19249, [PLAYER_C]: 0 },
      },
    });
    (server as any).applySnapshotAndBroadcast(t2);

    const callsBeforeStale = connB.send.mock.calls.length;

    const staleBBase = makeSnapshot({
      viewerPlayerId: PLAYER_B,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 0, [PLAYER_B]: 19247, [PLAYER_C]: 0 },
      },
    });
    // Isolate the stale snapshot to the viewer player so no other player
    // candidate accidentally satisfies the per-player gate.
    const staleB = { ...staleBBase, playerSnapshots: undefined };
    (server as any).applySnapshotAndBroadcast(staleB);

    expect(connB.send.mock.calls.length).toBe(callsBeforeStale);
  });

  it("d. rejects a snapshot with a lower roundEventVersion (cross-round guard)", () => {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, PLAYER_A);
    (server as any).connections.set(connB.id, PLAYER_B);
    (server as any).connections.set(connC.id, PLAYER_C);

    const t1 = makeSnapshot({
      viewerPlayerId: PLAYER_A,
      dbVersion: {
        roundEventVersion: 19247,
        playerEventVersions: { [PLAYER_A]: 19248, [PLAYER_B]: 0, [PLAYER_C]: 0 },
      },
    });
    (server as any).applySnapshotAndBroadcast(t1);

    const callsBeforeStaleRound = connC.send.mock.calls.length;

    const staleRoundC = makeSnapshot({
      viewerPlayerId: PLAYER_C,
      dbVersion: {
        roundEventVersion: 19245,
        playerEventVersions: { [PLAYER_A]: 0, [PLAYER_B]: 0, [PLAYER_C]: 19250 },
      },
    });
    (server as any).applySnapshotAndBroadcast(staleRoundC);

    expect(connC.send.mock.calls.length).toBe(callsBeforeStaleRound);
  });
});
