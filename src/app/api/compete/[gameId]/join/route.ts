import { NextResponse } from "next/server";
import { joinCompeteSession } from "@/server/sessionCore";
import { verifyPartyKitSecret } from "@/server/partykitAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { playerId?: string; displayName?: string };

    console.log("[JOIN_ROUTE_START]", {
      gameId,
      playerId: body.playerId,
      displayName: body.displayName,
    });
    console.log("[JOIN_NOTIFY_TARGET]", {
      gameId,
      notifyUrl: `${process.env.NEXT_PUBLIC_PARTY_KIT_HOST || "localhost:1999"}/parties/lobby/${gameId}`,
    });

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const snapshot = await joinCompeteSession({
      gameId,
      displayName: body.displayName,
      playerId: body.playerId
    });

    console.log("[JOIN_DB_INSERT_OK]", {
      gameId,
      playerId: body.playerId,
      totalPlayers: snapshot.players.length,
      players: snapshot.players.map(p => ({ playerId: p.playerId, displayName: p.displayName })),
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join compete session";
    const status = message.includes("Session not found") ? 404 : 400;
    const code = (error as Error & { code?: string }).code;
    console.error("[JOIN_ROUTE_ERROR]", {
      gameId: params.gameId,
      error: message,
    });
    return NextResponse.json({ error: message, code }, { status });
  }
}
