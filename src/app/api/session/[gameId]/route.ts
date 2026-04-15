import { NextResponse } from "next/server";
import { loadPracticeSessionState } from "@/server/practiceSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const gameId = params.gameId.trim();

    if (gameId.length === 0) {
      console.error("[API_SESSION_FETCH_ERROR] Missing gameId", { timestamp: Date.now() });
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    console.log("[API_SESSION_FETCH_START]", { gameId, timestamp: Date.now() });

    const state = await loadPracticeSessionState(gameId);
    if (!state) {
      console.error("[API_SESSION_FETCH_ERROR] Session not found", { gameId, timestamp: Date.now() });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const payloadSize = JSON.stringify(state).length;
    console.log("[API_SESSION_FETCH_SUCCESS]", { gameId, phase: state.phase, payloadSize, timestamp: Date.now() });

    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load session";
    console.error("[API_SESSION_FETCH_ERROR]", {
      gameId: params.gameId,
      error: message,
      rawError: error,
      timestamp: Date.now()
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
