import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

async function getAuthenticatedUser(): Promise<{ user: { id: string }; supabase: ReturnType<typeof createAuthenticatedServerClient> } | null> {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user, supabase };
}

// POST /api/players/follow - Follow a player
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const { followed_id } = body as { followed_id?: string };

  if (!followed_id || typeof followed_id !== "string") {
    return NextResponse.json({ error: "followed_id is required" }, { status: 400 });
  }

  if (!isValidUUID(followed_id)) {
    return NextResponse.json({ error: "Invalid UUID format for followed_id" }, { status: 400 });
  }

  if (followed_id === user.id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    const { error } = await serviceRoleClient
      .from("player_follows")
      .insert({
        follower_id: user.id,
        followed_id: followed_id,
      });

    if (error && error.code !== "23505") {
      // 23505 is unique_violation (already following) - treat as success
      console.error("[players/follow] Failed to insert follow:", error);
      return NextResponse.json({ error: "Failed to follow player" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[players/follow] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to follow player" }, { status: 500 });
  }
}

// DELETE /api/players/follow - Unfollow a player
export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const { followed_id } = body as { followed_id?: string };

  if (!followed_id || typeof followed_id !== "string") {
    return NextResponse.json({ error: "followed_id is required" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    await serviceRoleClient
      .from("player_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followed_id", followed_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[players/follow] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to unfollow player" }, { status: 500 });
  }
}

// GET /api/players/follow - List followed players
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const supabaseAuth = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    const { data, error } = await serviceRoleClient
      .from("player_follows")
      .select(`
        followed_id,
        created_at,
        profiles:followed_id (display_name, avatar_url)
      `)
      .eq("follower_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[players/follow] Failed to load follows:", error);
      return NextResponse.json({ error: "Failed to load follows" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const follows = (data || []).map((row: any) => ({
      followed_id: row.followed_id,
      display_name: row.profiles?.display_name || null,
      avatar_url: row.profiles?.avatar_url || null,
      created_at: row.created_at,
    }));

    return NextResponse.json({ follows });
  } catch (error) {
    console.error("[players/follow] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to load follows" }, { status: 500 });
  }
}
