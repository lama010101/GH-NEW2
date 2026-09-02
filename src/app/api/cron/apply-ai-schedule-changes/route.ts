import { NextResponse } from "next/server";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

// Cron entrypoint that applies due scheduled AI-player mode changes.
// Task: AIP-BUILD-PRODASHBOARD-FULLUIX-002.
//
// Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the
// CRON_SECRET env var is configured. This route is NOT under /api/admin so
// the admin middleware does not cover it — the bearer check below is the gate.
// If CRON_SECRET is not configured the route is disabled (503), never open.

const MAX_ROWS_PER_INVOCATION = 100;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length === 0) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured — schedule applier disabled" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getDbPool();
  // Same transaction-capable cast pattern as src/server/sessionCore.ts:304.
  type CronTxClient = {
    query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    release(): void;
  };
  const client = await (
    pool as unknown as { connect(): Promise<CronTxClient> }
  ).connect();
  let applied = 0;
  try {
    // One row per transaction: the SELECT ... FOR UPDATE SKIP LOCKED and the
    // apply + mark-applied pair commit together, so a crash between the two
    // UPDATEs can never leave a half-applied change (it re-runs next tick).
    while (applied < MAX_ROWS_PER_INVOCATION) {
      await client.query("BEGIN");
      const { rows } = await client.query<{
        id: string;
        ai_player_id: string;
        mode: "practice" | "daily";
        target_value: boolean;
      }>(
        `SELECT id, ai_player_id, mode, target_value
         FROM ai_player_schedule_changes
         WHERE status = 'pending' AND apply_at <= now()
         ORDER BY apply_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      if (rows.length === 0) {
        await client.query("COMMIT");
        break;
      }
      const row = rows[0];
      const column =
        row.mode === "practice" ? "is_active_practice" : "is_active_daily";
      await client.query(
        `UPDATE ai_players SET ${column} = $1 WHERE id = $2`,
        [row.target_value, row.ai_player_id]
      );
      await client.query(
        `UPDATE ai_player_schedule_changes
         SET status = 'applied', applied_at = now()
         WHERE id = $1`,
        [row.id]
      );
      await client.query("COMMIT");
      applied++;
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection already broken — nothing to roll back
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        applied,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, applied });
}
