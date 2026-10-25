import { describe, it, expect, vi, beforeEach } from "vitest";

// `partyserver` imports "cloudflare:workers", which only exists inside workerd,
// so it is replaced by a minimal Server base that mirrors the parts of the real
// API the shim relies on (name from ctx.id.name, ctx, env, connection lookup).
vi.mock("partyserver", () => {
  class MockServer {
    static options: { hibernate?: boolean } = {};
    constructor(
      public ctx: {
        id: { name?: string };
        storage: Record<string, unknown>;
        connections: Map<string, unknown>;
      },
      public env: Record<string, unknown>
    ) {}
    get name(): string {
      if (!this.ctx.id.name) throw new Error("Cannot determine the name");
      return this.ctx.id.name;
    }
    getConnection(id: string) {
      return this.ctx.connections.get(id);
    }
    getConnections() {
      return this.ctx.connections.values();
    }
  }
  return { Server: MockServer, routePartykitRequest: vi.fn() };
});

// Delegation tests use a recording GameServer; the contract test further down
// loads the REAL one via importActual.
const { gameCalls, onBeforeConnectSpy } = vi.hoisted(() => ({
  gameCalls: [] as Array<{ hook: string; args: unknown[] }>,
  onBeforeConnectSpy: vi.fn()
}));
vi.mock("./server", () => ({
  default: class FakeGameServer {
    static onBeforeConnect = onBeforeConnectSpy;
    constructor(public room: unknown) {}
    onConnect = vi.fn(async (...args: unknown[]) => void gameCalls.push({ hook: "onConnect", args }));
    onMessage = vi.fn(async (...args: unknown[]) => void gameCalls.push({ hook: "onMessage", args }));
    onClose = vi.fn(async (...args: unknown[]) => void gameCalls.push({ hook: "onClose", args }));
    onAlarm = vi.fn(async (...args: unknown[]) => void gameCalls.push({ hook: "onAlarm", args }));
  }
}));

import { routePartykitRequest } from "partyserver";
import worker, { Lobby, createRoomShim } from "./worker";

function makeStorage() {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAlarm: vi.fn().mockResolvedValue(null),
    setAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAlarm: vi.fn().mockResolvedValue(undefined)
  };
}

function makeLobby(name: string | undefined = "game-1") {
  const connections = new Map<string, unknown>();
  const storage = makeStorage();
  const env = { PARTYKIT_SECRET: "s", NEXTJS_BASE_URL: "http://localhost:3000" };
  const ctx = { id: { name }, storage, connections };
  const lobby = new (Lobby as unknown as new (c: unknown, e: unknown) => Lobby)(ctx, env);
  return { lobby, ctx, env, storage, connections };
}

const conn = (id: string) => ({ id, send: vi.fn() });

beforeEach(() => {
  gameCalls.length = 0;
  onBeforeConnectSpy.mockReset();
  vi.mocked(routePartykitRequest).mockReset();
});

