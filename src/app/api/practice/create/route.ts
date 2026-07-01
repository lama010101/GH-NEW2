import { NextResponse } from "next/server";
import type { CreateCompeteSessionInput } from "@/core/types";
import { createCompeteSession } from "@/server/sessionCore";
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

    const body = (await request.json().catch(() => ({}))) as Partial<CreateCompeteSessionInput>;

    if (typeof body.playerId !== "string" || body.playerId.length === 0) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (body.playerId !== user.id) {
      return NextResponse.json({ error: "playerId must match authenticated user" }, { status: 403 });
    }

    const snapshot = await createCompeteSession({
      displayName: body.displayName,
      playerId: body.playerId,
      mode: "practice",
      roundTimerSec: body.roundTimerSec,
      totalRounds: 5,
      yearMin: body.yearMin,
      yearMax: body.yearMax,
      selectedRegions: Array.isArray(body.selectedRegions) ? body.selectedRegions : undefined,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create practice session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
