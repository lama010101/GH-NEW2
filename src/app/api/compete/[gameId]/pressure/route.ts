import { NextResponse } from 'next/server'
import { recordPressureApplied } from '@/server/sessionCore'

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
  const { roundIndex, newRoundEndsAt, clampedToSec, _executionContext } = body;

  if (typeof roundIndex !== "number") {
    return NextResponse.json({ error: "roundIndex required" }, { status: 400 });
  }
  if (typeof newRoundEndsAt !== "string" || !newRoundEndsAt) {
    return NextResponse.json({ error: "newRoundEndsAt required" }, { status: 400 });
  }
  if (typeof clampedToSec !== "number") {
    return NextResponse.json({ error: "clampedToSec required" }, { status: 400 });
  }

  try {
    await recordPressureApplied({
      gameId,
      roundIndex,
      newRoundEndsAt,
      clampedToSec,
      _executionContext
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
