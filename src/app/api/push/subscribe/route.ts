import { NextRequest, NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UnsubscribeBody {
  endpoint?: string;
}

export async function POST(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof keys !== "object" ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "endpoint",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    console.error("[push/subscribe] upsert failed:", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: UnsubscribeBody = await request.json().catch(() => ({}));
  let query = supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (body.endpoint) {
    query = query.eq("endpoint", body.endpoint);
  }

  const { error } = await query;
  if (error) {
    console.error("[push/subscribe] delete failed:", error);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
