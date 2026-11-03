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
