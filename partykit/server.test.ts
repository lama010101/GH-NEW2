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

describe("DO status-regression guard (MP-FIX-SNAPSHOTREGRESSION-GUARD-001)", () => {
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

  // Build a RuntimeState-shaped snapshot WITHOUT a dbVersion field so the
  // per-player dbVersion freshness gate is bypassed and execution reaches the
  // status-regression guard directly.
  function makeRuntimeSnapshot(options: {
    status: string;
    currentRoundIndex: number;
  }) {
    const { status, currentRoundIndex } = options;
    return {
      gameId: GAME_ID,
      status,
      config: {
        mode: "sync",
        roundTimerSec: 60,
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
        { playerId: PLAYER_A, displayName: "A", ready: true, isHost: true, hasSubmitted: false, leftAt: null },
        { playerId: PLAYER_B, displayName: "B", ready: true, isHost: false, hasSubmitted: false, leftAt: null },
        { playerId: PLAYER_C, displayName: "C", ready: true, isHost: false, hasSubmitted: false, leftAt: null },
      ],
      currentRoundIndex,
      roundEndsAt: null,
      roundTimerSec: 60,
      resultsAutoAdvanceSec: 90,
      resultPhaseStartedAt: null,
      events: [],
    };
  }

  function makeServer() {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, PLAYER_A);
    (server as any).connections.set(connB.id, PLAYER_B);
    (server as any).connections.set(connC.id, PLAYER_C);
    return { server, connA, connB, connC };
  }

  it("a. ROUND_COMPLETE→ROUND_ACTIVE with next round index greater is ALLOWED", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_COMPLETE", currentRoundIndex: 0 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 1 }));
    expect(connA.send.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("b. ROUND_COMPLETE→ROUND_ACTIVE with same/lower round index is REJECTED", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_COMPLETE", currentRoundIndex: 1 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 1 }));
    expect(connA.send.mock.calls.length).toBe(callsBefore);
  });

  it("c. ROUND_ACTIVE→LOBBY is REJECTED", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 0 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "LOBBY", currentRoundIndex: 0 }));
    expect(connA.send.mock.calls.length).toBe(callsBefore);
  });

  it("d. LOBBY→ROUND_ACTIVE is ALLOWED", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "LOBBY", currentRoundIndex: 0 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 0 }));
    expect(connA.send.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("e. null this.snapshot (cold start) always ALLOWED regardless of incoming status", () => {
    const { server, connA } = makeServer();
    // Do NOT seed this.snapshot first — leave it null (cold start).
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 0 }));
    expect(connA.send).toHaveBeenCalledTimes(1);
  });

  it("f. SESSION_COMPLETE→LOBBY is REJECTED (stale play-again snapshot)", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "SESSION_COMPLETE", currentRoundIndex: 2 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "LOBBY", currentRoundIndex: 0 }));
    expect(connA.send.mock.calls.length).toBe(callsBefore);
  });

  it("g. same status (ROUND_ACTIVE→ROUND_ACTIVE) is ALLOWED (re-broadcast)", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 0 }));
    const callsBefore = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(makeRuntimeSnapshot({ status: "ROUND_ACTIVE", currentRoundIndex: 0 }));
    expect(connA.send.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe("DO async per-player status-regression guard (MP-FIX-RELAXLATEJOINER-1019-065)", () => {
  // Real ids/dbVersions captured live from POST /api/compete/<id>/join for a
  // late joiner while P1/P2 were ROUND_ACTIVE (C2 evidence, game
  // b469c0bc-bc90-426c-a5a5-dde7855f91bb). The payload's top-level status is
  // the JOINER's view (LOBBY); the map carries each player's own status.
  const P1 = "8bd48bbb-fcdc-4a8c-a4e6-4ad8b58e7c69";
  const P2 = "163c3244-a9f7-431e-b827-98119f9a283e";
  const P3 = "d74b2c60-f808-4d74-9cfd-e63ddc1923bc";
  const DBV = {
    roundEventVersion: 51211,
    playerEventVersions: { [P1]: 15598, [P2]: 15599, [P3]: 0 },
  };

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

  type PerPlayerEntry = {
    status: string;
    currentRoundIndex?: number;
    dbVersion?: typeof DBV;
  };

  function makeAsyncSnapshot(options: {
    viewerPlayerId: string | null;
    status: string;
    players?: string[];
    playerSnapshots?: Record<string, PerPlayerEntry>;
    dbVersion?: typeof DBV;
    currentRoundIndex?: number;
  }) {
    const {
      viewerPlayerId,
      status,
      players = [P1, P2, P3],
      playerSnapshots,
      dbVersion,
      currentRoundIndex = 0,
    } = options;
    const snap: Record<string, unknown> = {
      gameId: GAME_ID,
      status,
      config: {
        mode: "async",
        roundTimerSec: 0,
        totalRounds: 5,
        yearMin: -400,
        yearMax: 2026,
        resultsAutoAdvanceSec: 90,
        selectedEras: [],
        selectedRegions: [],
        hostPlayerId: P1,
        sessionDeadline: null,
        startedAt: null,
        completedAt: null,
      },
      players: players.map((pid, i) => ({
        playerId: pid,
        displayName: `P${i + 1}`,
        ready: true,
        isHost: pid === P1,
        hasSubmitted: false,
        leftAt: null,
      })),
      currentRoundIndex,
      roundEndsAt: null,
      roundTimerSec: 0,
      resultsAutoAdvanceSec: 90,
      resultPhaseStartedAt: null,
      viewerPlayerId,
      events: [],
    };
    if (playerSnapshots !== undefined) snap["playerSnapshots"] = playerSnapshots;
    if (dbVersion !== undefined) snap["dbVersion"] = dbVersion;
    return snap;
  }

  function perPlayer(status: string, dbv = DBV, currentRoundIndex = 0): PerPlayerEntry {
    return { status, currentRoundIndex, dbVersion: dbv };
  }

  function makeServer() {
    const connA = makeConnection("A");
    const connB = makeConnection("B");
    const connC = makeConnection("C");
    const room = mockRoom([connA, connB, connC]);
    const server = new GameServer(room as any);
    (server as any).connections.set(connA.id, P1);
    (server as any).connections.set(connB.id, P2);
    (server as any).connections.set(connC.id, P3);
    return { server, connA, connB, connC };
  }

  // Real captured join payload (verbatim fields the guard consumes): late
  // joiner P3's POST /join response while P1/P2 were already ROUND_ACTIVE.
  const CAPTURED_JOIN_PAYLOAD = () =>
    makeAsyncSnapshot({
      viewerPlayerId: P3,
      status: "LOBBY",
      playerSnapshots: {
        [P1]: perPlayer("ROUND_ACTIVE"),
        [P2]: perPlayer("ROUND_ACTIVE"),
        [P3]: perPlayer("LOBBY"),
      },
      dbVersion: DBV,
    });

  it("a. captured late-joiner payload: warm map + new joiner entry is APPLIED, each socket gets its own view", () => {
    const { server, connA, connB, connC } = makeServer();
    // Stored warm state: P2's apply left top-level ROUND_ACTIVE with a map
    // holding only P1/P2 — exactly what a warm DO holds before P3 joins.
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P2,
        status: "ROUND_ACTIVE",
        players: [P1, P2],
        playerSnapshots: {
          [P1]: perPlayer("ROUND_ACTIVE"),
          [P2]: perPlayer("ROUND_ACTIVE"),
        },
        dbVersion: DBV,
      })
    );
    const beforeA = connA.send.mock.calls.length;
    const beforeB = connB.send.mock.calls.length;
    const beforeC = connC.send.mock.calls.length;

    (server as any).applySnapshotAndBroadcast(CAPTURED_JOIN_PAYLOAD());

    expect(connA.send.mock.calls.length).toBeGreaterThan(beforeA);
    expect(connB.send.mock.calls.length).toBeGreaterThan(beforeB);
    expect(connC.send.mock.calls.length).toBeGreaterThan(beforeC);

    const snap = (server as any).snapshot as Record<string, unknown>;
    // The stored top-level becomes the JOINER's LOBBY view while the map
    // preserves P1/P2 ROUND_ACTIVE — the C3 premise.
    expect(snap.status).toBe("LOBBY");
    const map = snap["playerSnapshots"] as Record<string, { status: string }>;
    expect(map[P1].status).toBe("ROUND_ACTIVE");
    expect(map[P2].status).toBe("ROUND_ACTIVE");
    expect(map[P3].status).toBe("LOBBY");

    const lastC = JSON.parse(connC.send.mock.calls[connC.send.mock.calls.length - 1][0]);
    expect(lastC.type).toBe("STATE_UPDATE");
    expect(lastC.snapshot.status).toBe("LOBBY");
    expect(lastC.snapshot.viewerPlayerId).toBe(P3);
    expect(lastC.snapshot.players.length).toBe(3);
    const lastA = JSON.parse(connA.send.mock.calls[connA.send.mock.calls.length - 1][0]);
    expect(lastA.snapshot.status).toBe("ROUND_ACTIVE");
    expect(lastA.snapshot.viewerPlayerId).toBe(P1);
  });

  it("b. stale per-player LOBBY over stored ROUND_ACTIVE is REJECTED", () => {
    const { server, connA, connB, connC } = makeServer();
    // All three players already started.
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P3,
        status: "ROUND_ACTIVE",
        playerSnapshots: {
          [P1]: perPlayer("ROUND_ACTIVE"),
          [P2]: perPlayer("ROUND_ACTIVE"),
          [P3]: perPlayer("ROUND_ACTIVE"),
        },
        dbVersion: DBV,
      })
    );
    const beforeA = connA.send.mock.calls.length;
    const beforeB = connB.send.mock.calls.length;
    const beforeC = connC.send.mock.calls.length;

    // Stale/corrupted apply carries P3:LOBBY with a fresher dbVersion so the
    // entry lands in the merge — the regression guard must still reject it.
    const fresherDbv = {
      roundEventVersion: 51212,
      playerEventVersions: { [P1]: 15598, [P2]: 15599, [P3]: 1 },
    };
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P3,
        status: "LOBBY",
        playerSnapshots: {
          [P1]: perPlayer("ROUND_ACTIVE", fresherDbv),
          [P2]: perPlayer("ROUND_ACTIVE", fresherDbv),
          [P3]: perPlayer("LOBBY", fresherDbv),
        },
        dbVersion: fresherDbv,
      })
    );

    expect(connA.send.mock.calls.length).toBe(beforeA);
    expect(connB.send.mock.calls.length).toBe(beforeB);
    expect(connC.send.mock.calls.length).toBe(beforeC);
    const snap = (server as any).snapshot as Record<string, unknown>;
    expect(snap.status).toBe("ROUND_ACTIVE");
    const map = snap["playerSnapshots"] as Record<string, { status: string }>;
    expect(map[P3].status).toBe("ROUND_ACTIVE");
  });

  it("c. missing playerSnapshots on the incoming side is ALLOWED (viewer-only assert)", () => {
    const { server } = makeServer();
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P1,
        status: "ROUND_ACTIVE",
        playerSnapshots: { [P1]: perPlayer("ROUND_ACTIVE") },
        dbVersion: DBV,
      })
    );
    // Incoming apply carries no playerSnapshots map at all — only the
    // viewer's top-level view is asserted, and P2 has no stored entry.
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({ viewerPlayerId: P2, status: "ROUND_ACTIVE" })
    );
    const snap = (server as any).snapshot as Record<string, unknown>;
    expect(snap.status).toBe("ROUND_ACTIVE");
    expect(snap["viewerPlayerId"]).toBe(P2);
  });

  it("d. missing playerSnapshots on the stored side is ALLOWED", () => {
    const { server, connA } = makeServer();
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({ viewerPlayerId: null, status: "LOBBY" })
    );
    const before = connA.send.mock.calls.length;
    (server as any).applySnapshotAndBroadcast(CAPTURED_JOIN_PAYLOAD());
    expect(connA.send.mock.calls.length).toBeGreaterThan(before);
  });

  it("e. post-join top-level LOBBY does not gate later player applies (C3)", () => {
    const { server, connA } = makeServer();
    // Post-join stored state: top-level LOBBY (P3's view) while P1/P2 run.
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P3,
        status: "LOBBY",
        playerSnapshots: {
          [P1]: perPlayer("ROUND_ACTIVE"),
          [P2]: perPlayer("ROUND_ACTIVE"),
          [P3]: perPlayer("LOBBY"),
        },
        dbVersion: DBV,
      })
    );
    const before = connA.send.mock.calls.length;
    // P1 finishes round 1 — their apply's top-level ROUND_COMPLETE must not be
    // compared against the stored top-level LOBBY (which is P3's view).
    const laterDbv = {
      roundEventVersion: 51212,
      playerEventVersions: { [P1]: 15600, [P2]: 15599, [P3]: 0 },
    };
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P1,
        status: "ROUND_COMPLETE",
        playerSnapshots: {
          [P1]: perPlayer("ROUND_COMPLETE", laterDbv),
          [P2]: perPlayer("ROUND_ACTIVE", laterDbv),
          [P3]: perPlayer("LOBBY", laterDbv),
        },
        dbVersion: laterDbv,
      })
    );
    expect(connA.send.mock.calls.length).toBeGreaterThan(before);
    const lastA = JSON.parse(connA.send.mock.calls[connA.send.mock.calls.length - 1][0]);
    expect(lastA.snapshot.status).toBe("ROUND_COMPLETE");
  });

  it("f. START_PLAYER: active member with no map entry is LOBBY-eligible; an already-started member is gate-rejected", async () => {
    const { server, connC } = makeServer();
    (server as any).verifiedUids.set(connC.id, P3);
    // Stored state: top-level LOBBY (P3's join view); P3 is a member but has
    // no playerSnapshots entry — the warm-DO hole this task fixes.
    (server as any).applySnapshotAndBroadcast(
      makeAsyncSnapshot({
        viewerPlayerId: P3,
        status: "LOBBY",
        playerSnapshots: {
          [P1]: perPlayer("ROUND_ACTIVE"),
          [P2]: perPlayer("ROUND_ACTIVE"),
        },
        dbVersion: DBV,
      })
    );

    const p3Started = makeAsyncSnapshot({
      viewerPlayerId: P3,
      status: "ROUND_ACTIVE",
      playerSnapshots: {
        [P1]: perPlayer("ROUND_ACTIVE"),
        [P2]: perPlayer("ROUND_ACTIVE"),
        [P3]: perPlayer("ROUND_ACTIVE"),
      },
      dbVersion: DBV,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => p3Started,
    });
    vi.stubGlobal("fetch", fetchMock);

    await (server as any).onMessage(
      JSON.stringify({ type: "START_PLAYER", playerId: P3 }),
      connC as any
    );
    // The gate passed — the start-player API was reached.
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/start-player");

    // After the apply, the map holds P3:ROUND_ACTIVE — a repeat START_PLAYER
    // is rejected at the DO gate (API is authoritative + idempotent anyway).
    const callsBefore = (fetchMock.mock.calls.length);
    await (server as any).onMessage(
      JSON.stringify({ type: "START_PLAYER", playerId: P3 }),
      connC as any
    );
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    const lastC = JSON.parse(connC.send.mock.calls[connC.send.mock.calls.length - 1][0]);
    expect(lastC.type).toBe("ERROR");
    expect(lastC.message).toContain("LOBBY");
  });
});
