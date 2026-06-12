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

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || typeof query !== "string" || query.length < 1) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const searchPattern = `%${query}%`;
    
    const { rows: players } = await pool.query(
      `SELECT p.id, p.display_name, p.avatar_url
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.id != $1
       AND (
         p.display_name ILIKE $2
         OR u.raw_user_meta_data->>'display_name' ILIKE $2
       )
       LIMIT 10`,
      [user.id, searchPattern]
    );

    return NextResponse.json({ players });
  } catch (error) {
    console.error("[friends/search] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
