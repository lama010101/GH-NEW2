import { NextResponse } from 'next/server'
import { recordReadyNext } from '@/server/sessionCore'

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const secret = request.headers.get("x-partykit-secret");
  if (!secret || secret !== process.env.PARTYKIT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameId = params.gameId;
  const body = await request.json();
  const { playerId, roundIndex, _executionContext } = body;

  if (typeof playerId !== "string" || !playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }
  if (typeof roundIndex !== "number") {
    return NextResponse.json({ error: "roundIndex required" }, { status: 400 });
  }

  try {
    await recordReadyNext({
      gameId,
      playerId,
      roundIndex,
      _executionContext
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
