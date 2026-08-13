"use server";

import { revalidatePath } from "next/cache";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { isAdminEmail } from "@/middleware";
import { getDbPool } from "@/server/db";

export async function toggleAiPlayerMode(
  playerId: string,
  mode: "practice" | "daily",
  value: boolean
) {
  const authSupabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await authSupabase.auth.getSession();

  if (!session || !isAdminEmail(session.user.email)) {
    throw new Error("Unauthorized");
  }

  const column = mode === "practice" ? "is_active_practice" : "is_active_daily";
  const pool = getDbPool();
  await pool.query(`UPDATE ai_players SET ${column} = $1 WHERE id = $2`, [
    value,
    playerId,
  ]);
  revalidatePath("/admin/openrouter");
}
