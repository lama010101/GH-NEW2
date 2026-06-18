import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: notifications, error: dbError } = await supabase
      .from("notifications")
      .select("id, type, payload, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (dbError) {
      console.error("[notifications] Database error:", dbError);
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }

    const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

    return NextResponse.json({
      notifications: notifications ?? [],
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("[notifications] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { ids } = body as { ids?: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids is required and must be a non-empty array" }, { status: 400 });
  }

  try {
    const { data, error: dbError } = await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", ids)
      .eq("user_id", user.id)
      .select("id");

    if (dbError) {
      console.error("[notifications] Failed to mark notifications as read:", dbError);
      return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
    }

    return NextResponse.json({ updated: data?.length ?? 0 });
  } catch (error) {
    console.error("[notifications] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
