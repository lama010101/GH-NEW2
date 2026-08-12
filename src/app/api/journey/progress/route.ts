import { NextResponse } from "next/server";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";
import type { JourneyStage, JourneyPlayerProgress, JourneyStageWithProgress, JourneyPlayerProgressStatus } from "@/core/journeyTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function GET() {
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDbPool();

    const [stagesResult, progressResult] = await Promise.all([
      db.query<JourneyStage>(
        `SELECT * FROM public.journey_stages ORDER BY stage_number ASC`
      ),
      db.query<JourneyPlayerProgress>(
        `SELECT * FROM public.journey_player_progress WHERE player_id = $1`,
        [user.id]
      ),
    ]);

    const stagesList = stagesResult.rows.map((stage) => ({
      ...stage,
      min_accuracy_pct: toNumber(stage.min_accuracy_pct),
      pool_size: toNumber(stage.pool_size),
      difficulty_rating: stage.difficulty_rating === null ? null : toNumber(stage.difficulty_rating),
      created_at: String(stage.created_at),
      updated_at: String(stage.updated_at),
    }));

    const progressByStageId = new Map<string, JourneyPlayerProgress>();
    for (const row of progressResult.rows) {
      progressByStageId.set(row.stage_id, {
        ...row,
        best_accuracy_pct: row.best_accuracy_pct === null ? null : toNumber(row.best_accuracy_pct),
        attempts_count: toNumber(row.attempts_count),
        first_completed_at: row.first_completed_at === null ? null : String(row.first_completed_at),
        last_played_at: row.last_played_at === null ? null : String(row.last_played_at),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      });
    }

    const result: JourneyStageWithProgress[] = [];
    let previousCompleted = false;

    for (const stage of stagesList) {
      const progress = progressByStageId.get(stage.id) ?? null;
      let computedStatus: JourneyPlayerProgressStatus;

      if (progress?.status === "completed") {
        computedStatus = "completed";
      } else if (progress?.status === "unlocked") {
        computedStatus = "unlocked";
      } else if (stage.stage_number === 1) {
        computedStatus = "unlocked";
      } else if (previousCompleted) {
        computedStatus = "unlocked";
      } else {
        computedStatus = "locked";
      }

      result.push({
        ...stage,
        progress,
        computed_status: computedStatus,
      });

      previousCompleted = computedStatus === "completed";
    }

    return NextResponse.json({ stages: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load journey progress";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
