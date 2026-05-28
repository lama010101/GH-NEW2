import { NextResponse } from "next/server";
import { completeRound } from "@/server/sessionCore";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const secret = request.headers.get("x-partykit-secret");
  if (!secret || secret !== process.env.PARTYKIT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let gameId = "";
  let body: { roundIndex?: number } = {};
  try {
    gameId = params.gameId.trim();
    body = (await request.json().catch(() => ({}))) as { roundIndex?: number };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    const snapshot = await completeRound({
      gameId,
      roundIndex: body.roundIndex,
      _executionContext: "api"
    });

    const results = await import("@/server/sessionCore").then(m =>
      m.getRoundResults(gameId, body.roundIndex!)
    );

    return NextResponse.json({ ...snapshot, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete round";
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      return NextResponse.json({ error: "ALREADY_COMPLETE" }, { status: 409 });
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
