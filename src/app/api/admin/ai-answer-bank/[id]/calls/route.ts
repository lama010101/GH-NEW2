import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authSupabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await authSupabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  const pool = getDbPool();

  const { rows } = await pool.query(
    `
    SELECT
      id,
      turn_index,
      request_payload,
      response_payload,
      duration_ms,
      error,
      created_at::text AS created_at
    FROM ai_answer_bank_calls
    WHERE ai_answer_bank_id = $1
    ORDER BY turn_index ASC
    `,
    [id]
  );

  return NextResponse.json({ calls: rows });
}
