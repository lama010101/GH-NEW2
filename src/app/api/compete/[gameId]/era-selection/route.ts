import { NextResponse } from "next/server";
import { verifyPartyKitSecret } from "@/server/partykitAuth";
import { setCompeteEraSelection } from "@/server/sessionCore";

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
      selectedEras?: unknown;
      yearMin?: unknown;
      yearMax?: unknown;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (!Array.isArray(body.selectedEras) || body.selectedEras.length === 0) {
      return NextResponse.json({ error: "selectedEras is required as a non-empty array" }, { status: 400 });
    }

    if (typeof body.yearMin !== "number" || typeof body.yearMax !== "number") {
      return NextResponse.json({ error: "yearMin and yearMax are required as numbers" }, { status: 400 });
    }

    const snapshot = await setCompeteEraSelection({
      gameId,
      playerId: body.playerId,
      selectedEras: body.selectedEras as string[],
      yearMin: body.yearMin,
      yearMax: body.yearMax,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update era selection";
    const status = message.includes("Session not found") || message.includes("Player not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
