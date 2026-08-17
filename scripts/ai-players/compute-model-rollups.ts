import { config } from "dotenv";
import { getDbPool } from "@/server/db";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const WINDOWS = ["7d", "30d", "all"] as const;
type Window = (typeof WINDOWS)[number];

function windowStartClause(window: Window): string {
  if (window === "7d") return "now() - interval '7 days'";
  if (window === "30d") return "now() - interval '30 days'";
  return "'-infinity'::timestamptz";
}

type AiPlayer = {
  id: string;
  provider: string;
  model_id: string;
};

type AggregateRow = {
  sample_size: string;
  error_count: string;
  avg_cost: string | null;
  avg_total_tokens: string | null;
  avg_completion_tokens: string | null;
  latency_p50_ms: string | null;
  latency_p90_ms: string | null;
  latency_p99_ms: string | null;
  avg_round_accuracy: string | null;
  avg_location_accuracy: string | null;
  avg_year_accuracy: string | null;
  avg_difficulty_score: string | null;
  avg_authenticity_score: string | null;
  avg_image_quality_score: string | null;
};

type ErrorClassRow = {
  error_class: string | null;
  n: string;
};

async function computeRollup(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  player: AiPlayer,
  window: Window
): Promise<void> {
  const startClause = windowStartClause(window);

  const aggResult = await pool.query<AggregateRow>(
    `SELECT
      count(*) AS sample_size,
      count(*) FILTER (WHERE ef.error IS NOT NULL) AS error_count,
      avg(ef.cost) AS avg_cost,
      avg(ef.total_tokens) AS avg_total_tokens,
      avg(ef.completion_tokens) AS avg_completion_tokens,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (ef.response_received_at - ef.request_started_at)) * 1000
      ) AS latency_p50_ms,
      percentile_cont(0.9) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (ef.response_received_at - ef.request_started_at)) * 1000
      ) AS latency_p90_ms,
      percentile_cont(0.99) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (ef.response_received_at - ef.request_started_at)) * 1000
      ) AS latency_p99_ms,
      avg(ab.round_accuracy) AS avg_round_accuracy,
      avg(ab.location_accuracy) AS avg_location_accuracy,
      avg(ab.year_accuracy) AS avg_year_accuracy,
      avg(ef.difficulty_score) AS avg_difficulty_score,
      avg(ef.authenticity_score) AS avg_authenticity_score,
      avg(ef.image_quality_score) AS avg_image_quality_score
    FROM eval_facts ef
    LEFT JOIN ai_answer_bank ab ON ab.evaluation_id = ef.evaluation_id
    WHERE ef.ai_player_id = $1 AND ef.created_at >= ${startClause}`,
    [player.id]
  );

  const agg = aggResult.rows[0];
  const sampleSize = Number.parseInt(agg.sample_size, 10);

  if (sampleSize === 0) {
    return;
  }

  const errorClassResult = await pool.query<ErrorClassRow>(
    `SELECT edr.content->>'error_class' AS error_class, count(*) AS n
     FROM eval_facts ef
     JOIN eval_derived_results edr ON edr.evaluation_id = ef.evaluation_id
     WHERE ef.ai_player_id = $1 AND ef.created_at >= ${startClause}
     GROUP BY 1`,
    [player.id]
  );

  const errorClassBreakdown: Record<string, number> = {};
  for (const row of errorClassResult.rows) {
    const key = row.error_class ?? "none";
    errorClassBreakdown[key] = Number.parseInt(row.n, 10);
  }

  const toNum = (v: string | null): number | null => (v === null ? null : Number.parseFloat(v));

  const content = {
    error_rate: Number.parseInt(agg.error_count, 10) / sampleSize,
    error_class_breakdown: errorClassBreakdown,
    avg_cost: toNum(agg.avg_cost),
    avg_total_tokens: toNum(agg.avg_total_tokens),
    avg_completion_tokens: toNum(agg.avg_completion_tokens),
    latency_p50_ms: toNum(agg.latency_p50_ms),
    latency_p90_ms: toNum(agg.latency_p90_ms),
    latency_p99_ms: toNum(agg.latency_p99_ms),
    avg_round_accuracy: toNum(agg.avg_round_accuracy),
    avg_location_accuracy: toNum(agg.avg_location_accuracy),
    avg_year_accuracy: toNum(agg.avg_year_accuracy),
    avg_difficulty_score: toNum(agg.avg_difficulty_score),
    avg_authenticity_score: toNum(agg.avg_authenticity_score),
    avg_image_quality_score: toNum(agg.avg_image_quality_score),
  };

  await pool.query(
    `INSERT INTO eval_model_rollups (ai_player_id, provider, model_id, window_label, sample_size, content)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [player.id, player.provider, player.model_id, window, sampleSize, content]
  );

  console.log(
    `[ROLLUP] ${player.model_id} window=${window} sample_size=${sampleSize} error_rate=${content.error_rate.toFixed(3)}`
  );
}

async function main(): Promise<void> {
  const pool = getDbPool();

  const playersResult = await pool.query<AiPlayer>(
    "SELECT id, provider, model_id FROM ai_players ORDER BY model_id"
  );
  const players = playersResult.rows;
  console.log(`[ROLLUP] Computing rollups for ${players.length} AI players across windows: ${WINDOWS.join(", ")}`);

  for (const player of players) {
    for (const window of WINDOWS) {
      await computeRollup(pool, player, window);
    }
  }

  await pool.end();
  console.log("[ROLLUP] Done.");
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
