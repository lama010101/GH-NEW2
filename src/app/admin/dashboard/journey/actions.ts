"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { getDbPool } from "@/server/db";

// Historian's Journey — admin stage-status promote/demote server actions
// (HJ-BUILD-STAGESTATUS-PROMOTE-001).
//
// Both actions start with requireAdmin() and use the service-role pg pool,
// matching the [stageId]/actions.ts candidate approve/reject convention.
// Single-statement UPDATEs with a CASE state machine — one row, one column,
// atomic, no transaction block needed.

export async function promoteStage(stageId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE public.journey_stages
     SET status = CASE
           WHEN status = 'draft' THEN 'approved'
           WHEN status = 'approved' THEN 'live'
           ELSE status
         END,
         updated_at = now()
     WHERE id = $1::uuid AND status != 'live'`,
    [stageId]
  );
  revalidatePath("/admin/dashboard/journey");
}

export async function demoteStage(stageId: string) {
  await requireAdmin();

  const pool = getDbPool();
  await pool.query(
    `UPDATE public.journey_stages
     SET status = CASE
           WHEN status = 'live' THEN 'approved'
           WHEN status = 'approved' THEN 'draft'
           ELSE status
         END,
         updated_at = now()
     WHERE id = $1::uuid AND status != 'draft'`,
    [stageId]
  );
  revalidatePath("/admin/dashboard/journey");
}
