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

  // PartyKit broadcasts don't return individual responses
  // Return a success indicator - client should use WebSocket for state updates
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
      yearGuess?: unknown;
      locationGuess?: unknown;
      hintsUsed?: unknown;
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

    if (body.yearGuess !== null && body.yearGuess !== undefined && typeof body.yearGuess !== "number") {
      return NextResponse.json({ error: "yearGuess must be null or a number" }, { status: 400 });
    }

    if (
      body.locationGuess !== null &&
      body.locationGuess !== undefined &&
      (
        typeof body.locationGuess !== "object" ||
        typeof (body.locationGuess as { lat?: unknown }).lat !== "number" ||
        typeof (body.locationGuess as { lng?: unknown }).lng !== "number"
      )
    ) {
      return NextResponse.json({ error: "locationGuess must be null or a lat/lng pair" }, { status: 400 });
    }

    if (!Array.isArray(body.hintsUsed)) {
      return NextResponse.json({ error: "hintsUsed must be an array" }, { status: 400 });
    }

    await forwardToPartyKit(gameId, {
      type: "SUBMIT_GUESS",
      playerId: body.playerId,
      roundIndex: body.roundIndex,
      year: (body.yearGuess ?? null) as number | null,
      lat: (body.locationGuess as { lat?: number } | null)?.lat ?? null,
      lng: (body.locationGuess as { lng?: number } | null)?.lng ?? null,
      hintsUsed: (body.hintsUsed as string[]).length
    });

    return NextResponse.json({ success: true, forwarded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit guess";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
