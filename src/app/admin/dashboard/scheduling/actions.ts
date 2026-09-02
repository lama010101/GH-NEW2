"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";

// Scheduled (future) enable/disable of an AI player's per-mode active flag.
// Applied later by /api/cron/apply-ai-schedule-changes.
// Task: AIP-BUILD-PRODASHBOARD-FULLUIX-002.

export async function scheduleAiPlayerModeChange(formData: FormData) {
  await requireAdmin();

  const playerId = formData.get("playerId");
  const modeRaw = formData.get("mode");
  const targetRaw = formData.get("targetValue");
  const applyAtRaw = formData.get("applyAt");

  if (!playerId || typeof playerId !== "string") {
    throw new Error("playerId is required");
  }
  if (modeRaw !== "practice" && modeRaw !== "daily") {
    throw new Error("mode must be 'practice' or 'daily'");
  }
  if (targetRaw !== "enable" && targetRaw !== "disable") {
    throw new Error("targetValue must be 'enable' or 'disable'");
  }
  if (!applyAtRaw || typeof applyAtRaw !== "string") {
    throw new Error("applyAt is required");
  }

  const applyAt = new Date(applyAtRaw);
  if (Number.isNaN(applyAt.getTime())) {
    throw new Error("applyAt must be a valid date");
  }
  if (applyAt.getTime() <= Date.now()) {
    throw new Error("applyAt must be in the future");
  }

  const pool = getDbPool();
  await pool.query(
    `INSERT INTO ai_player_schedule_changes (ai_player_id, mode, target_value, apply_at)
     VALUES ($1, $2, $3, $4)`,
    [playerId, modeRaw, targetRaw === "enable", applyAt.toISOString()]
  );
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/dashboard/schedules");
}

export async function cancelScheduledChange(changeId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE ai_player_schedule_changes
     SET status = 'cancelled'
     WHERE id = $1 AND status = 'pending'`,
    [changeId]
  );
  revalidatePath("/admin/dashboard/schedules");
}
