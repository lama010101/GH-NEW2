// AIP-BUILD-BUDGET-1103-004 — ONE shared spend aggregation so the admin
// Overview and the Daily runner's cap enforcement can never disagree.
//
// The cost expression is IDENTICAL to the one the Overview has always used:
//   COALESCE(SUM((c.response_payload->'usage'->>'cost')::numeric)
//     FILTER (WHERE c.response_payload IS NOT NULL), 0)
// over ai_answer_bank_calls, joined to ai_answer_bank for the player id
// (the calls table has no ai_player_id column).
//
// Date boundary: the UTC CALENDAR DATE. This task standardizes on the UTC
// date — the previous Overview used rolling '24 hours' / '7 days' windows.

import type { Pool } from "pg";
import { DEFAULT_FLEET_DAILY_CAP_USD } from "@/core/aiBudget";

export type SpendByPlayer = {
  byPlayer: Map<string, number>;
  total: number;
};

/**
 * Spend for a single UTC calendar date (`utcDate`, "YYYY-MM-DD"), grouped per
 * ai_player. `total` is the fleet-wide spend for that date.
 */
export async function fetchSpendTodayByPlayer(
  pool: Pick<Pool, "query">,
  utcDate: string
): Promise<SpendByPlayer> {
  const { rows } = await pool.query<{
    ai_player_id: string | null;
    cost: string | number;
  }>(
    `
    SELECT
      ab.ai_player_id,
      COALESCE(
        SUM((c.response_payload->'usage'->>'cost')::numeric)
          FILTER (WHERE c.response_payload IS NOT NULL),
        0
      ) AS cost
    FROM ai_answer_bank_calls c
    JOIN ai_answer_bank ab ON ab.id = c.ai_answer_bank_id
    WHERE c.created_at >= $1::date
      AND c.created_at < ($1::date + interval '1 day')
    GROUP BY ab.ai_player_id
    `,
    [utcDate]
  );
  const byPlayer = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const raw = typeof r.cost === "string" ? parseFloat(r.cost) : Number(r.cost);
    const cost = Number.isFinite(raw) ? raw : 0;
    if (r.ai_player_id) byPlayer.set(r.ai_player_id, cost);
    total += cost;
  }
  return { byPlayer, total };
}

/**
 * Fleet-wide daily cap in USD, from ai_fleet_settings.fleet_daily_cap_usd.
 * Missing row or non-positive/invalid value => DEFAULT_FLEET_DAILY_CAP_USD.
 * The query itself may throw — callers decide how to degrade (the runner
 * fails open, the admin page renders no cap card).
 */
export async function getFleetDailyCap(
  pool: Pick<Pool, "query">
): Promise<number | null> {
  const { rows } = await pool.query<{ value: unknown }>(
    `SELECT value FROM ai_fleet_settings WHERE key = 'fleet_daily_cap_usd'`
  );
  const raw = rows[0]?.value;
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FLEET_DAILY_CAP_USD;
}
