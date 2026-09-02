"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";
import { callOpenRouterChat } from "@/server/openrouter";

export async function addAiPlayer(input: {
  name: string;
  provider: string;
  model_id: string;
  avatar_url?: string | null;
}) {
  await requireAdmin();

  const name = input.name.trim();
  const provider = input.provider.trim();
  const model_id = input.model_id.trim();
  if (!name || !provider || !model_id) {
    throw new Error("name, provider, and model_id are required");
  }

  const pool = getDbPool();
  await pool.query(
    `INSERT INTO ai_players (name, provider, model_id, avatar_url)
     VALUES ($1, $2, $3, $4)`,
    [name, provider, model_id, input.avatar_url ?? null]
  );
  revalidatePath("/admin/dashboard");
}

export async function deactivateAiPlayer(playerId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE ai_players SET is_active = false WHERE id = $1`,
    [playerId]
  );
  revalidatePath("/admin/dashboard");
}

export async function reactivateAiPlayer(playerId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE ai_players SET is_active = true WHERE id = $1`,
    [playerId]
  );
  revalidatePath("/admin/dashboard");
}

export async function updateDailyCostCap(formData: FormData) {
  await requireAdmin();

  const playerId = formData.get("playerId");
  const capRaw = formData.get("cap");

  if (!playerId || typeof playerId !== "string") {
    throw new Error("playerId is required");
  }

  const capValue =
    capRaw === null || (typeof capRaw === "string" && capRaw.trim() === "")
      ? null
      : parseFloat(String(capRaw));

  if (capValue !== null && (!Number.isFinite(capValue) || capValue < 0)) {
    throw new Error("cap must be a non-negative number");
  }

  const pool = getDbPool();
  await pool.query(
    `UPDATE ai_players SET daily_cost_cap_usd = $1 WHERE id = $2`,
    [capValue, playerId]
  );
  revalidatePath("/admin/dashboard");
}

export async function testAiPlayerModel(modelId: string): Promise<{
  ok: boolean;
  content: string;
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    cost: number | null;
  };
  error: string | null;
  durationMs: number;
}> {
  await requireAdmin();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const result = await callOpenRouterChat({
    apiKey,
    model: modelId,
    messages: [
      {
        role: "system",
        content:
          "You are a test endpoint. Reply with a single short sentence confirming you are operational.",
      },
      { role: "user", content: "Ping. Reply with 'OK' and nothing else." },
    ],
    temperature: 0,
    maxTokens: 64,
  });

  return result;
}