describe("Lobby shim", () => {
  it("disables hibernation explicitly", () => {
    expect((Lobby as unknown as { options: { hibernate: boolean } }).options).toEqual({
      hibernate: false
    });
  });

  it("swaps onMessage arguments: PartyServer (connection, message) -> GameServer (message, sender)", async () => {
    const { lobby } = makeLobby();
    const c = conn("c1");
    await lobby.onMessage(c as never, '{"type":"PING"}');
    expect(gameCalls).toEqual([{ hook: "onMessage", args: ['{"type":"PING"}', c] }]);
  });

  it("narrows binary messages to a string before delegating", async () => {
    const { lobby } = makeLobby();
    const c = conn("c1");
    const bytes = new TextEncoder().encode('{"type":"PING"}');
    await lobby.onMessage(c as never, bytes.buffer as ArrayBuffer);
    expect(gameCalls[0].args[0]).toBe('{"type":"PING"}');
    expect(gameCalls[0].args[1]).toBe(c);
  });

  it("builds the room shim with passthrough env/storage and lazy id", () => {
    const { lobby, env, storage } = makeLobby("game-42");
    const room = (lobby as unknown as { game: { room: Record<string, unknown> } }).game.room;
    expect(room.env).toBe(env);
    expect(room.storage).toBe(storage);
    expect(room.id).toBe("game-42");
  });

  it("id is lazy: resolves at read time and survives a failing name lookup", () => {
    let name: string | undefined;
    const shim = createRoomShim({
      get name(): string {
        if (!name) throw new Error("no name yet");
        return name;
      },
      env: {},
      ctx: { storage: makeStorage() },
      getConnection: () => undefined,
      getConnections: () => []
    });
    expect(shim.id).toBe("");
    name = "game-7";
    expect(shim.id).toBe("game-7");
    name = undefined;
    expect(shim.id).toBe("game-7");
  });

  it("construction does not throw when the DO name is unavailable (alarm cold path)", () => {
    expect(() => makeLobby(undefined)).not.toThrow();
  });

  it("shim has NO broadcast (KC-002) and forwards connection lookups", () => {
    const { lobby, connections } = makeLobby();
    const room = (lobby as unknown as { game: { room: Record<string, unknown> } }).game.room as {
      getConnection: (id: string) => unknown;
      getConnections: () => Iterable<unknown>;
    };
    const c = conn("c1");
    connections.set("c1", c);
    expect("broadcast" in room).toBe(false);
    expect((room as Record<string, unknown>).broadcast).toBeUndefined();
    expect(room.getConnection("c1")).toBe(c);
    expect([...room.getConnections()]).toEqual([c]);
  });

  it("round-trip: connect -> message -> close -> alarm all reach GameServer in order", async () => {
    const { lobby } = makeLobby();
    const c = conn("c1");
    const ctx = { request: new Request("http://x/parties/lobby/game-1", { headers: { "x-verified-uid": "u1" } }) };
    await lobby.onConnect(c as never, ctx as never);
    await lobby.onMessage(c as never, '{"type":"PING"}');
    await lobby.onClose(c as never);
    await lobby.onAlarm();
    expect(gameCalls.map((g) => g.hook)).toEqual(["onConnect", "onMessage", "onClose", "onAlarm"]);
    expect(gameCalls[0].args).toEqual([c, ctx]);
    expect(gameCalls[2].args).toEqual([c]);
  });
});

describe("worker fetch", () => {
  it("delegates onBeforeConnect to GameServer.onBeforeConnect with { env } and returns its result", async () => {
    const forwarded = new Request("http://x/parties/lobby/g?token=t", { headers: { "x-verified-uid": "u1" } });
    onBeforeConnectSpy.mockResolvedValue(forwarded);
    vi.mocked(routePartykitRequest).mockImplementation(async (_req, _env, opts) => {
      const out = await opts?.onBeforeConnect?.(_req, {} as never);
      return new Response(out === forwarded ? "forwarded" : "other");
    });
    const env = { PARTYKIT_SECRET: "s" } as never;
    const req = new Request("http://x/parties/lobby/g?token=t");
    const res = await worker.fetch(req, env);
    expect(await res.text()).toBe("forwarded");
    expect(onBeforeConnectSpy).toHaveBeenCalledWith(req, { env });
  });

  it("returns 404 when no party route matches", async () => {
    vi.mocked(routePartykitRequest).mockResolvedValue(null);
    const res = await worker.fetch(new Request("http://x/nope"), {} as never);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
});

describe("contract with the REAL GameServer", () => {
  it("accepts the shim and routes onMessage errors back to the connection (proves arg order end-to-end)", async () => {
    const actual = await vi.importActual<typeof import("./server")>("./server");
    const connections = new Map<string, unknown>();
    const shim = createRoomShim({
      name: "game-1",
      env: { PARTYKIT_SECRET: "s", NEXTJS_BASE_URL: "http://localhost:3000" },
      ctx: { storage: makeStorage() },
      getConnection: (id) => connections.get(id) as never,
      getConnections: () => connections.values() as never
    });
    const real = new actual.default(shim);
    const c = conn("c1");
    await real.onMessage("not json", c);
    expect(c.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(c.send.mock.calls[0][0] as string)).toMatchObject({
      type: "ERROR",
      message: "Invalid message format"
    });
  });
});
