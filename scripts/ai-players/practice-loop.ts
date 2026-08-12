import { config } from "dotenv";
import { spawn } from "child_process";
import { resolve } from "path";
import { getDbPool } from "@/server/db";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const WORKER_SCRIPT = resolve(process.cwd(), "scripts/ai-players/generate-answers-v3.ts");
const TSX_BIN = resolve(process.cwd(), "node_modules/.bin/tsx");

const DEFAULT_CONCURRENCY = 8;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 4000];

type AiPlayer = {
  id: string;
  name: string;
  provider: string;
  model_id: string;
};

type WorkItem = {
  player: AiPlayer;
  eventId: string;
  imageId: string;
  imageUrl: string;
  imageStatus: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { dryRun: boolean; limit?: number; eventIds?: string[] } {
  const args = process.argv.slice(2);
  const result: { dryRun: boolean; limit?: number; eventIds?: string[] } = { dryRun: false };
  for (const arg of args) {
    if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg.startsWith("--limit=")) {
      const value = parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(value) && value > 0) result.limit = value;
    } else if (arg.startsWith("--event-ids=")) {
      const raw = arg.slice("--event-ids=".length);
      result.eventIds = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return result;
}

function getConcurrency(): number {
  const raw = process.env.AI_PRACTICE_CONCURRENCY;
  if (!raw) return DEFAULT_CONCURRENCY;
  const parsed = parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_CONCURRENCY;
}

function runWorker(item: WorkItem): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      TSX_BIN,
      [
        WORKER_SCRIPT,
        item.eventId,
        `--model=${item.player.model_id}`,
        `--provider=${item.player.provider}`,
        `--player-name=${item.player.name}`,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "pipe",
      }
    );

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

function isImageFetchFailure(output: string): boolean {
  const combined = output.toLowerCase();
  // HTTP-level failure from resolveStimulus.
  if (output.includes("Failed to fetch image from")) return true;
  // Network-level failure during the image fetch phase (after "True answer:").
  if (combined.includes("true answer:") && /fetch failed/i.test(output) && !output.includes("Stored error row")) {
    return true;
  }
  return false;
}

function isOpenRouterOrModelError(output: string): boolean {
  return output.includes("Stored error row") || output.includes("OpenRouter request failed");
}

function isTransientFailure(output: string): boolean {
  const lower = output.toLowerCase();
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
    if (pattern.test(output)) return true;
  }
  const httpMatch = output.match(/OpenRouter request failed:\s*(\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    if (status === 429 || (status >= 500 && status < 600)) return true;
  }
  return lower.includes("stored error row");
}

async function classifyResult(
  item: WorkItem,
  code: number | null,
  stdout: string,
  stderr: string
): Promise<"ok" | "broken" | "ambiguous" | "skip"> {
  const combined = `${stdout}\n${stderr}`;

  if (code === 0) {
    return "ok";
  }

  if (isImageFetchFailure(combined)) {
    return "broken";
  }

  if (combined.includes("No validated event found") || combined.includes("has no image_url")) {
    return "skip";
  }

  if (isOpenRouterOrModelError(combined) || isTransientFailure(combined)) {
    return "ambiguous";
  }

  // Any other failure is treated as ambiguous to avoid false positives.
  return "ambiguous";
}

async function updateImageStatus(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  imageId: string,
  status: "ok" | "broken" | "unchecked" | null,
  playerId: string | null
): Promise<void> {
  await pool.query(
    `UPDATE images
     SET image_status = COALESCE($1, image_status),
         last_checked_at = now(),
         last_checked_by_ai_player_id = $2
     WHERE id = $3`,
    [status, playerId, imageId]
  );
}

