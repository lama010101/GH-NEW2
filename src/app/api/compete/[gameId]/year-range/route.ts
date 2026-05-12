import { NextResponse } from "next/server";
import { setCompeteYearRange } from "@/server/sessionCore";

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
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: unknown;
      yearMin?: unknown;
      yearMax?: unknown;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof body.yearMin !== "number" || typeof body.yearMax !== "number") {
      return NextResponse.json({ error: "yearMin and yearMax are required as numbers" }, { status: 400 });
    }

    const snapshot = await setCompeteYearRange({
      gameId,
      playerId: body.playerId,
      yearMin: body.yearMin,
      yearMax: body.yearMax,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update year range";
    const status = message.includes("Session not found") || message.includes("Player not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
