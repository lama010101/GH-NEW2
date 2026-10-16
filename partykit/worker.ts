// ============================================================================
// PartyServer (Cloudflare Workers) entry for the Compete realtime layer.
// TASK: PKMIG-BUILD-WORKERDEV-1016-020
//
// partykit/server.ts (GameServer) stays the single source of game logic. This
// file only adapts PartyServer's Server API to the `Room` shape GameServer was
// written against, and delegates every hook to it. No logic is duplicated.
//
//   PartyKit                       PartyServer
//   room.id                     -> this.name
//   room.env                    -> this.env
//   room.storage                -> this.ctx.storage
//   room.getConnection(s)()     -> this.getConnection(s)()
//   onMessage(message, sender)  -> onMessage(connection, message)   (SWAPPED)
//   static onBeforeConnect      -> routePartykitRequest option (reused below)
//
// KC-002: the shim deliberately has NO `broadcast`. GameServer must never call
// room.broadcast(); with no method present any regression throws loudly.
// ============================================================================

import { routePartykitRequest, Server } from "partyserver";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import GameServer from "./server";

// `type` (not `interface`) so Env stays assignable to Record<string, unknown>,
// which is what GameServer's Room.env and onBeforeConnect expect.
// `Lobby` is the Durable Object namespace binding; typed unknown because
// @cloudflare/workers-types is intentionally not added to this project's
// tsconfig (it would collide with the DOM lib used by the Next.js app).
export type Env = {
  Lobby: unknown;
  PARTYKIT_SECRET: string;
  SUPABASE_SECRET_KEY_PROD: string;
  SUPABASE_URL: string;
  NEXTJS_BASE_URL: string;
};

type Room = ConstructorParameters<typeof GameServer>[0];

// The slice of a PartyServer `Server` the shim reads. Narrow on purpose so the
// unit tests can build it without a Durable Object runtime.
export interface ShimSource {
  readonly name: string;
  readonly env: Record<string, unknown>;
  readonly ctx: { readonly storage: Room["storage"] };
  getConnection(id: string): Connection | undefined;
  getConnections(tag?: string): Iterable<Connection>;
}

export function createRoomShim(source: ShimSource): Room {
  let lastKnownId = "";
  return {
    // Lazy: PartyServer's `name` getter throws when the DO name cannot be
    // resolved. server.ts already reads the persisted storage `gameId` on its
    // alarm paths, so a failed lookup yields the last known id (or "").
    get id(): string {
      try {
        lastKnownId = source.name;
      } catch {
        // keep lastKnownId
      }
      return lastKnownId;
    },
    get env(): Record<string, unknown> {
      return source.env;
    },
    get storage(): Room["storage"] {
      return source.ctx.storage;
    },
    getConnection: (id: string) => source.getConnection(id),
    getConnections: (tag?: string) => source.getConnections(tag)
  } as Room;
}

export class Lobby extends Server<Env> {
  // server.ts keeps connections / verifiedUids / leave timers in memory, which
  // hibernation would wipe. Set explicitly, never rely on the default.
  static options = { hibernate: false };

  private readonly game: GameServer;

  constructor(ctx: ConstructorParameters<typeof Server>[0], env: Env) {
    super(ctx, env);
    // ctx/env are protected on the base class, so hand the shim an explicit source.
    const source: ShimSource = {
      get name(): string {
        return getName();
      },
      env,
      ctx,
      getConnection: (id) => this.getConnection(id),
      getConnections: (tag) => this.getConnections(tag)
    };
    const getName = (): string => this.name;
    this.game = new GameServer(createRoomShim(source));
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    await this.game.onConnect(connection, ctx);
  }

  // PartyServer passes (connection, message); GameServer expects (message, sender).
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    const text =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    await this.game.onMessage(text, connection);
  }

  async onClose(connection: Connection): Promise<void> {
    await this.game.onClose(connection);
  }

  async onAlarm(): Promise<void> {
    await this.game.onAlarm();
  }

  onError(connection: Connection, error: unknown): void {
    console.error("[PartyServer] onError", connection.id, error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env, {
        // Reused, not copied: verifies ?token= against Supabase and returns a
        // Request carrying x-verified-uid (or a 401/500 Response).
        onBeforeConnect: (req) => GameServer.onBeforeConnect(req, { env })
      })) || new Response("Not Found", { status: 404 })
    );
  }
};
