import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if middleware refreshes sessions.
          }
        },
      },
    }
  );

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

    // Step 3: Insert into notifications
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
        },
      });

    if (notificationError) {
      console.error("[invitations/send] Failed to insert notification:", notificationError);
      return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
    }

    return NextResponse.json({ success: true, invitation_id: invitationId });
  } catch (error) {
    console.error("[invitations/send] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
