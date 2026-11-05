"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { isUuid } from "@/core/isUuid";
import { getDbPool } from "@/server/db";
import { AI_RATE_SETTING_KEYS } from "./fleetData";

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

// AIP-BUILD-BUDGET-1103-004: set the fleet-wide daily cost cap enforced by
// the Daily run. Value required, finite, 0.01–1000 USD.
export async function setFleetDailyCap(formData: FormData) {
  await requireAdmin();

  const capRaw = formData.get("cap");
  const capValue =
    capRaw === null || (typeof capRaw === "string" && capRaw.trim() === "")
      ? null
      : parseFloat(String(capRaw));

  if (
    capValue === null ||
    !Number.isFinite(capValue) ||
    capValue < 0.01 ||
    capValue > 1000
  ) {
    throw new Error("cap must be a number between 0.01 and 1000");
  }

  const pool = getDbPool();
  await pool.query(
    `INSERT INTO ai_fleet_settings (key, value)
     VALUES ('fleet_daily_cap_usd', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [JSON.stringify(capValue)]
  );
  revalidatePath("/admin/dashboard");
}

// AIP-BUILD-FLEETFINAL-1103-060 (E5): upsert the D3 rate-budget keys in
// ai_fleet_settings. Every numeric value must be finite and > 0;
// ai_rpm_overrides must parse to a JSON object of slug -> number > 0.
export async function updateRateSettings(formData: FormData) {
  await requireAdmin();

  const updates: [string, string][] = [];
  for (const key of AI_RATE_SETTING_KEYS) {
    const raw = formData.get(key);
    const text = raw === null ? "" : String(raw).trim();
    if (key === "ai_rpm_overrides") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("ai_rpm_overrides must be a JSON object of numbers");
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed as Record<string, unknown>).some(
          (v) => typeof v !== "number" || !Number.isFinite(v) || v <= 0
        )
      ) {
        throw new Error("ai_rpm_overrides must be a JSON object of numbers > 0");
      }
      updates.push([key, JSON.stringify(parsed)]);
      continue;
    }
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${key} must be a number > 0`);
    }
    updates.push([key, JSON.stringify(value)]);
  }

  const pool = getDbPool();
  for (const [key, json] of updates) {
    await pool.query(
      `INSERT INTO ai_fleet_settings (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
      [key, json]
    );
  }
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
