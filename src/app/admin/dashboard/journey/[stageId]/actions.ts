"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";

// Historian's Journey — admin candidate approve/reject server actions
// (HJ-BUILD-ADMINREVIEW-CANDIDATES-001).
//
// Both actions start with requireAdmin() (defense-in-depth on top of
// middleware) and use the service-role pg pool, matching the
// models/actions.ts convention exactly.

export async function approveCandidate(jseId: string) {
  const session = await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE public.journey_stage_events
     SET approved_by = $1, approved_at = now(), updated_at = now()
     WHERE id = $2::uuid AND approved_by IS NULL`,
    [session.user.id, jseId]
  );
  revalidatePath("/admin/dashboard/journey");
}

export async function rejectCandidate(jseId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `DELETE FROM public.journey_stage_events WHERE id = $1::uuid`,
    [jseId]
  );
  revalidatePath("/admin/dashboard/journey");
}
