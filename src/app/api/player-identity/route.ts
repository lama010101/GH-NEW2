import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

type PlayerIdentityRow = {
  player_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_ai: boolean;
};

export async function GET(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const pool = getDbPool();
  try {
    const { rows } = await pool.query<PlayerIdentityRow>(
      `SELECT id AS player_id, display_name, avatar_url, false AS is_ai
       FROM profiles
       WHERE id = $1
       UNION ALL
       SELECT id AS player_id, name AS display_name, avatar_url, true AS is_ai
       FROM ai_players
       WHERE id = $1 AND is_active = true
       ORDER BY is_ai ASC
       LIMIT 1`,
      [id]
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      playerId: row.player_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isAi: row.is_ai,
    });
  } catch (error) {
    console.error("[player-identity] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
