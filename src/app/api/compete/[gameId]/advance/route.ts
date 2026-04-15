import { NextResponse } from "next/server";

const PARTY_KIT_HOST = process.env.PARTY_KIT_HOST || "localhost:1999";

async function forwardToPartyKit(
  gameId: string,
  message: { type: string; [key: string]: unknown }
): Promise<unknown> {
  const url = `http://${PARTY_KIT_HOST}/party/${gameId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PartyKit-Message": JSON.stringify(message)
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `PartyKit request failed: ${response.status}`);
  }

  return { forwarded: true, type: message.type };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      playerId?: unknown;
      roundIndex?: unknown;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    if (typeof body.playerId !== "string") {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (typeof body.roundIndex !== "number" || !Number.isInteger(body.roundIndex)) {
      return NextResponse.json({ error: "roundIndex is required" }, { status: 400 });
    }

    await forwardToPartyKit(gameId, {
      type: "ADVANCE_ROUND",
      playerId: body.playerId,
      roundIndex: body.roundIndex
    });

    return NextResponse.json({ success: true, forwarded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to advance round";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
