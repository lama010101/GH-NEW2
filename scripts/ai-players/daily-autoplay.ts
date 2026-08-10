import { config } from "dotenv";
import { spawn } from "child_process";
import { resolve } from "path";
import { getDbPool } from "@/server/db";
import { getOrCreateDailyChallenge } from "@/server/dailyChallenge";

// Load .env.local if present, but do not fail if it is missing.
config({ path: ".env.local" });

const WORKER_SCRIPT = resolve(process.cwd(), "scripts/ai-players/generate-answers-v3.ts");
const TSX_BIN = resolve(process.cwd(), "node_modules/.bin/tsx");

const CONCURRENCY = 2;
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
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
  };
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

async function isTransientFailure(stderr: string, stdout: string): Promise<boolean> {
  const output = `${stderr}\n${stdout}`;

  const nonTransientPatterns = [
    /OPENROUTER_API_KEY is missing/,
    /No validated event found/,
    /has no image_url/,
    /Failed to parse AI guess/,
    /Usage:/,
  ];
  for (const pattern of nonTransientPatterns) {
    if (pattern.test(output)) return false;
  }

  const httpMatch = output.match(/OpenRouter request failed:\s*(\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    return status === 429 || (status >= 500 && status < 600);
  }

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

  return false;
}

async function processOne(item: WorkItem): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { code, stdout, stderr } = await runWorker(item);

    if (code === 0) {
      console.log(`[OK] ${item.player.id} ${item.eventId}`);
      return true;
    }

    const lastAttempt = attempt === MAX_RETRIES;
    if (!lastAttempt && (await isTransientFailure(stderr, stdout))) {
      const delay = RETRY_DELAYS_MS[attempt];
      console.log(`[RETRY] ${item.player.id} ${item.eventId} transient failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    console.error(`[ERROR] ${item.player.id} ${item.eventId} worker exited ${code}:`);
    console.error(stderr || stdout);
    return false;
  }

  return false;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim().length === 0) {
    if (!dryRun) {
      console.error("OPENROUTER_API_KEY is missing.");
      process.exit(1);
    }
  }

  const pool = getDbPool();

  const dateIso = todayUtcIso();
  console.log(`[DAILY] UTC date: ${dateIso}`);

  const challenge = await getOrCreateDailyChallenge(dateIso);
  const eventIds = challenge.event_ids;
  console.log(`[DAILY] Challenge events: ${eventIds.length}`);

  const playersResult = await pool.query<AiPlayer>(
    "SELECT id, name, provider, model_id FROM ai_players WHERE is_active = true"
  );
  const players = playersResult.rows;
  console.log(`[DAILY] Active AI players: ${players.length}`);

  if (players.length === 0) {
    console.log("[DAILY] No active AI players; nothing to do.");
    await pool.end();
    process.exit(0);
  }

  const workItems: WorkItem[] = [];

  for (const player of players) {
    const doneResult = await pool.query<{ event_id: string }>(
      `SELECT event_id
       FROM ai_answer_bank
       WHERE ai_player_id = $1
         AND event_id = ANY($2::uuid[])
         AND error IS NULL`,
      [player.id, eventIds]
    );
    const doneSet = new Set(doneResult.rows.map((r) => r.event_id));
    const missing = eventIds.filter((id) => !doneSet.has(id));

    console.log(`[PLAYER] ${player.id} (${player.name}) done=${doneSet.size}/${eventIds.length} missing=${missing.length}`);

    if (missing.length === 0) continue;

    for (const eventId of missing) {
      workItems.push({ player, eventId });
    }
  }

  console.log(`[DAILY] Work items to process: ${workItems.length}`);

  if (dryRun) {
    for (const item of workItems) {
      console.log(`[DRY-RUN] would spawn worker: ${item.player.id} ${item.eventId} --model=${item.player.model_id} --provider=${item.player.provider}`);
    }
    await pool.end();
    process.exit(0);
  }

  let pointer = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (pointer < workItems.length) {
      const item = workItems[pointer++];
      const ok = await processOne(item);
      if (ok) {
        succeeded++;
      } else {
        failed++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, worker);
  await Promise.all(workers);

  await pool.end();

  console.log("\n=== Daily autoplay summary ===");
  console.log(`Date: ${dateIso}`);
  console.log(`Players: ${players.length}`);
  console.log(`Work items: ${workItems.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
