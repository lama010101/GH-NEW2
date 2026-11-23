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
      ab.*,
      p.name AS model_name,
      p.model_id,
      e.title AS event_title,
      CASE WHEN dc.date IS NOT NULL THEN 'Daily (inferred)' ELSE 'Practice' END AS mode
    FROM ai_answer_bank ab
    JOIN ai_players p ON p.id = ab.ai_player_id
    JOIN events e ON e.id = ab.event_id
    LEFT JOIN daily_challenges dc
      ON dc.date = ab.created_at::date AND ab.event_id = ANY(dc.event_ids)
    WHERE ab.id = $1
    LIMIT 1
    `,
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
