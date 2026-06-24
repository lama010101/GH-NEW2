import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

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
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), 8000)
  );

  const handlerPromise = (async (): Promise<NextResponse> => {
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
  })();

  try {
    return await Promise.race([handlerPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    throw err;
  }
}
