"use server";

// EDQ-BUILD-ADMINGEN-1122-815 — accept/reject server actions for the admin
// image generator. requireAdmin() runs before any DB work. Accept is ONE
// transaction: images row INSERT + log status 'accepted'. The pre-existing
// primary image row is never touched — the new row simply takes
// display_order = MIN(display_order)-1 so it becomes primary.
// Reject flips the log to 'rejected' and inserts nothing.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/adminAuth";
import { isUuid } from "@/core/isUuid";
import { getDbPool } from "@/server/db";

export type AcceptResult = { ok: true; imageId: string };
export type RejectResult = { ok: true };

type LogRow = {
  id: string;
  status: string;
  event_id: string | null;
  candidate_id: string | null;
  image_url: string | null;
  storage_path: string | null;
  prompt: string | null;
  negative_prompt: string | null;
};

export async function acceptGeneratedImage(logId: string): Promise<AcceptResult> {
  await requireAdmin();
  if (!isUuid(logId)) throw new Error("Invalid log id");

  const pool = getDbPool();
  const client = await (
    pool as unknown as {
      connect(): Promise<{
        query: <T = Record<string, unknown>>(
          text: string,
          values?: unknown[]
        ) => Promise<{ rows: T[] }>;
        release(): void;
      }>;
    }
  ).connect();

  try {
    await client.query("BEGIN");
    const logRes = await client.query<LogRow>(
      `SELECT id, status, event_id, candidate_id, image_url, storage_path,
              prompt, negative_prompt
       FROM image_generation_log WHERE id = $1 FOR UPDATE`,
      [logId]
    );
    const log = logRes.rows[0];
    if (!log) throw new Error("log not found");
    if (log.status !== "completed") {
      throw new Error(`log status is '${log.status}', expected 'completed'`);
    }
    if (!log.image_url || !log.storage_path) {
      throw new Error("log has no stored image");
    }

    // Resolve the target event: direct event_id, else the candidate's
    // promoted event_id.
    let eventId = log.event_id;
    if (!eventId && log.candidate_id) {
      const cand = await client.query<{ event_id: string | null }>(
        `SELECT event_id FROM generation_candidates WHERE id = $1`,
        [log.candidate_id]
      );
      eventId = cand.rows[0]?.event_id ?? null;
    }
    if (!eventId) {
      throw new Error("no event_id resolvable for this generation");
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO images
         (event_id, url, storage_path, ai_prompt, negative_prompt,
          ai_generated, display_order)
       VALUES ($1, $2, $3, $4, $5, true,
         COALESCE((SELECT MIN(display_order) FROM images WHERE event_id = $1), 0) - 1)
       RETURNING id`,
      [eventId, log.image_url, log.storage_path, log.prompt, log.negative_prompt]
    );
    const imageId = ins.rows[0]?.id;
    if (!imageId) throw new Error("images insert returned no id");

    await client.query(
      `UPDATE image_generation_log SET status = 'accepted' WHERE id = $1 AND status = 'completed'`,
      [logId]
    );

    await client.query("COMMIT");
    revalidatePath("/admin/dashboard/generator");
    return { ok: true, imageId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectGeneratedImage(logId: string): Promise<RejectResult> {
  await requireAdmin();
  if (!isUuid(logId)) throw new Error("Invalid log id");

  const pool = getDbPool();
  await pool.query(
    `UPDATE image_generation_log SET status = 'rejected' WHERE id = $1 AND status = 'completed'`,
    [logId]
  );
  revalidatePath("/admin/dashboard/generator");
  return { ok: true };
}
