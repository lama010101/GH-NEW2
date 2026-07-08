import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.substring(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getDbPool();
    const { rows: players } = await pool.query(
      `WITH tier_followed AS (
         SELECT pf.followed_id AS pid, 1 AS priority, pf.created_at AS sort_key
         FROM public.player_follows pf
         WHERE pf.follower_id = $1
       ),
       tier_shared AS (
         SELECT sp_other.player_id AS pid, 2 AS priority, MAX(sp_other.joined_at) AS sort_key
         FROM public.session_players sp_other
         WHERE sp_other.game_id IN (SELECT game_id FROM public.session_players WHERE player_id = $1)
           AND sp_other.player_id != $1
         GROUP BY sp_other.player_id
       ),
       tier_newest AS (
         SELECT p.id AS pid, 3 AS priority, p.created_at AS sort_key
         FROM public.profiles p
         WHERE p.id != $1
       ),
       combined AS (
         SELECT * FROM tier_followed
         UNION ALL
         SELECT * FROM tier_shared
         UNION ALL
         SELECT * FROM tier_newest
       ),
       deduped AS (
         SELECT DISTINCT ON (pid) pid, priority, sort_key
         FROM combined
         ORDER BY pid, priority ASC
       )
       SELECT p.id, p.display_name, p.avatar_url
       FROM deduped d
       JOIN public.profiles p ON p.id = d.pid
       ORDER BY d.priority ASC, d.sort_key DESC NULLS LAST
       LIMIT 100`,
      [user.id]
    );

    return NextResponse.json({ players });
  } catch (error) {
    console.error("[players/recent] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
