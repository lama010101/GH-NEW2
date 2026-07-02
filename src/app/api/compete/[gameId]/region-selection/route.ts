import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { setCompeteRegionSelection } from "@/server/sessionCore";

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
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: unknown;
      selectedRegions?: unknown;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (!Array.isArray(body.selectedRegions)) {
      return NextResponse.json({ error: "selectedRegions is required as an array" }, { status: 400 });
    }

    const snapshot = await setCompeteRegionSelection({
      gameId,
      playerId: body.playerId,
      selectedRegions: body.selectedRegions as string[],
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update region selection";
    const status = message.includes("Session not found") || message.includes("Player not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
