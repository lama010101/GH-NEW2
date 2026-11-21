"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { isUuid } from "@/core/isUuid";
import { getDbPool } from "@/server/db";
import {
  isEventReportStatus,
  type EventReportStatus,
} from "./queries";

// ADM-BUILD-REPORTTRIAGE-1117-507: triage one event_reports row. Status is
// limited to the CHECK-constrained values; the optional note lands in the
// existing resolution_note column (empty/absent keeps any prior note).
// resolved_at/resolved_by are stamped only for the terminal statuses
// ('upheld' | 'dismissed') and cleared again if the report is reopened.

export async function updateEventReportStatus(formData: FormData) {
  const session = await requireAdmin();

  const reportId = formData.get("reportId");
  const status = formData.get("status");
  const note = formData.get("note");

  if (typeof reportId !== "string" || !isUuid(reportId)) {
    throw new Error("Invalid report id");
  }
  if (typeof status !== "string" || !isEventReportStatus(status)) {
    throw new Error("Invalid status");
  }

  let noteText: string | null = null;
  if (typeof note === "string") {
    const trimmed = note.trim();
    noteText = trimmed.length > 0 ? trimmed : null;
  }

  const resolved = status === "upheld" || status === "dismissed";
  const pool = getDbPool();
  await pool.query(
    `UPDATE event_reports
     SET status = $2,
         updated_at = now(),
         resolved_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
         resolved_by = CASE WHEN $4::boolean THEN $3::uuid ELSE NULL END,
         resolution_note = COALESCE($5::text, resolution_note)
     WHERE id = $1`,
    [reportId, status as EventReportStatus, session.user.id, resolved, noteText]
  );
  revalidatePath("/admin/dashboard/reports");
}
