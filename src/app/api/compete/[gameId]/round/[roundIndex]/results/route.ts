import { NextResponse } from "next/server";
import { getRoundResults, assertParticipantOrPartyKit } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string; roundIndex: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const roundIndex = parseInt(params.roundIndex, 10);

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (!Number.isInteger(roundIndex) || roundIndex < 0) {
      return NextResponse.json({ error: "roundIndex must be a non-negative integer" }, { status: 400 });
    }

    const auth = await assertParticipantOrPartyKit(request, gameId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const results = await getRoundResults(gameId, roundIndex);

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to get round results";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
