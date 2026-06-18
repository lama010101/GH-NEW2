import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(): Promise<{ user: { id: string } } | null> {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user };
}

export async function PATCH(_request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  let body: { display_name?: unknown };
  try {
    body = await _request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const displayNameRaw = body.display_name;
  if (typeof displayNameRaw !== "string") {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }

  const displayName = displayNameRaw.trim();
  if (displayName.length === 0) {
    return NextResponse.json({ error: "display_name cannot be empty" }, { status: 400 });
  }
  if (displayName.length > 40) {
    return NextResponse.json({ error: "display_name must be at most 40 characters" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    const { error: updateError } = await serviceRoleClient
      .from("profiles")
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[update-username] Failed to update profile:", updateError);
      return NextResponse.json({ error: "Failed to update username" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[update-username] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to update username" }, { status: 500 });
  }
}
