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
    const { data: players, error: dbError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .neq("id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (dbError) {
      console.error("[players/recent] Database error:", dbError);
      return NextResponse.json({ error: "Failed to fetch recent players" }, { status: 500 });
    }

    return NextResponse.json({ players: players ?? [] });
  } catch (error) {
    console.error("[players/recent] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
