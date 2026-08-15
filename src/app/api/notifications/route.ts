import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getDbPool();

  try {
    const { rows } = await pool.query<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
      read: boolean;
      created_at: Date;
    }>(
      `SELECT n.id, n.type, n.payload, n.read, n.created_at
       FROM notifications n
       WHERE n.user_id = $1
         AND (
           n.type != 'lobby_invite'
           OR EXISTS (
             SELECT 1
             FROM game_invitations gi
             WHERE gi.status = 'pending'
               AND gi.expires_at >= now()
               AND (
                 gi.id = ((n.payload->>'invitation_id')::uuid)
                 OR (
                   (n.payload->>'invitation_id') IS NULL
                   AND gi.game_id = ((n.payload->>'game_id')::uuid)
                   AND gi.invitee_id = n.user_id
                 )
               )
           )
         )
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const notifications = rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      read: row.read,
      created_at: row.created_at.toISOString(),
    }));

    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications,
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
