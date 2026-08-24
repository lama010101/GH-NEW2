"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
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
