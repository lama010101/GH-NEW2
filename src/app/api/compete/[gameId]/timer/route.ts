import { NextResponse } from "next/server";
import { setCompeteTimer } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const secret = request.headers.get("x-partykit-secret");
  if (!secret || secret !== process.env.PARTYKIT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown; roundTimerSec?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof body.roundTimerSec !== "number" || !Number.isInteger(body.roundTimerSec)) {
      return NextResponse.json({ error: "roundTimerSec is required as an integer" }, { status: 400 });
    }

    const snapshot = await setCompeteTimer({
      gameId,
      playerId: body.playerId,
      roundTimerSec: body.roundTimerSec,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update timer";
    const status = message.includes("Session not found") || message.includes("Player not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
