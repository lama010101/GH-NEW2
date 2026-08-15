import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import {
  getTransactionClient,
  loadSessionRow,
  loadCompeteSessionSnapshot,
  validateJoinEligibility,
} from "@/server/sessionCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export async function POST(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { invitation_id } = body as { invitation_id?: string };

  if (!invitation_id || !isValidUUID(invitation_id)) {
    return NextResponse.json({ error: "invitation_id is required and must be a valid UUID" }, { status: 400 });
  }

  let client: Awaited<ReturnType<typeof getTransactionClient>> | null = null;

  try {
    client = await getTransactionClient();
    await client.query("BEGIN");

    const invitationResult = await client.query<{
      id: string;
      game_id: string;
      invitee_id: string;
      status: string;
      expires_at: Date;
    }>(
      `SELECT id, game_id, invitee_id, status, expires_at
       FROM public.game_invitations
       WHERE id = $1 AND invitee_id = $2
       FOR UPDATE`,
      [invitation_id, user.id]
    );

    const gi = invitationResult.rows[0];

    if (!gi) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (gi.status !== "pending" || gi.expires_at.getTime() < Date.now()) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Invitation is no longer valid", code: "INVITATION_NO_LONGER_VALID" },
        { status: 409 }
      );
    }

    const [session, currentSnapshot] = await Promise.all([
      loadSessionRow(gi.game_id, client),
      loadCompeteSessionSnapshot(gi.game_id, null),
    ]);

    if (!session) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const eligibility = await validateJoinEligibility(
      client,
      gi.game_id,
      user.id,
      session,
      currentSnapshot
    );

    if (!eligibility.ok) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: eligibility.error, code: eligibility.code },
        { status: 409 }
      );
    }

    await client.query(
      `UPDATE public.game_invitations
       SET status = 'accepted'
       WHERE id = $1 AND status = 'pending'`,
      [invitation_id]
    );

    await client.query(
      `UPDATE public.notifications
       SET read = true
       WHERE user_id = $1
         AND type = 'lobby_invite'
         AND (
           payload->>'invitation_id' = $2
           OR (
             (payload->>'invitation_id') IS NULL
             AND payload->>'game_id' = $3
           )
         )`,
      [user.id, invitation_id, gi.game_id]
    );

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, game_id: gi.game_id });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[invitations/accept] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client?.release();
  }
}
