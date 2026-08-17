"use server";

import { revalidatePath } from "next/cache";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
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

  if (!session) {
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

export async function updateAiPlayerMaxTokens(playerId: string, value: number) {
  const authSupabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await authSupabase.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  if (!Number.isInteger(value) || value < 256 || value > 8192) {
    throw new Error("max_tokens must be an integer between 256 and 8192");
  }

  const pool = getDbPool();
  await pool.query("UPDATE ai_players SET max_tokens = $1 WHERE id = $2", [
    value,
    playerId,
  ]);
  revalidatePath("/admin/openrouter");
}
