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

    // Resolve each invitation's game mode (sync = rush, async = relax) and
    // session_deadline from the sessions table via the direct DB pool. The
    // cookie-scoped Supabase client is RLS-bound and may not read sessions,
    // so we use the pool here.
    const gameIds = Array.from(new Set((invitations ?? []).map((i) => i.game_id)));
    const sessionInfoByGameId = new Map<string, {
      mode: string;
      session_deadline: string | null;
      session_created_at: string;
      session_deadline_days: number | null;
    }>();
    if (gameIds.length > 0) {
      const pool = getDbPool();
      const sessionResult = await pool.query<{
        game_id: string;
        mode: string;
        session_deadline: Date | null;
        created_at: Date;
        session_deadline_days: number | null;
      }>(
        `SELECT game_id, mode, session_deadline, created_at, session_deadline_days FROM sessions WHERE game_id = ANY($1)`,
        [gameIds]
      );
      for (const row of sessionResult.rows) {
        sessionInfoByGameId.set(row.game_id, {
          mode: row.mode,
          session_deadline: row.session_deadline ? new Date(row.session_deadline).toISOString() : null,
          session_created_at: new Date(row.created_at).toISOString(),
          session_deadline_days: row.session_deadline_days,
        });
      }
    }

    // Filter out invitations for async (Relax) sessions whose session_deadline
    // has passed. Sync (Rush) sessions have session_deadline = NULL and are
    // never filtered by this check.
    const now = Date.now();
    const visibleInvitations = (invitations ?? []).filter((invite) => {
      const sessionInfo = sessionInfoByGameId.get(invite.game_id);
      if (!sessionInfo) return true;
      if (sessionInfo.session_deadline !== null && new Date(sessionInfo.session_deadline).getTime() < now) {
        return false;
      }
      return true;
    });

    const invitesWithNames = await Promise.all(
      visibleInvitations.map(async (invite) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", invite.inviter_id)
          .single();

        const sessionInfo = sessionInfoByGameId.get(invite.game_id);
        return {
          ...invite,
          inviter_name: profile?.display_name ?? "Unknown",
          avatar_url: profile?.avatar_url ?? undefined,
          mode: sessionInfo?.mode ?? undefined,
          session_deadline: sessionInfo?.session_deadline ?? undefined,
          session_created_at: sessionInfo?.session_created_at ?? undefined,
          session_deadline_days: sessionInfo?.session_deadline_days ?? undefined,
        };
      })
    );

    return NextResponse.json({ invitations: invitesWithNames });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
