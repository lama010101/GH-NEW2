// SEC-BUILD-POSTUREAUDIT-020 — security-posture audit runner (READ-ONLY).
//
// Runs scripts/dev/security-posture-audit.sql against the repo's existing DB
// env (SUPABASE_DB_CONNECTION, same pg/Pool approach as src/server/db.ts),
// applies scripts/dev/security-posture-allowlist.json, resolves C7 drift
// candidates against supabase/migrations/*.sql, prints one row per violation,
// and exits 1 if any CRITICAL or HIGH finding remains.
//
// Usage: npm run security:audit

import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

config({ path: ".env.local" });

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "..", "..");

interface AuditRow {
  check_id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  object: string;
  detail: string;
}

interface AllowlistEntry {
  match: string;
  reason: string;
}
interface Allowlist {
  publicReadTables: AllowlistEntry[];
  clientCallableDefinerFunctions: AllowlistEntry[];
  publicDefinerViews: AllowlistEntry[];
  secretLikeColumns: AllowlistEntry[];
}

const allowlist = JSON.parse(
  readFileSync(join(here, "security-posture-allowlist.json"), "utf8"),
) as Allowlist;

function isAllowlisted(row: AuditRow): string | null {
  const hay = `${row.object} ${row.detail}`;
  const buckets: AllowlistEntry[][] = [
    allowlist.publicReadTables,
    allowlist.clientCallableDefinerFunctions,
    allowlist.publicDefinerViews,
    allowlist.secretLikeColumns,
  ];
  for (const entries of buckets) {
    for (const e of entries) {
      if (e.match && hay.includes(e.match)) return e.reason;
    }
  }
  return null;
}

// Extract the grep token for C7 candidates: policy name after the last '.',
// or the bare function name before the argument list.
function c7Token(object: string): string {
  if (object.startsWith("policy:")) return object.slice(object.lastIndexOf(".") + 1);
  if (object.startsWith("function:")) return object.slice(9, object.indexOf("("));
  return object;
}

function repoMigrationsContain(token: string, corpus: string): boolean {
  return token.length > 0 && corpus.includes(token);
}

async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_CONNECTION;
  if (!connectionString) {
    console.error("[security:audit] SUPABASE_DB_CONNECTION is required (same env as src/server/db.ts).");
    process.exit(2);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 30000,
  });

  const sql = readFileSync(join(here, "security-posture-audit.sql"), "utf8");
  let rows: AuditRow[];
  try {
    const res = await pool.query<AuditRow>(sql);
    rows = res.rows;
  } finally {
    await pool.end();
  }

  // C7: resolve drift candidates against supabase/migrations/*.sql
  const migrationsDir = join(rootDir, "supabase", "migrations");
  const corpus = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

  const findings: (AuditRow & { allowlistedReason?: string })[] = [];
  for (const row of rows) {
    if (row.check_id === "C7") {
      if (repoMigrationsContain(c7Token(row.object), corpus)) continue;
      row.detail = "declared in DB but name not found in supabase/migrations/*.sql";
    }
    const reason = isAllowlisted(row);
    if (reason) {
      findings.push({ ...row, detail: `${row.detail} | ALLOWLISTED: ${reason}`, allowlistedReason: reason });
    } else {
      findings.push(row);
    }
  }

  // Print: violations first, then allowlisted rows for transparency.
  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  findings.sort(
    (a, b) =>
      sevOrder[a.severity] - sevOrder[b.severity] ||
      a.check_id.localeCompare(b.check_id) ||
      a.object.localeCompare(b.object),
  );

  let openCritHigh = 0;
  console.log("check | severity | object | detail");
  console.log("------+----------+--------+-------");
  for (const f of findings) {
    const flagged = !f.allowlistedReason && (f.severity === "CRITICAL" || f.severity === "HIGH");
    if (flagged) openCritHigh++;
    console.log(
      `${f.check_id} | ${f.severity}${f.allowlistedReason ? " (allowlisted)" : ""} | ${f.object} | ${f.detail}`,
    );
  }
  console.log("------+----------+--------+-------");
  console.log(`total rows: ${findings.length}; open CRITICAL/HIGH: ${openCritHigh}`);

  process.exit(openCritHigh > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[security:audit] failed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
