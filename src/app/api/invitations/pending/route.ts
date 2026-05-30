import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
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
          } catch {}
        },
      },
    }
  );

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
        };
      })
    );

    return NextResponse.json({ invitations: invitesWithNames });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
