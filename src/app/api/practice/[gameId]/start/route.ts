import { NextResponse } from "next/server";
import { startCompeteSession } from "@/server/sessionCore";
import { TransitionCause } from "@/core/transitionCause";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gameId = params.gameId.trim();
    if (gameId.length === 0) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { playerId?: string };

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.playerId !== user.id) {
      return NextResponse.json({ error: "playerId must match authenticated user" }, { status: 403 });
    }

    const snapshot = await startCompeteSession({
      gameId,
      playerId: body.playerId,
      cause: TransitionCause.PLAYER,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start practice session";
    const status = message.includes("Session not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
