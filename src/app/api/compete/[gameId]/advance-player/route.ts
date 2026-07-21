import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { advancePlayerRoundAsync, loadCompeteSessionSnapshot } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let gameId = "";
  let body: { playerId?: string } = {};
  try {
    gameId = params.gameId.trim();
    body = (await request.json().catch(() => ({}))) as { playerId?: string };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const snapshot = await advancePlayerRoundAsync(gameId, body.playerId, "api");
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance player round";
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      const currentSnapshot = await loadCompeteSessionSnapshot(gameId, body.playerId ?? undefined);
      if (currentSnapshot) {
        return NextResponse.json(currentSnapshot);
      }
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
