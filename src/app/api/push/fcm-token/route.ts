import { NextRequest, NextResponse } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";
import { rejectIfGuest } from "@/server/guestGate";

export const dynamic = "force-dynamic";

interface RegisterTokenBody {
  token: string;
  platform: "android";
}

interface DeleteTokenBody {
  token?: string;
}

function isValidToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 20 && token.length <= 4096;
}

export async function POST(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guest = rejectIfGuest(user);
  if (guest) return guest;

  let body: RegisterTokenBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, platform } = body;
  if (!isValidToken(token) || platform !== "android") {
    return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
  }

  // A FCM registration token identifies one app install on one device. When a
  // device changes hands (shared-device handoff), the token must move to the
  // most recent registrant, so delete it from any OTHER user first.
  const serviceRoleClient = createSupabaseServerClient();
  const { error: deleteError } = await serviceRoleClient
    .from("fcm_tokens")
    .delete()
    .eq("token", token)
    .neq("user_id", user.id);

  if (deleteError) {
    console.error("[push/fcm-token] failed to remove conflicting token:", deleteError);
  }

  const { error } = await serviceRoleClient.from("fcm_tokens").upsert(
    {
      user_id: user.id,
      token,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,token",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    console.error("[push/fcm-token] upsert failed:", error);
    return NextResponse.json({ error: "Failed to save token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const body: DeleteTokenBody = await request.json().catch(() => ({}));
  const token = body.token;

  // Always 204 and never reveal whether the token existed. A FCM token is an
  // unguessable bearer credential, so without a session rows matching the token
  // alone may be deleted (this only removes a registration). With a session the
  // delete is scoped to that user's row for the token.
  if (!isValidToken(token)) {
    return new NextResponse(null, { status: 204 });
  }

  const serviceRoleClient = createSupabaseServerClient();
  let query = serviceRoleClient.from("fcm_tokens").delete().eq("token", token);
  if (user) {
    query = query.eq("user_id", user.id);
  }

  const { error } = await query;
  if (error) {
    console.error("[push/fcm-token] delete failed:", error);
  }

  return new NextResponse(null, { status: 204 });
}
