import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { loadEventLearn } from "@/server/learnEvent";
import { LEARN_MODES, type LearnMode } from "@/core/learnTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

function formatError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(
  request: Request,
  { params }: { params: { eventId: string } }
) {
  try {
    const supabase = createAuthenticatedServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return formatError("Unauthorized", 401);
    }

    const eventId = (params.eventId ?? "").trim();
    const { searchParams } = new URL(request.url);
    const gameId = (searchParams.get("gameId") ?? "").trim();
    const rawMode = searchParams.get("mode") ?? "";

    if (!UUID_RE.test(eventId)) {
      return formatError("Invalid eventId", 400);
    }
    if (!UUID_RE.test(gameId)) {
      return formatError("Invalid gameId", 400);
    }
    if (!LEARN_MODES.includes(rawMode as LearnMode)) {
      return formatError("Invalid mode", 400);
    }

    const result = await loadEventLearn({
      eventId,
      gameId,
      playerId: user.id,
      mode: rawMode as LearnMode,
    });

    if (result.status === "forbidden") {
      return formatError("Forbidden", 403);
    }
    if (result.status === "not_found") {
      return formatError("Event not found", 404);
    }

    return NextResponse.json(result.data, { headers: NO_STORE });
  } catch (error) {
    console.error("[learn/event] Failed to load learn data:", error);
    return formatError("Unable to load learn data", 500);
  }
}
