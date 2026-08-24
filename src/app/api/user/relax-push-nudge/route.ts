import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

// GET — returns the current Relax push nudge dismissal state.
export async function GET() {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("relax_push_nudge_dismissed")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[relax-push-nudge] GET failed:", error);
    return NextResponse.json({ error: "Failed to read preference" }, { status: 500 });
  }

  return NextResponse.json({ relax_push_nudge_dismissed: Boolean(data?.relax_push_nudge_dismissed) });
}

// PATCH — marks the Relax push nudge as dismissed so it never shows again.
export async function PATCH() {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ relax_push_nudge_dismissed: true })
    .eq("id", user.id);

  if (error) {
    console.error("[relax-push-nudge] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, relax_push_nudge_dismissed: true });
}
