import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { setCompeteSubMode } from "@/server/sessionCore";

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
    const body = (await request.json().catch(() => ({}))) as { playerId?: unknown; mode?: unknown; sessionDeadlineDays?: unknown };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.mode !== "sync" && body.mode !== "async") {
      return NextResponse.json({ error: "mode must be 'sync' or 'async'" }, { status: 400 });
    }

    if (typeof body.sessionDeadlineDays !== "number" || !Number.isInteger(body.sessionDeadlineDays)) {
      return NextResponse.json({ error: "sessionDeadlineDays is required as an integer" }, { status: 400 });
    }

    const snapshot = await setCompeteSubMode({
      gameId,
      playerId: body.playerId,
      mode: body.mode,
      sessionDeadlineDays: body.sessionDeadlineDays,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update sub-mode";
    const status = message.includes("Session not found") || message.includes("Player not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
