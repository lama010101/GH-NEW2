import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";
import { sendPushToUser } from "@/server/pushSender";
import { resolveNotificationChannel } from "@/server/notificationPrefs";
import { DEFAULT_NOTIFICATION_CHANNEL, type NotificationChannel } from "@/core/notificationTypes";

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
  const { game_id, invitee_id } = body as { game_id?: string; invitee_id?: string };

  if (!game_id || !invitee_id) {
    return NextResponse.json({ error: "game_id and invitee_id are required" }, { status: 400 });
  }

  if (!isValidUUID(game_id) || !isValidUUID(invitee_id)) {
    return NextResponse.json({ error: "Invalid UUID format for game_id or invitee_id" }, { status: 400 });
  }

  if (invitee_id === user.id) {
    return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    // Step 1: Upsert into game_invitations
    const { data: inviteData, error: inviteError } = await serviceRoleClient
      .from("game_invitations")
      .upsert({
        game_id,
        inviter_id: user.id,
        invitee_id,
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: "game_id,invitee_id"
      })
      .select("id")
      .single();

    if (inviteError) {
      console.error("[invitations/send] Failed to upsert game_invitation:", inviteError);
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    const invitationId = inviteData.id;

    // Step 2: Fetch inviter's display_name
    const { data: profileData, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[invitations/send] Failed to fetch inviter profile:", profileError);
      return NextResponse.json({ error: "Failed to fetch inviter profile" }, { status: 500 });
    }

    const inviterName = profileData.display_name || user.email?.split("@")[0] || "Unknown";

    // Step 3: Resolve game mode (sync = rush, async = relax) so the recipient's
    // notification can display the game type instead of generic invite text.
    const { data: sessionData } = await serviceRoleClient
      .from("sessions")
      .select("mode")
      .eq("game_id", game_id)
      .single();

    const mode = sessionData?.mode ?? undefined;

    // Async (Anytime/Relax) sessions defer the invite notification to the
    // session's first round-0 start (see startRelaxPlayer in sessionCore),
    // so nothing is sent here for them.
    if (mode !== "async") {
      // Step 4: Resolve the invitee's lobby_invite channel preference and gate
      // delivery on it. The game_invitations row above is always created;
      // prefs only gate the notification row + push. 'none' skips both,
      // 'push' push-only, 'in_app' row-only, 'both' keeps current behavior.
      // A prefs read failure must never block an invite: fall back to 'both'.
      let channel: NotificationChannel = DEFAULT_NOTIFICATION_CHANNEL;
      try {
        channel = await resolveNotificationChannel(invitee_id, "lobby_invite");
      } catch (prefsError) {
        console.error(
          "[invitations/send] notification prefs lookup failed, defaulting to 'both':",
          prefsError
        );
      }

      const insertInApp = channel === "in_app" || channel === "both";
      const sendPush = channel === "push" || channel === "both";

      if (insertInApp) {
        const { error: notificationError } = await serviceRoleClient
          .from("notifications")
          .insert({
            user_id: invitee_id,
            type: "lobby_invite",
            payload: {
              game_id,
              inviter_id: user.id,
              inviter_name: inviterName,
              invitation_id: invitationId,
              mode,
            },
          });

        if (notificationError) {
          console.error("[invitations/send] Failed to insert notification:", notificationError);
          return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
        }
      }

      if (sendPush) {
        await sendPushToUser(invitee_id, {
          body: `${inviterName} invited you to a game`,
          url: `/compete/${game_id}`,
          tag: `lobby_invite:${game_id}:${invitee_id}`,
          ttl: 900,
          urgency: 'high',
        });
      }
    }

    return NextResponse.json({ success: true, invitation_id: invitationId });
  } catch (error) {
    console.error("[invitations/send] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
