import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { startCompeteSession } from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";

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
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const snapshot = await startCompeteSession({
      gameId,
      playerId: body.playerId,
      cause: TransitionCause.PLAYER
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start compete session";
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
