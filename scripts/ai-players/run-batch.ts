import { config } from "dotenv";
import { spawn } from "child_process";
import { resolve } from "path";
import { getDbPool } from "@/server/db";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 4000]; // exponential-ish: 1s, 4s

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4.6";
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_AI_PLAYER_NAME = "Claude Sonnet 4.6 via OpenRouter";

function parseFlags(): { modelId: string; provider: string; playerName: string } {
  const args = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq > 2 ? arg.slice(2, eq) : arg.slice(2);
      const value = eq > 2 ? arg.slice(eq + 1) : "";
      flags.set(key, value);
    }
  }
  return {
    modelId: flags.get("model") ?? DEFAULT_MODEL_ID,
    provider: flags.get("provider") ?? DEFAULT_PROVIDER,
    playerName: flags.get("player-name") ?? DEFAULT_AI_PLAYER_NAME,
  };
}

const parsedFlags = parseFlags();
const MODEL_ID = parsedFlags.modelId;
const PROVIDER = parsedFlags.provider;
const AI_PLAYER_NAME = parsedFlags.playerName;

const DEFAULT_WORKER_SCRIPT = resolve(process.cwd(), "scripts/ai-players/generate-answers.ts");
const TSX_BIN = resolve(process.cwd(), "node_modules/.bin/tsx");

function getWorkerScript(): string {
  const arg = process.argv.find((a) => a.startsWith("--worker="));
  if (!arg) return DEFAULT_WORKER_SCRIPT;
  const path = arg.slice("--worker=".length);
  // Allow relative paths from repo root and absolute paths.
  if (path.startsWith("/")) return path;
  return resolve(process.cwd(), path);
}

interface WorkerResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureAiPlayer(pool: Awaited<ReturnType<typeof getDbPool>>): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM ai_players WHERE model_id = $1 LIMIT 1",
    [MODEL_ID]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    "INSERT INTO ai_players (name, provider, model_id) VALUES ($1, $2, $3) RETURNING id",
    [AI_PLAYER_NAME, PROVIDER, MODEL_ID]
  );
  return inserted.rows[0].id;
}

function isTransientFailure(stderr: string, stdout: string): boolean {
  const output = `${stderr}\n${stdout}`;

  // Known non-transient errors. The default posture is "do not retry unless
  // explicitly recognized as transient" — an unrecognized error pattern is
  // surfaced immediately rather than retried.
  const nonTransientPatterns = [
    /OPENROUTER_API_KEY is missing/,
    /No validated event found/,
    /has no image_url/,
    /Failed to parse AI guess/,
    /Usage:/,
  ];
  for (const pattern of nonTransientPatterns) {
    if (pattern.test(output)) {
      return false;
    }
  }

  // HTTP status from worker's OpenRouter error message.
  const httpMatch = output.match(/OpenRouter request failed:\s*(\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
    // Any other 4xx is a client-side/non-transient failure.
    return false;
  }

  // Network / socket / DNS failures are transient.
  const transientNetworkPatterns = [
    /fetch failed/i,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /EAI_AGAIN/,
    /ENOTFOUND/,
    /Socket timeout/i,
    /socket hang up/i,
    /SPAWN_ERROR:/,
  ];
  for (const pattern of transientNetworkPatterns) {
    if (pattern.test(output)) {
      return true;
    }
  }

  // Unknown/unclassified failures: do NOT retry. An unrecognized error
  // pattern may indicate a real bug in the worker rather than a transient
  // API issue — retrying would mask it behind "retrying..." logs and waste
  // API calls. Surface it as an error immediately for investigation.
  return false;
}

function runWorker(eventId: string): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const child = spawn(TSX_BIN, [getWorkerScript(), eventId, `--model=${MODEL_ID}`, `--provider=${PROVIDER}`, `--player-name=${AI_PLAYER_NAME}`], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      stderr += `\nSPAWN_ERROR: ${err.message}`;
      resolve({ code: -1, stdout, stderr });
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun.");
    process.exit(1);
  }

  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  if (limitArg !== undefined && (!Number.isFinite(limit as number) || (limit as number) <= 0)) {
    console.error("Invalid --limit value");
    process.exit(1);
  }

  const pool = getDbPool();

  const aiPlayerId = await ensureAiPlayer(pool);

  const eligibleResult = await pool.query<{ id: string }>(
    `SELECT DISTINCT e.id
     FROM events e
     JOIN locations l ON l.event_id = e.id
     WHERE e.status = 'validated'
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
     ORDER BY e.id`
  );

  let eventIds = eligibleResult.rows.map((row) => row.id);
  if (limit !== undefined) {
    eventIds = eventIds.slice(0, limit);
  }
  const total = eventIds.length;

  const eventIndex = new Map(eventIds.map((id, idx) => [id, idx + 1]));

  // Skip events that already have a successful answer for this AI player.
  const doneResult = await pool.query<{ event_id: string }>(
    `SELECT event_id
     FROM ai_answer_bank
     WHERE ai_player_id = $1
       AND error IS NULL
       AND event_id = ANY($2::uuid[])`,
    [aiPlayerId, eventIds]
  );
  const doneSet = new Set(doneResult.rows.map((row) => row.event_id));

  const toProcess = eventIds.filter((id) => !doneSet.has(id));
  const skipped = total - toProcess.length;

  let completed = 0;
  let succeeded = 0;
  let errored = 0;

  function logStatus(eventId: string, status: string): void {
    const idx = eventIndex.get(eventId) ?? 0;
    completed++;
    console.log(`[${completed}/${total}] ${eventId} ${status}`);
  }

  // Log skipped events immediately so they count in progress/summary.
  for (const eventId of eventIds) {
    if (doneSet.has(eventId)) {
      logStatus(eventId, "skipped");
    }
  }

  async function processOne(eventId: string): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { code, stdout, stderr } = await runWorker(eventId);

      if (code === 0) {
        succeeded++;
        logStatus(eventId, "success");
        return;
      }

      const lastAttempt = attempt === MAX_RETRIES;
      if (!lastAttempt && isTransientFailure(stderr, stdout)) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.log(
          `[${eventIndex.get(eventId) ?? 0}/${total}] ${eventId} transient failure (attempt ${
            attempt + 1
          }/${MAX_RETRIES + 1}), retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      errored++;
      logStatus(eventId, "error");
      return;
    }
  }

  // Simple semaphore: run at most CONCURRENCY workers in parallel, each
  // pulling the next unprocessed event from the shared list.
  let pointer = 0;
  async function worker(): Promise<void> {
    while (pointer < toProcess.length) {
      const eventId = toProcess[pointer++];
      await processOne(eventId);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);

  await pool.end();

  console.log("\n=== Batch summary ===");
  console.log(`Total events: ${total}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Errored: ${errored}`);
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
