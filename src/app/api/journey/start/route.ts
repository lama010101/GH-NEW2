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

    const body = (await request.json().catch(() => ({}))) as {
      stageId?: string;
      stageNumber?: number;
    };

    // Optional stageNumber (GUEST-BUILD-ANONSIGNIN-1029-003): callers that
    // only know the stage number (e.g. the guest-first landing Play Now,
    // which always targets stage 1) let the server resolve the stage id.
    // The existing stageId path is unchanged and takes precedence.
    let stageId =
      typeof body.stageId === "string" && body.stageId.length > 0
        ? body.stageId
        : null;

    if (stageId === null && typeof body.stageNumber === "number") {
      const { data: stageRow, error: stageError } = await supabase
        .from("journey_stages")
        .select("id")
        .eq("stage_number", body.stageNumber)
        .maybeSingle();
      if (stageError || !stageRow) {
        return NextResponse.json(
          { error: "Journey stage not found" },
          { status: 404 }
        );
      }
      stageId = stageRow.id as string;
    }

    if (stageId === null) {
      return NextResponse.json({ error: "stageId is required" }, { status: 400 });
    }

    const result = await startJourneyPlaythrough({
      playerId: user.id,
      stageId,
      isAnonymous: user.is_anonymous ?? false,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start journey playthrough";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
