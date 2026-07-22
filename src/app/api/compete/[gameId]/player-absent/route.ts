import { NextResponse } from "next/server";
import { markPlayerRoundAbsent, loadCompeteSessionSnapshot } from "@/server/sessionCore";
import { verifyPartyKitSecret } from "@/server/partykitAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  if (!verifyPartyKitSecret(request.headers.get("x-partykit-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameId = params.gameId.trim();
  if (gameId.length === 0) {
    return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    playerId?: unknown;
    roundIndex?: unknown;
  };

  if (typeof body.playerId !== "string" || !UUID_RE.test(body.playerId)) {
    return NextResponse.json({ error: "playerId must be a UUID" }, { status: 400 });
  }
  if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex) || body.roundIndex < 0) {
    return NextResponse.json({ error: "roundIndex must be a non-negative integer" }, { status: 400 });
  }

  try {
    const snapshot = await markPlayerRoundAbsent(gameId, body.playerId, body.roundIndex, "api");
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to mark player absent";
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      const currentSnapshot = await loadCompeteSessionSnapshot(gameId, body.playerId);
      if (currentSnapshot) {
        return NextResponse.json(currentSnapshot);
      }
    }
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
