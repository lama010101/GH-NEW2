import { NextResponse } from "next/server";
import type { LatLng } from "@/core/types";
import { commitPracticeRound } from "@/server/practiceSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();
    const body = (await request.json().catch(() => ({}))) as {
      roundIndex?: unknown;
      yearGuess?: unknown;
      locationGuess?: unknown;
      hintsUsed?: unknown;
    };

    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
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

    if (body.hintsUsed !== undefined && !Array.isArray(body.hintsUsed)) {
      return NextResponse.json({ error: "hintsUsed must be an array of strings" }, { status: 400 });
    }

    if (Array.isArray(body.hintsUsed) && body.hintsUsed.some((hint) => typeof hint !== "string")) {
      return NextResponse.json({ error: "hintsUsed must contain only strings" }, { status: 400 });
    }

    const state = await commitPracticeRound({
      gameId,
      roundIndex: body.roundIndex,
      yearGuess: (body.yearGuess ?? null) as number | null,
      locationGuess: (body.locationGuess ?? null) as LatLng | null,
      hintsUsed: (body.hintsUsed ?? []) as string[]
    });

    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to commit round";
    const status = message === "Session not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
