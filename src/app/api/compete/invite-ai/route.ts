import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { addAiPlayerToSession, loadSessionRow } from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export async function POST(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { game_id, ai_player_id } = body as { game_id?: string; ai_player_id?: string };

  if (!game_id || !ai_player_id) {
    return NextResponse.json({ error: "game_id and ai_player_id are required" }, { status: 400 });
  }

  if (!isValidUUID(game_id) || !isValidUUID(ai_player_id)) {
    return NextResponse.json({ error: "Invalid UUID format for game_id or ai_player_id" }, { status: 400 });
  }

  try {
    const session = await loadSessionRow(game_id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Scope: sync (Rush) sessions only — reject async/relax and any other mode.
    if (session.mode !== "sync") {
      return NextResponse.json({ error: "AI players can only be invited to sync sessions" }, { status: 400 });
    }

    // Host authority, AI eligibility, capacity, and in-progress checks all run
    // inside addAiPlayerToSession's transaction (session_players is the
    // authority on host status; ai_players.is_active + deleted_at on eligibility).
    const snapshot = await addAiPlayerToSession({
      gameId: game_id,
      aiPlayerId: ai_player_id,
      requestingPlayerId: user.id,
    });

    return NextResponse.json({ success: true, players: snapshot.players });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add AI player";
    const code = (error as Error & { code?: string }).code;
    const status = code === "NOT_HOST"
      ? 403
      : message.includes("Session not found") ? 404 : 400;
    console.error("[INVITE_AI_ERROR]", { game_id, error: message, code });
    return NextResponse.json({ error: message, code }, { status });
  }
}
