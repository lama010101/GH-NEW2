import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createAuthenticatedServerClient();

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
    const prefixPattern = `${query}%`;
    
    const { rows: players } = await pool.query(
      `SELECT p.id, p.display_name, p.avatar_url
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.id != $1
       AND (
         p.display_name ILIKE $2
         OR u.raw_user_meta_data->>'display_name' ILIKE $2
         OR u.raw_user_meta_data->>'full_name' ILIKE $2
         OR u.raw_user_meta_data->>'name' ILIKE $2
         OR u.raw_user_meta_data->>'username' ILIKE $2
         OR u.email ILIKE $2
       )
       ORDER BY
         CASE WHEN LOWER(p.display_name) = LOWER($3) THEN 0
              WHEN p.display_name ILIKE $4 THEN 1
              ELSE 2
         END,
         p.display_name ASC
       LIMIT 50`,
      [user.id, searchPattern, query, prefixPattern]
    );

    return NextResponse.json({ players });
  } catch (error) {
    console.error("[friends/search] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
