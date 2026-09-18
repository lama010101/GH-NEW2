import { NextResponse } from "next/server";
import { startJourneyPlaythrough } from "@/server/journeyCore";
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

    const body = (await request.json().catch(() => ({}))) as { stageId?: string };

    if (typeof body.stageId !== "string" || body.stageId.length === 0) {
      return NextResponse.json({ error: "stageId is required" }, { status: 400 });
    }

    const result = await startJourneyPlaythrough({
      playerId: user.id,
      stageId: body.stageId,
      isAnonymous: user.is_anonymous ?? false,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start journey playthrough";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
