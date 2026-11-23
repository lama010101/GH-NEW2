import { NextResponse } from "next/server";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

function authError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "";
  return NextResponse.json(
    { error: msg === "Forbidden" ? "Forbidden" : "Unauthorized" },
    { status: msg === "Forbidden" ? 403 : 401 }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
  } catch (e) {
    return authError(e);
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
