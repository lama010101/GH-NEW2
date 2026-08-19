import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

export async function PATCH() {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ push_soft_ask_dismissed: true })
    .eq("id", user.id);

  if (error) {
    console.error("[push-soft-ask] failed to update profile:", error);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, push_soft_ask_dismissed: true });
}
