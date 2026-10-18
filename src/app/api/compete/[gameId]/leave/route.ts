import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { recordPlayerLeft } from "@/server/sessionCore";

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

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    // recordPlayerLeft owns the membership write (left_at + host reassignment)
    // and re-evaluates the open round: if the leaver was the last unsubmitted
    // active player the round completes immediately (MP-FIX-LEFTPLAYER-ROUND-ADVANCE-001).
    const snapshot = await recordPlayerLeft({ gameId, playerId: body.playerId });
    if (!snapshot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record disconnect";
    console.error("[/api/compete/:gameId/leave]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