async function processOne(
  pool: Awaited<ReturnType<typeof getDbPool>>,
  item: WorkItem,
  attempt = 0
): Promise<{ status: "ok" | "broken" | "ambiguous" | "skip"; retried: boolean }> {
  const { code, stdout, stderr } = await runWorker(item);
  const combined = `${stdout}\n${stderr}`;
  const classification = await classifyResult(item, code, stdout, stderr);

  if (classification === "ok") {
    await updateImageStatus(pool, item.imageId, "ok", item.player.id);
    console.log(`[OK] ${item.player.id} ${item.eventId} image=${item.imageId}`);
    return { status: "ok", retried: false };
  }

  if (classification === "broken") {
    await updateImageStatus(pool, item.imageId, "broken", item.player.id);
    const errorLine = combined.split("\n").find((line) => line.includes("Failed to fetch image from") || /fetch failed/i.test(line))?.trim();
    console.log(
      `[BROKEN] ${item.player.id} ${item.eventId} image=${item.imageId}${errorLine ? ` — ${errorLine}` : ""}`
    );
    return { status: "broken", retried: false };
  }

  if (classification === "ambiguous" && attempt < MAX_RETRIES && isTransientFailure(`${stdout}\n${stderr}`)) {
    const delay = RETRY_DELAYS_MS[attempt];
    console.log(
      `[RETRY] ${item.player.id} ${item.eventId} image=${item.imageId} transient failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms`
    );
    await sleep(delay);
    return processOne(pool, item, attempt + 1);
  }

  if (classification === "ambiguous") {
    // Do not write 'broken'; leave status unchanged, but still update last_checked_at
    // so the event cycles to the back of the queue for re-check over time.
    await updateImageStatus(pool, item.imageId, null, item.player.id);
    const errorLine = combined.split("\n").find((line) => line.includes("Stored error row") || line.includes("OpenRouter request failed"))?.trim();
    console.log(
      `[AMBIGUOUS] ${item.player.id} ${item.eventId} image=${item.imageId}: no image_status change${errorLine ? ` — ${errorLine}` : ""}`
    );
  } else {
    console.log(`[SKIP] ${item.player.id} ${item.eventId} image=${item.imageId}`);
  }

  return { status: classification, retried: attempt > 0 };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const concurrency = getConcurrency();

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim().length === 0) {
    if (!args.dryRun) {
      console.error("OPENROUTER_API_KEY is missing. Set it in the environment or .env.local and rerun, or use --dry-run.");
      process.exit(1);
    }
  }

  const pool = getDbPool();

  const playersResult = await pool.query<AiPlayer>(
    "SELECT id, name, provider, model_id FROM ai_players WHERE is_active = true ORDER BY id"
  );
  const players = playersResult.rows;
  console.log(`[PRACTICE] Active AI players: ${players.length}`);
  console.log(`[PRACTICE] Concurrency: ${concurrency}`);

  if (players.length === 0) {
    console.log("[PRACTICE] No active AI players; nothing to do.");
    await pool.end();
    process.exit(0);
  }

  const params: (string[] | number)[] = [];
  let whereClause = "e.status = 'validated' AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL";
  if (args.eventIds && args.eventIds.length > 0) {
    whereClause += ` AND e.id = ANY($${params.length + 1}::uuid[])`;
    params.push(args.eventIds);
  }

  const limitClause = args.limit ? ` LIMIT $${params.length + 1}` : "";
  if (args.limit) params.push(args.limit);

  const queueResult = await pool.query<{
    event_id: string;
    image_id: string;
    image_url: string;
    image_status: string;
    last_checked_at: string | null;
  }>(
    `WITH primary_image AS (
       SELECT DISTINCT ON (i.event_id)
         i.event_id,
         i.id AS image_id,
         i.url AS image_url,
         i.image_status,
         i.last_checked_at
       FROM images i
       JOIN events e ON e.id = i.event_id
       JOIN locations l ON l.event_id = e.id
       WHERE ${whereClause}
       ORDER BY i.event_id, i.display_order ASC NULLS LAST, i.id
     )
     SELECT event_id, image_id, image_url, image_status, last_checked_at
     FROM primary_image
     ORDER BY
       CASE image_status WHEN 'unchecked' THEN 0 WHEN 'ok' THEN 1 WHEN 'broken' THEN 2 END,
       last_checked_at ASC NULLS FIRST,
       event_id
     ${limitClause}`,
    params
  );

  const rows = queueResult.rows;
  console.log(`[PRACTICE] Events/images to check: ${rows.length}`);

  if (rows.length === 0) {
    console.log("[PRACTICE] No work items.");
    await pool.end();
    process.exit(0);
  }

  const workItems: WorkItem[] = rows.map((row, idx) => ({
    player: players[idx % players.length],
    eventId: row.event_id,
    imageId: row.image_id,
    imageUrl: row.image_url,
    imageStatus: row.image_status,
  }));

  if (args.dryRun) {
    for (const item of workItems) {
      console.log(
        `[DRY-RUN] would spawn: player=${item.player.id} (${item.player.name}) event=${item.eventId} image=${item.imageId} url=${item.imageUrl}`
      );
    }
    await pool.end();
    process.exit(0);
  }

  let pointer = 0;
  let okCount = 0;
  let brokenCount = 0;
  let ambiguousCount = 0;
  let skipCount = 0;

  async function worker(): Promise<void> {
    while (pointer < workItems.length) {
      const item = workItems[pointer++];
      const result = await processOne(pool, item);
      if (result.status === "ok") okCount++;
      else if (result.status === "broken") brokenCount++;
      else if (result.status === "ambiguous") ambiguousCount++;
      else if (result.status === "skip") skipCount++;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, workItems.length) }, worker);
  await Promise.all(workers);

  await pool.end();

  console.log("\n=== Practice loop summary ===");
  console.log(`Players: ${players.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Work items: ${workItems.length}`);
  console.log(`OK: ${okCount}`);
  console.log(`Broken: ${brokenCount}`);
  console.log(`Ambiguous: ${ambiguousCount}`);
  console.log(`Skip: ${skipCount}`);
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
