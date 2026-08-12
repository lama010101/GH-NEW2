import { redirect } from "next/navigation";
import { createAuthenticatedServerClient } from "@/core/supabaseServer";
import { getDbPool } from "@/server/db";

export const dynamic = "force-dynamic";

type ModelUsageRow = {
  model_id: string;
  model_name: string | null;
  total_calls: number;
  error_count: number;
  total_cost: string | number | null;
  total_tokens: number;
  last_call_at: string;
};

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCost(value: number): string {
  if (value === 0) return "0.000000";
  return value.toFixed(6);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function OpenRouterAdminPage() {
  const authSupabase = createAuthenticatedServerClient();
  const {
    data: { session },
  } = await authSupabase.auth.getSession();

  if (!session) {
    redirect("/login?next=/admin/openrouter");
  }

  const pool = getDbPool();

  const { rows } = await pool.query<ModelUsageRow>(`
    SELECT
      p.model_id AS model_id,
      MAX(p.name) AS model_name,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE c.response_payload IS NULL OR c.error IS NOT NULL)::int AS error_count,
      COALESCE(
        SUM((c.response_payload->'usage'->>'cost')::numeric)
        FILTER (WHERE c.response_payload IS NOT NULL),
        0
      ) AS total_cost,
      COALESCE(
        SUM(
          COALESCE((c.response_payload->'usage'->>'prompt_tokens')::int, 0) +
          COALESCE((c.response_payload->'usage'->>'completion_tokens')::int, 0)
        )
        FILTER (WHERE c.response_payload IS NOT NULL),
        0
      )::int AS total_tokens,
      MAX(c.created_at) AS last_call_at
    FROM ai_answer_bank_calls c
    JOIN ai_answer_bank ab ON ab.id = c.ai_answer_bank_id
    JOIN ai_players p ON p.id = ab.ai_player_id
    GROUP BY p.model_id
    ORDER BY total_cost DESC
  `);

  const perModel = rows.map((row) => ({
    modelId: row.model_id,
    modelName: row.model_name || row.model_id,
    totalCalls: row.total_calls,
    errorCount: row.error_count,
    totalCost: toNumber(row.total_cost),
    totalTokens: row.total_tokens,
    lastCallAt: row.last_call_at,
  }));

  const totalCalls = perModel.reduce((sum, row) => sum + row.totalCalls, 0);
  const totalErrors = perModel.reduce((sum, row) => sum + row.errorCount, 0);
  const totalCost = perModel.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = perModel.reduce((sum, row) => sum + row.totalTokens, 0);

  const overallLastCallAt =
    perModel.length > 0
      ? formatDateTime(
          perModel.reduce(
            (latest, row) => (row.lastCallAt > latest ? row.lastCallAt : latest),
            perModel[0].lastCallAt
          )
        )
      : "—";

  return (
    <main className="min-h-screen bg-gh-bg-base p-6 text-gh-text">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">OpenRouter Usage</h1>

        <div className="overflow-x-auto rounded-2xl border border-[var(--gh-border-default)] bg-gh-bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--gh-border-default)] text-gh-text-sec">
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 text-right font-semibold">Calls</th>
                <th className="px-4 py-3 text-right font-semibold">Errors</th>
                <th className="px-4 py-3 text-right font-semibold">Total Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Total Tokens</th>
                <th className="px-4 py-3 font-semibold">Last Call</th>
              </tr>
            </thead>
            <tbody>
              {perModel.map((row) => (
                <tr
                  key={row.modelId}
                  className="border-b border-[var(--gh-border-subtle)] last:border-b-0"
                >
                  <td className="px-4 py-3">{row.modelName}</td>
                  <td className="px-4 py-3 text-right">
                    {row.totalCalls.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.errorCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCost(row.totalCost)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gh-text-sec">
                    {formatDateTime(row.lastCallAt)}
                  </td>
                </tr>
              ))}
              {perModel.length > 0 && (
                <tr className="bg-gh-bg-elevated font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">
                    {totalCalls.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totalErrors.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCost(totalCost)}</td>
                  <td className="px-4 py-3 text-right">
                    {totalTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gh-text-sec">{overallLastCallAt}</td>
                </tr>
              )}
            </tbody>
          </table>
          {perModel.length === 0 && (
            <p className="px-4 py-6 text-gh-text-sec">No usage data yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
