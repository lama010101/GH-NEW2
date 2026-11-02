"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { isUuid } from "@/core/isUuid";
import { getDbPool } from "@/server/db";

export async function toggleAiPlayerMode(
  playerId: string,
  mode: "practice" | "daily",
  value: boolean
) {
  await requireAdmin();

  const column = mode === "practice" ? "is_active_practice" : "is_active_daily";
  const pool = getDbPool();
  await pool.query(`UPDATE ai_players SET ${column} = $1 WHERE id = $2`, [
    value,
    playerId,
  ]);
  revalidatePath("/admin/dashboard");
}

// AIP-BUILD-FLEETHALT-1102-043: mark an open fleet alert resolved.
export async function resolveFleetAlert(alertId: string) {
  await requireAdmin();

  if (!isUuid(alertId)) throw new Error("Invalid alert id");

  const pool = getDbPool();
  await pool.query(
    `UPDATE ai_fleet_alerts SET resolved_at = now() WHERE id = $1 AND resolved_at IS NULL`,
    [alertId]
  );
  revalidatePath("/admin/dashboard");
}
