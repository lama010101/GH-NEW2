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

  try {
    const { data: invitations, error: dbError } = await supabase
      .from("game_invitations")
      .select("id, game_id, inviter_id, created_at, expires_at")
      .eq("status", "pending")
      .eq("invitee_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(5);

    if (dbError) {
      return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 });
    }

    // Resolve each invitation's game mode (sync = rush, async = relax) from
    // the sessions table via the direct DB pool. The cookie-scoped Supabase
    // client is RLS-bound and may not read sessions, so we use the pool here.
    const gameIds = Array.from(new Set((invitations ?? []).map((i) => i.game_id)));
    const modeByGameId = new Map<string, string>();
    if (gameIds.length > 0) {
      const pool = getDbPool();
      const modeResult = await pool.query<{ game_id: string; mode: string }>(
        `SELECT game_id, mode FROM sessions WHERE game_id = ANY($1)`,
        [gameIds]
      );
      for (const row of modeResult.rows) {
        modeByGameId.set(row.game_id, row.mode);
      }
    }

    const invitesWithNames = await Promise.all(
      (invitations ?? []).map(async (invite) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", invite.inviter_id)
          .single();

        return {
          ...invite,
          inviter_name: profile?.display_name ?? "Unknown",
          avatar_url: profile?.avatar_url ?? undefined,
          mode: modeByGameId.get(invite.game_id) ?? undefined,
        };
      })
    );

    return NextResponse.json({ invitations: invitesWithNames });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
