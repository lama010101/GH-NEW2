import { NextResponse } from "next/server";
import { completeJourneyPlaythrough } from "@/server/journeyCore";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { playthroughId?: string };

    if (typeof body.playthroughId !== "string" || body.playthroughId.length === 0) {
      return NextResponse.json({ error: "playthroughId is required" }, { status: 400 });
    }

    const result = await completeJourneyPlaythrough({
      playerId: user.id,
      playthroughId: body.playthroughId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete journey playthrough";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
