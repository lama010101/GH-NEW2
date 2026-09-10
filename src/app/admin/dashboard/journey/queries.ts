// Query helpers for the Historian's Journey admin candidate-review panel
// (HJ-BUILD-ADMINREVIEW-CANDIDATES-001).
//
// All queries use the service-role pg pool (getDbPool), consistent with the
// existing dashboard/queries.ts convention. No Supabase client is used.

import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Stage list — 10 journey_stages rows with per-stage candidate counts
// ---------------------------------------------------------------------------

export type StageSummaryRow = {
  id: string;
  stage_number: number;
  min_accuracy_pct: string;
  pool_size: number;
  total_candidates: number;
  approved_candidates: number;
  pending_candidates: number;
};

export async function fetchStageSummary(
  pool: Pool
): Promise<StageSummaryRow[]> {
  const { rows } = await pool.query<StageSummaryRow>(
    `
    SELECT
      s.id,
      s.stage_number,
      s.min_accuracy_pct::text AS min_accuracy_pct,
      s.pool_size,
      COUNT(jse.id)::int AS total_candidates,
      COUNT(jse.id) FILTER (WHERE jse.approved_by IS NOT NULL)::int AS approved_candidates,
      COUNT(jse.id) FILTER (WHERE jse.approved_by IS NULL)::int AS pending_candidates
    FROM public.journey_stages s
    LEFT JOIN public.journey_stage_events jse ON jse.stage_id = s.id
    GROUP BY s.id, s.stage_number, s.min_accuracy_pct, s.pool_size
    ORDER BY s.stage_number ASC
    `
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Stage drilldown — candidates for one stage, joined to events for display
// ---------------------------------------------------------------------------

export type CandidateRow = {
  id: string;
  event_id: string;
  approved_by: string | null;
  approved_at: string | null;
  stale_flag: boolean;
  title: string;
  event_year: number;
  description: string | null;
  category: string | null;
  theme: string | null;
  celebrity: boolean | null;
  real_event: boolean | null;
  status: string;
};

export async function fetchStageCandidates(
  pool: Pool,
  stageId: string
): Promise<CandidateRow[]> {
  const { rows } = await pool.query<CandidateRow>(
    `
    SELECT
      jse.id,
      jse.event_id,
      jse.approved_by,
      jse.approved_at,
      jse.stale_flag,
      e.title,
      e.event_year,
      e.description,
      e.category,
      e.theme,
      e.celebrity,
      e.real_event,
      e.status
    FROM public.journey_stage_events jse
    JOIN public.events e ON e.id = jse.event_id
    WHERE jse.stage_id = $1::uuid
    ORDER BY e.event_year ASC, jse.created_at ASC
    `,
    [stageId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Stage header — single row for the drilldown page header
// ---------------------------------------------------------------------------

export type StageHeaderRow = {
  id: string;
  stage_number: number;
  min_accuracy_pct: string;
  pool_size: number;
};

export async function fetchStageHeader(
  pool: Pool,
  stageId: string
): Promise<StageHeaderRow | null> {
  const { rows } = await pool.query<StageHeaderRow>(
    `
    SELECT
      id,
      stage_number,
      min_accuracy_pct::text AS min_accuracy_pct,
      pool_size
    FROM public.journey_stages
    WHERE id = $1::uuid
    `,
    [stageId]
  );
  return rows[0] ?? null;
}
