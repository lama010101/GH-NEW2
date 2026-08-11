import { getDbPool } from "@/server/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "OpenRouter Admin",
};

interface PlayerSummary {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  is_active: boolean;
  avatar_url: string | null;
  total_calls: string;
  successful_calls: string;
  error_calls: string;
  total_cost: string;
  total_tokens: string;
  last_activity: Date | null;
}

interface DailyStat {
  day: Date;
  calls: string;
  cost: string;
}

const playerSql = `
WITH call_stats AS (
  SELECT
    ab.ai_player_id,
    c.id AS call_id,
    c.error,
    c.created_at,
    (c.response_payload->'usage'->>'cost')::numeric AS cost,
    COALESCE(
      (c.response_payload->'usage'->>'total_tokens')::int,
      (c.response_payload->'usage'->>'prompt_tokens')::int
        + (c.response_payload->'usage'->>'completion_tokens')::int
    ) AS tokens
  FROM ai_answer_bank_calls c
  JOIN ai_answer_bank ab ON ab.id = c.ai_answer_bank_id
)
SELECT
  p.id,
  p.name,
  p.provider,
  p.model_id,
  p.is_active,
  p.avatar_url,
  count(cs.call_id) AS total_calls,
  count(cs.call_id) FILTER (WHERE cs.error IS NULL) AS successful_calls,
  count(cs.call_id) FILTER (WHERE cs.error IS NOT NULL) AS error_calls,
  COALESCE(sum(cs.cost), 0) AS total_cost,
  COALESCE(sum(cs.tokens), 0) AS total_tokens,
  max(cs.created_at) AS last_activity
FROM ai_players p
LEFT JOIN call_stats cs ON cs.ai_player_id = p.id
GROUP BY p.id, p.name, p.provider, p.model_id, p.is_active, p.avatar_url
ORDER BY total_cost DESC;
`;

const dailySql = `
WITH days AS (
  SELECT generate_series(
    ((now() AT TIME ZONE 'UTC') - interval '14 days')::date,
    (now() AT TIME ZONE 'UTC')::date,
    interval '1 day'
  )::date AS day
),
actual AS (
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
    count(*) AS calls,
    sum((response_payload->'usage'->>'cost')::numeric) AS cost
  FROM ai_answer_bank_calls
  GROUP BY day
)
SELECT
  d.day,
  COALESCE(a.calls, 0) AS calls,
  COALESCE(a.cost, 0) AS cost
FROM days d
LEFT JOIN actual a ON a.day = d.day
ORDER BY d.day DESC;
`;

function parseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })}`;
}

function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatTimestamp(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function getAdminAccessToken(): string | null {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const cookie = cookieStore.get(storageKey);
  if (!cookie?.value || !cookie.value.startsWith("base64-")) return null;
  try {
    const decoded = Buffer.from(
      cookie.value.slice("base64-".length),
      "base64url"
    ).toString("utf-8");
    const session = JSON.parse(decoded) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

export default async function OpenRouterAdminPage() {
  const accessToken = getAdminAccessToken();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (accessToken && supabaseUrl && serviceKey) {
    const authClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await authClient.auth.getUser(accessToken);
    if (!data.user || data.user.app_metadata?.role !== "admin") {
      redirect("/login");
    }
  } else {
    redirect("/login");
  }

  const db = getDbPool();
  let players: PlayerSummary[] = [];
  let daily: DailyStat[] = [];
  let fetchError: string | null = null;

  try {
    const [playerResult, dailyResult] = await Promise.all([
      db.query(playerSql),
      db.query(dailySql),
    ]);
    players = playerResult.rows as unknown as PlayerSummary[];
    daily = dailyResult.rows as unknown as DailyStat[];
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError) {
    return (
      <main
        className="min-h-screen p-6"
        style={{
          backgroundColor: "var(--gh-bg-base)",
          color: "var(--gh-text-primary)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <p style={{ color: "var(--gh-danger)" }}>Error loading data: {fetchError}</p>
        </div>
      </main>
    );
  }

  const totalCost = players.reduce(
    (sum, p) => sum + parseNumber(p.total_cost),
    0
  );
  const totalCalls = players.reduce(
    (sum, p) => sum + parseNumber(p.total_calls),
    0
  );
  const totalTokens = players.reduce(
    (sum, p) => sum + parseNumber(p.total_tokens),
    0
  );

  const playerModels = players.map((p) => {
    const totalCallsNum = parseNumber(p.total_calls);
    return {
      ...p,
      total_calls: totalCallsNum,
      successful_calls: parseNumber(p.successful_calls),
      error_calls: parseNumber(p.error_calls),
      total_cost: parseNumber(p.total_cost),
      total_tokens: parseNumber(p.total_tokens),
      avg_cost:
        totalCallsNum > 0
          ? parseNumber(p.total_cost) / totalCallsNum
          : null,
    };
  });

  return (
    <main
      className="min-h-screen p-6"
      style={{
        backgroundColor: "var(--gh-bg-base)",
        color: "var(--gh-text-primary)",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="hero">
          <h1 className="text-3xl font-bold">OpenRouter AI Player Activity</h1>
          <p className="text-sm" style={{ color: "var(--gh-text-muted)" }}>
            Real cost and token tracking per AI player.
          </p>
        </section>

        <section className="card">
          <h2 className="text-xl font-semibold mb-4">Overall Summary</h2>
          <div className="results-grid">
            <div className="metric">
              <span className="text-sm" style={{ color: "var(--gh-text-muted)" }}>
                Total Cost
              </span>
              <strong className="text-2xl">{formatCost(totalCost)}</strong>
            </div>
            <div className="metric">
              <span className="text-sm" style={{ color: "var(--gh-text-muted)" }}>
                Total Calls
              </span>
              <strong className="text-2xl">
                {Math.round(totalCalls).toLocaleString("en-US")}
              </strong>
            </div>
            <div className="metric">
              <span className="text-sm" style={{ color: "var(--gh-text-muted)" }}>
                Total Tokens
              </span>
              <strong className="text-2xl">{formatTokens(totalTokens)}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-xl font-semibold mb-4">Daily Cost (last 15 days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr
                  style={{
                    color: "var(--gh-text-muted)",
                    borderBottom: "1px solid var(--gh-border-default)",
                  }}
                >
                  <th className="py-2">Day</th>
                  <th className="py-2 text-right">Calls</th>
                  <th className="py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr
                    key={d.day.toISOString()}
                    style={{ borderBottom: "1px solid var(--gh-border-subtle)" }}
                  >
                    <td className="py-2">{d.day.toISOString().split("T")[0]}</td>
                    <td className="py-2 text-right">
                      {parseNumber(d.calls).toLocaleString("en-US")}
                    </td>
                    <td className="py-2 text-right">{formatCost(parseNumber(d.cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="text-xl font-semibold mb-4">AI Players</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr
                  style={{
                    color: "var(--gh-text-muted)",
                    borderBottom: "1px solid var(--gh-border-default)",
                  }}
                >
                  <th className="py-2">Player</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Total Calls</th>
                  <th className="py-2 text-right">Successful</th>
                  <th className="py-2 text-right">Errors</th>
                  <th className="py-2 text-right">Total Cost</th>
                  <th className="py-2 text-right">Avg Cost/Call</th>
                  <th className="py-2 text-right">Total Tokens</th>
                  <th className="py-2 text-right">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {playerModels.map((p) => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: "1px solid var(--gh-border-subtle)" }}
                  >
                    <td className="py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs" style={{ color: "var(--gh-text-muted)" }}>
                        {p.model_id}
                      </div>
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                          p.is_active
                            ? "bg-green-900/30 text-green-400"
                            : "bg-gray-700/40 text-gray-300"
                        }`}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {p.total_calls.toLocaleString("en-US")}
                    </td>
                    <td className="py-2 text-right">
                      {p.successful_calls.toLocaleString("en-US")}
                    </td>
                    <td className="py-2 text-right">
                      {p.error_calls.toLocaleString("en-US")}
                    </td>
                    <td className="py-2 text-right">{formatCost(p.total_cost)}</td>
                    <td className="py-2 text-right">{formatCost(p.avg_cost)}</td>
                    <td className="py-2 text-right">{formatTokens(p.total_tokens)}</td>
                    <td
                      className="py-2 text-right"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {formatTimestamp(p.last_activity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
