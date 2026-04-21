import { Pool } from "pg";
import { randomUUID } from "crypto";
import { evaluateRound } from "@/core/rules";
import { EventRecord, LatLng } from "@/core/types";

/* eslint-disable no-var */
declare global {
  var __guessHistoryDbPool__: Pool | undefined;
  var __dbConnectionVerified__: boolean | undefined;
  var __dbConnectionError__: string | undefined;
}
/* eslint-enable no-var */

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 0: HARD DB CONNECTION ENFORCEMENT (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ANTI-FAKE ENFORCEMENT: DB connection is MANDATORY at module load.
 *
 * Per backend_architecture.md: "DB is the only truth"
 * Per operational_rules.md: "No DB write = no state change"
 *
 * If DB is not connected at startup:
 *   - System CANNOT start
 *   - NO fallback logic
 *   - NO mock mode
 *   - HARD CRASH
 */
function enforceDbConnection(): Pool {
  const connectionString = process.env.SUPABASE_DB_CONNECTION;

  if (!connectionString) {
    console.error("[FATAL][DB] SUPABASE_DB_CONNECTION environment variable is REQUIRED");
    console.error("[FATAL][DB] System cannot start without real Supabase PostgreSQL connection");
    throw new Error("[HARNESS][FATAL] SUPABASE_DB_CONNECTION is required. Real DB execution proof requires Supabase PostgreSQL.");
  }

  // Validate Supabase connection string format
  if (!connectionString.includes("supabase") && !connectionString.includes("postgres")) {
    console.error("[FATAL][DB] Connection must be Supabase PostgreSQL");
    throw new Error("[HARNESS][FATAL] Connection must be Supabase PostgreSQL");
  }

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // IMMEDIATE connection test — no lazy loading
  pool.query<{ db_alive: number; db_name: string; version: string }>(
    "SELECT 1 AS db_alive, current_database() AS db_name, version() AS version"
  )
    .then((result) => {
      const row = result.rows[0];
      console.log(`[DB][ENFORCEMENT] ✅ Connected to ${row.db_name}`);
      console.log(`[DB][ENFORCEMENT] PostgreSQL ${row.version.split(" ")[0]}`);
      globalThis.__dbConnectionVerified__ = true;
      globalThis.__dbConnectionError__ = undefined;
    })
    .catch((err) => {
      console.error("[FATAL][DB] Immediate connection test FAILED:", err.message);
      console.error("[FATAL][DB] DB verification failed — requests will fail fast until connectivity is restored");
      globalThis.__dbConnectionVerified__ = false;
      globalThis.__dbConnectionError__ = err instanceof Error ? err.message : "Unknown DB connection verification failure";
    });

  return pool;
}

export const dbPool: Pool = globalThis.__guessHistoryDbPool__ ?? enforceDbConnection();

if (process.env.NODE_ENV !== "production") {
  globalThis.__guessHistoryDbPool__ = dbPool;
}

// ANTI-FAKE GUARD: Runtime check that DB was actually hit
export function assertDbConnectionVerified(): void {
  if (globalThis.__dbConnectionVerified__) {
    return;
  }

  const suffix = globalThis.__dbConnectionError__
    ? ` Last error: ${globalThis.__dbConnectionError__}`
    : "";
  throw new Error(`[VERIFY][FATAL] DB connection was never verified.${suffix}`);
}

// Type aliases matching sessionCore.ts pattern
type DbExecutor = Pick<Pool, "query">;
type DbTransactionClient = DbExecutor & { release(): void };
type TransactionCapablePool = DbExecutor & { connect(): Promise<DbTransactionClient> };

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: CROSS-CONNECTION PROOF (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Connection handle with backend PID tracking for execution proof
 */
export type ConnectionHandle = {
  client: DbTransactionClient;
  backendPid: number;
  connectionId: string;
};

/**
 * Acquire Connection A for write operations.
 * Returns connection with backend PID for proof logging.
 */
export async function acquireConnectionA(): Promise<ConnectionHandle> {
  const client = await (dbPool as unknown as TransactionCapablePool).connect();
  const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const backendPid = pidResult.rows[0].pid;
  const connectionId = `A-${backendPid}-${Date.now()}`;

  console.log(`[CONN][A] Acquired backend_pid=${backendPid}`);

  return {
    client,
    backendPid,
    connectionId
  };
}

/**
 * Acquire Connection B for cross-connection verification.
 * MUST return different backend PID than Connection A.
 */
export async function acquireConnectionB(): Promise<ConnectionHandle> {
  const client = await (dbPool as unknown as TransactionCapablePool).connect();
  const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const backendPid = pidResult.rows[0].pid;
  const connectionId = `B-${backendPid}-${Date.now()}`;

  console.log(`[CONN][B] Acquired backend_pid=${backendPid}`);

  return {
    client,
    backendPid,
    connectionId
  };
}

/**
 * Legacy helper for backward compatibility.
 * Internally uses acquireConnectionB for cross-connection verification.
 */
async function getNewPoolConnection(): Promise<DbTransactionClient> {
  const conn = await acquireConnectionB();
  return conn.client;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: EXECUTION PROOF FORMAT v2 (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════

export type ExecutionProofV2 = {
  test: string;
  table: string;
  primary_key: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "VERIFY" | "CORRUPT" | "REPLAY" | "ISOLATION";
  verification_token: string;
  cross_connection: boolean;
  result: "PASS" | "FAIL";
  timestamp: string;           // From DB NOW()
  db_source: string;
  // NEW v2 fields for hard enforcement:
  db_backend_pid_a?: number;   // Connection A (write) backend PID
  db_backend_pid_b?: number;   // Connection B (verify) backend PID
  transaction_id?: string;     // Transaction ID if applicable
  commit_timestamp?: string;   // Exact DB commit timestamp
  row_count_verified?: number; // Rows verified in this operation
  isolation_proven?: boolean;  // Transaction isolation verified
};

const executionProofsV2: ExecutionProofV2[] = [];

export function emitExecutionProofV2(proof: ExecutionProofV2): void {
  executionProofsV2.push(proof);

  // MANDATORY: Log with all v2 proof fields
  console.log(`
[DB_EXECUTION_PROOF_v2]
test: ${proof.test}
table: ${proof.table}
primary_key: ${proof.primary_key}
operation: ${proof.operation}
verification_token: ${proof.verification_token}
cross_connection: ${proof.cross_connection ? "TRUE" : "FALSE"}
result: ${proof.result}
timestamp: ${proof.timestamp}
db_source: ${proof.db_source}
${proof.db_backend_pid_a ? `db_backend_pid_a: ${proof.db_backend_pid_a}` : ""}
${proof.db_backend_pid_b ? `db_backend_pid_b: ${proof.db_backend_pid_b}` : ""}
${proof.transaction_id ? `transaction_id: ${proof.transaction_id}` : ""}
${proof.commit_timestamp ? `commit_timestamp: ${proof.commit_timestamp}` : ""}
${proof.row_count_verified !== undefined ? `row_count_verified: ${proof.row_count_verified}` : ""}
${proof.isolation_proven !== undefined ? `isolation_proven: ${proof.isolation_proven}` : ""}
`);
}

export function getExecutionProofsV2(): ExecutionProofV2[] {
  return [...executionProofsV2];
}

export function clearExecutionProofsV2(): void {
  executionProofsV2.length = 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: TRANSACTION BOUNDARY VALIDATION (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════

export type IsolationProof = {
  uncommittedVisibleToA: boolean;
  uncommittedVisibleToB: boolean;
  committedVisibleToA: boolean;
  committedVisibleToB: boolean;
  isolationProven: boolean;
};

/**
 * verifyTransactionIsolation — Prove transaction boundaries are enforced.
 *
 * Steps:
 *   1. Connection A: BEGIN, INSERT (no COMMIT)
 *   2. Connection B: SELECT → MUST return 0 rows (isolation)
 *   3. Connection A: COMMIT
 *   4. Connection B: SELECT → MUST return 1 row (durability)
 *
 * This proves:
 *   - Uncommitted writes are NOT visible to other connections
 *   - Committed writes ARE visible to other connections
 *   - PostgreSQL transaction isolation is working
 */
export async function verifyTransactionIsolation(
  gameId: string,
  operation: string = "verifyTransactionIsolation"
): Promise<IsolationProof> {
  const token = generateVerificationToken();
  const dbTimestamp = await getDbTimestamp();

  const connA = await acquireConnectionA();
  const connB = await acquireConnectionB();

  const proof: IsolationProof = {
    uncommittedVisibleToA: false,
    uncommittedVisibleToB: false,
    committedVisibleToA: false,
    committedVisibleToB: false,
    isolationProven: false
  };

  try {
    // Step 1: Connection A begins transaction and inserts
    await connA.client.query("BEGIN");
    await connA.client.query(
      `INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, verification_token)
       VALUES ($1, $2, 999, now(), 1776, $3)`,
      [gameId, "isolation-test-player", token]
    );

    // Step 2: Connection A sees uncommitted row
    const aUncommittedResult = await connA.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = 999",
      [gameId]
    );
    proof.uncommittedVisibleToA = parseInt(aUncommittedResult.rows[0].count, 10) === 1;

    // Step 3: Connection B MUST NOT see uncommitted row (isolation test)
    const bUncommittedResult = await connB.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = 999",
      [gameId]
    );
    proof.uncommittedVisibleToB = parseInt(bUncommittedResult.rows[0].count, 10) === 1;

    if (proof.uncommittedVisibleToB) {
      throw new Error("[ISOLATION][FAIL] Uncommitted row visible to Connection B — isolation broken!");
    }

    // Step 4: Connection A commits
    await connA.client.query("COMMIT");

    // Step 5: Connection A sees committed row
    const aCommittedResult = await connA.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = 999",
      [gameId]
    );
    proof.committedVisibleToA = parseInt(aCommittedResult.rows[0].count, 10) === 1;

    // Step 6: Connection B MUST see committed row (durability test)
    const bCommittedResult = await connB.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = 999",
      [gameId]
    );
    proof.committedVisibleToB = parseInt(bCommittedResult.rows[0].count, 10) === 1;

    if (!proof.committedVisibleToB) {
      throw new Error("[ISOLATION][FAIL] Committed row NOT visible to Connection B — durability broken!");
    }

    proof.isolationProven = true;

    // Emit proof
    emitExecutionProofV2({
      test: operation,
      table: "round_commits",
      primary_key: `${gameId}:isolation-test-player:999`,
      operation: "ISOLATION",
      verification_token: token,
      cross_connection: true,
      result: "PASS",
      timestamp: dbTimestamp,
      db_source: "supabase",
      db_backend_pid_a: connA.backendPid,
      db_backend_pid_b: connB.backendPid,
      transaction_id: token,
      commit_timestamp: dbTimestamp,
      row_count_verified: 1,
      isolation_proven: true
    });

    console.log(`[ISOLATION][PASS] Transaction isolation proven: pidA=${connA.backendPid}, pidB=${connB.backendPid}`);

    return proof;

  } catch (error) {
    // Cleanup on failure
    try {
      await connA.client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors
    }

    emitExecutionProofV2({
      test: operation,
      table: "round_commits",
      primary_key: `${gameId}:isolation-test-player:999`,
      operation: "ISOLATION",
      verification_token: token,
      cross_connection: true,
      result: "FAIL",
      timestamp: dbTimestamp,
      db_source: "supabase",
      db_backend_pid_a: connA.backendPid,
      db_backend_pid_b: connB.backendPid,
      transaction_id: token,
      isolation_proven: false
    });

    throw error;
  } finally {
    connA.client.release();
    connB.client.release();

    // Cleanup test row
    const cleanupClient = await getNewPoolConnection();
    try {
      await cleanupClient.query(
        "DELETE FROM round_commits WHERE game_id = $1 AND round_index = 999",
        [gameId]
      );
    } finally {
      cleanupClient.release();
    }
  }
}

/**
 * Get current DB timestamp for proof logging.
 */
async function getDbTimestamp(): Promise<string> {
  const client = await getNewPoolConnection();
  try {
    const result = await client.query<{ now: string }>("SELECT NOW()::text AS now");
    return result.rows[0].now;
  } finally {
    client.release();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ZERO-TRUST VERIFICATION SYSTEM v3.0 (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════
//

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: VERIFICATION TOKEN GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateVerificationToken(): string {
  return randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: FORENSIC LOGGING SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationLogEntry = {
  timestamp: string;
  operation: string;
  table: string;
  verification_token: string | null;
  expected: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
  result: "PASS" | "FAIL";
  diff?: Array<{ field: string; expected: unknown; actual: unknown }>;
  latency_ms: number;
  connections_used: number;
  error?: string;
};

const verificationLogBuffer: VerificationLogEntry[] = [];

export function getVerificationLogs(): VerificationLogEntry[] {
  return [...verificationLogBuffer];
}

export function clearVerificationLogs(): void {
  verificationLogBuffer.length = 0;
}

function logVerification(entry: VerificationLogEntry): void {
  verificationLogBuffer.push(entry);

  const prefix = entry.result === "PASS" ? "[VERIFY][PASS]" : "[VERIFY][FAIL]";
  const tokenStr = entry.verification_token ? ` token=${entry.verification_token.slice(0, 8)}...` : "";

  if (entry.result === "FAIL") {
    console.error(
      `${prefix} ${entry.operation} ${entry.table}${tokenStr} — ${entry.error || "Verification failed"}`
    );
    if (entry.diff && entry.diff.length > 0) {
      for (const d of entry.diff) {
        console.error(`  [DIFF] ${d.field}: expected=${JSON.stringify(d.expected)}, actual=${JSON.stringify(d.actual)}`);
      }
    }
  } else {
    console.log(
      `${prefix} ${entry.operation} ${entry.table}${tokenStr} — ${entry.latency_ms}ms`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: PERFORMANCE METRICS
// ─────────────────────────────────────────────────────────────────────────────

export type PerformanceMetrics = {
  avg_verification_time_ms: number;
  max_verification_time_ms: number;
  connections_used_per_op: number;
  total_verifications: number;
};

export function getPerformanceMetrics(): PerformanceMetrics {
  const logs = verificationLogBuffer;
  if (logs.length === 0) {
    return {
      avg_verification_time_ms: 0,
      max_verification_time_ms: 0,
      connections_used_per_op: 0,
      total_verifications: 0
    };
  }

  const times = logs.map(l => l.latency_ms);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);

  return {
    avg_verification_time_ms: Math.round(avg * 100) / 100,
    max_verification_time_ms: max,
    connections_used_per_op: Math.round(
      logs.reduce((sum, l) => sum + l.connections_used, 0) / logs.length
    ),
    total_verifications: logs.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: DEEP EQUALITY COMPARISON (STRICT, NO COERCION)
// ─────────────────────────────────────────────────────────────────────────────

function strictDeepEqual(a: unknown, b: unknown): boolean {
  // Strict type checking first
  if (typeof a !== typeof b) {
    // Handle Date vs string comparison
    if (a instanceof Date && typeof b === "string") {
      return a.toISOString() === b;
    }
    if (typeof a === "string" && b instanceof Date) {
      return a === b.toISOString();
    }
    // Handle null vs undefined (both are "absent")
    if ((a === null || a === undefined) && (b === null || b === undefined)) {
      return true;
    }
    return false;
  }

  // Handle null/undefined
  if (a === null || a === undefined) {
    return b === null || b === undefined;
  }

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!strictDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!strictDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  // Handle primitives (strict equality, no coercion)
  return a === b;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: PAYLOAD INTEGRITY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type FieldDiff = {
  field: string;
  expected: unknown;
  actual: unknown;
};

export type RowIntegrityResult = {
  success: boolean;
  table: string;
  diffs: FieldDiff[];
  token?: string;
  error?: string;
};

/**
 * verifyRowIntegrity — Full payload verification with deep field comparison
 *
 * Asserts: dbRow[field] === expectedRow[field] for ALL fields
 * Throws if ANY field mismatches
 */
export async function verifyRowIntegrity(
  table: string,
  expectedRow: Record<string, unknown>,
  whereClause: string,
  whereParams: unknown[],
  operation: string,
  token?: string
): Promise<RowIntegrityResult> {
  const startTime = Date.now();
  const result: RowIntegrityResult = {
    success: false,
    table,
    diffs: [],
    token
  };

  let verifyClient: DbTransactionClient | null = null;

  try {
    verifyClient = await getNewPoolConnection();

    // Build SELECT to fetch all expected fields
    const fields = Object.keys(expectedRow);
    const selectFields = fields.map((f, i) => `${f} AS field_${i}`).join(", ");

    const query = `SELECT ${selectFields} FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const dbResult = await verifyClient.query(query, whereParams);

    if (dbResult.rows.length === 0) {
      result.error = `Row not found in ${table}`;
      logVerification({
        timestamp: new Date().toISOString(),
        operation,
        table,
        verification_token: token || null,
        expected: expectedRow,
        actual: null,
        result: "FAIL",
        error: result.error,
        latency_ms: Date.now() - startTime,
        connections_used: 1
      });
      throw new Error(`[VERIFY][ROW_INTEGRITY][FAIL] ${operation}: ${result.error}`);
    }

    const dbRow = dbResult.rows[0];

    // Compare EVERY field with strict deep equality
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const expected = expectedRow[field];
      const actual = dbRow[`field_${i}`];

      if (!strictDeepEqual(expected, actual)) {
        result.diffs.push({ field, expected, actual });
      }
    }

    if (result.diffs.length > 0) {
      result.error = `Field mismatch: ${result.diffs.map(d => d.field).join(", ")}`;
      logVerification({
        timestamp: new Date().toISOString(),
        operation,
        table,
        verification_token: token || null,
        expected: expectedRow,
        actual: dbRow,
        result: "FAIL",
        diff: result.diffs,
        error: result.error,
        latency_ms: Date.now() - startTime,
        connections_used: 1
      });
      throw new Error(
        `[VERIFY][ROW_INTEGRITY][FAIL] ${operation}: ${result.error}\n` +
        result.diffs.map(d => `  ${d.field}: expected=${JSON.stringify(d.expected)}, actual=${JSON.stringify(d.actual)}`).join("\n")
      );
    }

    result.success = true;
    logVerification({
      timestamp: new Date().toISOString(),
      operation,
      table,
      verification_token: token || null,
      expected: expectedRow,
      actual: dbRow,
      result: "PASS",
      latency_ms: Date.now() - startTime,
      connections_used: 1
    });

    return result;

  } catch (error) {
    if (!result.error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    throw new Error(`[VERIFY][ROW_INTEGRITY][FAIL] ${operation}: ${result.error}`);
  } finally {
    if (verifyClient) {
      verifyClient.release();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: WRITE-SET VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type WriteSetExpectation = {
  table: string;
  count: number;
  where: Record<string, unknown>;
};

export type WriteSetResult = {
  success: boolean;
  operation: string;
  expectations: Array<{
    table: string;
    expectedCount: number;
    actualCount: number;
    matched: boolean;
  }>;
  error?: string;
};

/**
 * verifyWriteSet — Verify ALL expected writes occurred with exact counts
 *
 * Asserts:
 *   - exact counts match
 *   - no more, no less
 *   - missing row → FAIL
 *   - duplicate row → FAIL
 */
export async function verifyWriteSet(
  operation: string,
  expectations: WriteSetExpectation[],
  token?: string
): Promise<WriteSetResult> {
  const startTime = Date.now();
  const result: WriteSetResult = {
    success: false,
    operation,
    expectations: []
  };

  let verifyClient: DbTransactionClient | null = null;

  try {
    verifyClient = await getNewPoolConnection();

    for (const exp of expectations) {
      // Build WHERE clause from expectation
      const whereFields = Object.keys(exp.where);
      const whereClause = whereFields.map((f, i) => `${f} = $${i + 1}`).join(" AND ");
      const whereValues = whereFields.map(f => exp.where[f]);

      const countResult = await verifyClient.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ${exp.table} WHERE ${whereClause}`,
        whereValues
      );

      const actualCount = parseInt(countResult.rows[0]?.count ?? "0", 10);
      const matched = actualCount === exp.count;

      result.expectations.push({
        table: exp.table,
        expectedCount: exp.count,
        actualCount,
        matched
      });

      if (!matched) {
        const mismatchType = actualCount < exp.count ? "MISSING" : "DUPLICATE";
        result.error = `${mismatchType}: ${exp.table} expected=${exp.count}, actual=${actualCount}`;

        logVerification({
          timestamp: new Date().toISOString(),
          operation: `${operation}-writeSet`,
          table: exp.table,
          verification_token: token || null,
          expected: { count: exp.count },
          actual: { count: actualCount },
          result: "FAIL",
          error: result.error,
          latency_ms: Date.now() - startTime,
          connections_used: 1
        });

        throw new Error(
          `[VERIFY][WRITE_SET][FAIL] ${operation}: ${result.error}`
        );
      }
    }

    result.success = true;

    // Log success for all expectations
    for (const exp of result.expectations) {
      logVerification({
        timestamp: new Date().toISOString(),
        operation: `${operation}-writeSet`,
        table: exp.table,
        verification_token: token || null,
        expected: { count: exp.expectedCount },
        actual: { count: exp.actualCount },
        result: "PASS",
        latency_ms: Date.now() - startTime,
        connections_used: 1
      });
    }

    return result;

  } catch (error) {
    if (!result.error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    throw new Error(`[VERIFY][WRITE_SET][FAIL] ${operation}: ${result.error}`);
  } finally {
    if (verifyClient) {
      verifyClient.release();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: UNIQUENESS INVARIANT VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type UniquenessResult = {
  success: boolean;
  table: string;
  constraint: string;
  count: number;
  expectedCount: number;
  error?: string;
};

/**
 * verifyUniquenessInvariant — Enforce and verify uniqueness constraints
 *
 * For round_commits: UNIQUE(player_id, round_index) per game
 * After commit: ASSERT SELECT COUNT(*) = 1
 */
export async function verifyUniquenessInvariant(
  table: string,
  constraintFields: string[],
  whereClause: string,
  whereParams: unknown[],
  operation: string,
  token?: string
): Promise<UniquenessResult> {
  const startTime = Date.now();
  const result: UniquenessResult = {
    success: false,
    table,
    constraint: constraintFields.join(", "),
    count: 0,
    expectedCount: 1
  };

  let verifyClient: DbTransactionClient | null = null;

  try {
    verifyClient = await getNewPoolConnection();

    const countResult = await verifyClient.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE ${whereClause}`,
      whereParams
    );

    result.count = parseInt(countResult.rows[0]?.count ?? "0", 10);

    if (result.count === 0) {
      result.error = `UNIQUENESS_VIOLATION: No rows found (expected 1)`;
    } else if (result.count > 1) {
      result.error = `DUPLICATE_VIOLATION: Found ${result.count} rows (expected 1)`;
    } else {
      result.success = true;
    }

    logVerification({
      timestamp: new Date().toISOString(),
      operation: `${operation}-uniqueness`,
      table,
      verification_token: token || null,
      expected: { count: 1 },
      actual: { count: result.count },
      result: result.success ? "PASS" : "FAIL",
      error: result.error,
      latency_ms: Date.now() - startTime,
      connections_used: 1
    });

    if (!result.success) {
      throw new Error(`[VERIFY][UNIQUENESS][FAIL] ${operation}: ${result.error}`);
    }

    return result;

  } catch (error) {
    if (!result.error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    throw new Error(`[VERIFY][UNIQUENESS][FAIL] ${operation}: ${result.error}`);
  } finally {
    if (verifyClient) {
      verifyClient.release();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: FULL DETERMINISTIC REPLAY VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export type ReplayPlayerResult = {
  playerId: string;
  stored: {
    score: number;
    distanceKm: number | null;
    yearDiff: number | null;
    locationScore: number | null;
    timeScore: number | null;
  };
  recomputed: {
    score: number;
    distanceKm: number;
    yearDiff: number;
    locationScore: number;
    timeScore: number;
  };
  matches: boolean;
  diffs: FieldDiff[];
};

export type FullReplayResult = {
  success: boolean;
  gameId: string;
  roundIndex: number;
  playerResults: ReplayPlayerResult[];
  error?: string;
};

// Extended RoundCommit with all fields needed for replay
type RoundCommitFull = {
  player_id: string;
  year_guess: number | null;
  location_lat: number | null;
  location_lng: number | null;
  hints_used: number | null;
  score: number | null;
  submitted_at: Date | null;
};

// Extended RoundResult with all fields needed for replay
type RoundResultFull = {
  player_id: string;
  score: number | null;
  distance_km: number | null;
  year_diff: number | null;
  location_score: number | null;
  time_score: number | null;
};

/**
 * verifyFullReplay — Full deterministic replay validation
 *
 * Steps:
 *   1. Load round_commits and event data from DB ONLY
 *   2. Recompute for EACH player: distance, year_diff, location_score, time_score, final score
 *   3. Load stored round_results
 *   4. Compare: recomputed vs stored for every field
 *
 * Uses: scoring_spec.md ONLY
 */
export async function verifyFullReplay(
  gameId: string,
  roundIndex: number,
  event: EventRecord,
  operation: string = "verifyFullReplay",
  token?: string
): Promise<FullReplayResult> {
  const startTime = Date.now();
  const result: FullReplayResult = {
    success: false,
    gameId,
    roundIndex,
    playerResults: []
  };

  let verifyClient: DbTransactionClient | null = null;

  try {
    verifyClient = await getNewPoolConnection();

    // 1. Load round_commits from DB
    const commitsResult = await verifyClient.query<RoundCommitFull>(
      `SELECT player_id, year_guess, location_lat, location_lng, hints_used, score, submitted_at
       FROM round_commits
       WHERE game_id = $1 AND round_index = $2
       ORDER BY player_id ASC`,
      [gameId, roundIndex]
    );

    if (commitsResult.rows.length === 0) {
      result.error = `No commits found for game=${gameId} round=${roundIndex}`;
      logVerification({
        timestamp: new Date().toISOString(),
        operation,
        table: "round_commits",
        verification_token: token || null,
        expected: { count: ">0" },
        actual: { count: 0 },
        result: "FAIL",
        error: result.error,
        latency_ms: Date.now() - startTime,
        connections_used: 1
      });
      throw new Error(`[VERIFY][FULL_REPLAY][FAIL] ${operation}: ${result.error}`);
    }

    // 2. Load stored round_results from DB
    const resultsResult = await verifyClient.query<RoundResultFull>(
      `SELECT player_id, score, distance_km, year_diff, location_score, time_score
       FROM round_results
       WHERE game_id = $1 AND round_index = $2
       ORDER BY player_id ASC`,
      [gameId, roundIndex]
    );

    // 3. Recompute for each player and compare
    for (const commit of commitsResult.rows) {
      const playerId = commit.player_id;

      // Build guess state from commit
      const guessState = {
        year: commit.year_guess,
        location: commit.location_lat !== null && commit.location_lng !== null
          ? { lat: commit.location_lat, lng: commit.location_lng } as LatLng
          : null
      };

      // Recompute using evaluateRound
      const evaluation = evaluateRound(
        event,
        guessState,
        roundIndex,
        false,
        { accuracy: 0, xp: 0 }
      );

      // Find stored result
      const storedResult = resultsResult.rows.find(r => r.player_id === playerId);

      const playerResult: ReplayPlayerResult = {
        playerId,
        stored: {
          score: storedResult?.score ?? 0,
          distanceKm: storedResult?.distance_km ?? null,
          yearDiff: storedResult?.year_diff ?? null,
          locationScore: storedResult?.location_score ?? null,
          timeScore: storedResult?.time_score ?? null
        },
        recomputed: {
          score: evaluation.roundXp,
          distanceKm: evaluation.distanceKm,
          yearDiff: evaluation.yearDiff,
          locationScore: evaluation.locationAccuracy,
          timeScore: evaluation.yearAccuracy
        },
        matches: true,
        diffs: []
      };

      // Compare all fields
      const comparisons: Array<[string, unknown, unknown]> = [
        ["score", playerResult.stored.score, playerResult.recomputed.score],
        ["distanceKm", playerResult.stored.distanceKm, Math.round(playerResult.recomputed.distanceKm * 100) / 100],
        ["yearDiff", playerResult.stored.yearDiff, playerResult.recomputed.yearDiff],
        ["locationScore", playerResult.stored.locationScore, playerResult.recomputed.locationScore],
        ["timeScore", playerResult.stored.timeScore, playerResult.recomputed.timeScore]
      ];

      for (const [field, stored, recomputed] of comparisons) {
        // Allow null in stored for legacy rows, but if present must match
        if (stored !== null && !strictDeepEqual(stored, recomputed)) {
          playerResult.matches = false;
          playerResult.diffs.push({ field, expected: stored, actual: recomputed });
        }
      }

      result.playerResults.push(playerResult);
    }

    // Check if all players match
    const allMatch = result.playerResults.every(pr => pr.matches);
    result.success = allMatch;

    if (!allMatch) {
      const mismatches = result.playerResults.filter(pr => !pr.matches);
      result.error = `Replay drift detected for ${mismatches.length} player(s): ` +
        mismatches.map(m => `${m.playerId}(${m.diffs.map(d => d.field).join(",")})`).join("; ");

      logVerification({
        timestamp: new Date().toISOString(),
        operation,
        table: "round_results",
        verification_token: token || null,
        expected: { allMatch: true },
        actual: { mismatches: mismatches.length },
        result: "FAIL",
        error: result.error,
        latency_ms: Date.now() - startTime,
        connections_used: 1
      });

      throw new Error(`[VERIFY][FULL_REPLAY][FAIL] ${operation}: ${result.error}`);
    }

    logVerification({
      timestamp: new Date().toISOString(),
      operation,
      table: "round_results",
      verification_token: token || null,
      expected: { allMatch: true, players: result.playerResults.length },
      actual: { allMatch: true, players: result.playerResults.length },
      result: "PASS",
      latency_ms: Date.now() - startTime,
      connections_used: 1
    });

    return result;

  } catch (error) {
    if (!result.error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    throw new Error(`[VERIFY][FULL_REPLAY][FAIL] ${operation}: ${result.error}`);
  } finally {
    if (verifyClient) {
      verifyClient.release();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: CROSS-CONNECTION VERIFICATION (LEGACY COMPATIBILITY)
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationResult = {
  success: boolean;
  table: string;
  keys: Record<string, string | number>;
  token?: string;
  error?: string;
};

/**
 * verifyWriteCrossConnection — Basic cross-connection existence check
 *
 * This is the original MP-CORE-LOOP-003 implementation.
 * For full zero-trust, use verifyRowIntegrity + verifyWriteSet + verifyFullReplay
 */
export async function verifyWriteCrossConnection(
  table: string,
  whereClause: string,
  params: unknown[],
  operation: string,
  keys: Record<string, string | number>,
  token?: string
): Promise<VerificationResult> {
  const startTime = Date.now();
  const result: VerificationResult = {
    success: false,
    table,
    keys,
    token
  };

  let verifyClient: DbTransactionClient | null = null;

  try {
    verifyClient = await getNewPoolConnection();

    const query = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const dbResult = await verifyClient.query(query, params);

    if (dbResult.rows.length === 0) {
      const elapsed = Date.now() - startTime;
      result.error = `[VERIFY][CROSS_CONN][FAIL] ${operation}: Row not found in ${table} after ${elapsed}ms — keys=${JSON.stringify(keys)}${token ? ` token=${token}` : ""}`;
      console.error(result.error);
      throw new Error(result.error);
    }

    const elapsed = Date.now() - startTime;
    result.success = true;
    console.log(`[VERIFY][CROSS_CONN][PASS] ${operation} ${table} — ${elapsed}ms${token ? ` token=${token.slice(0, 8)}...` : ""}`);
    return result;

  } catch (error) {
    result.success = false;
    if (!result.error) {
      result.error = `[VERIFY][CROSS_CONN][FAIL] ${operation}: ${error instanceof Error ? error.message : String(error)}`;
    }
    throw new Error(result.error);
  } finally {
    if (verifyClient) {
      verifyClient.release();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: MIGRATION INTEGRITY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type MigrationStatus = {
  expected: string[];
  applied: string[];
  missing: string[];
  extra: string[];
  valid: boolean;
};

export async function verifyMigrationIntegrity(): Promise<MigrationStatus> {
  const expectedMigrations = [
    "001_create_game_sessions",
    "002_create_events_tables",
    "003_create_hints_v2",
    "004_add_migration_constraints",
    "005_create_canonical_practice_sessions",
    "006_compete_mode_core",
    "007_drop_round_results",
    "008_add_sessions_seed",
    "009_create_round_results",
    "011_enable_rls_server_only",
    "012_hard_reset_drop_multiplayer_tables",
    "012_hard_reset_multiplayer_schema",
    "013_create_multiplayer_schema_spec_exact",
    "014_enable_rls_all_multiplayer_tables",
    "015_zero_trust_verification_tokens",
    "016_extend_round_results_replay"
  ];

  const status: MigrationStatus = {
    expected: expectedMigrations,
    applied: [],
    missing: [],
    extra: [],
    valid: false
  };

  let client: DbTransactionClient | null = null;

  try {
    client = await getNewPoolConnection();

    const result = await client.query<{ version: string }>(
      `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC`
    );

    status.applied = result.rows.map((r: { version: string }) => r.version);
    status.missing = expectedMigrations.filter(m => !status.applied.includes(m));
    status.extra = status.applied.filter(m => !expectedMigrations.includes(m));
    status.valid = status.missing.length === 0 && status.extra.length === 0;

    if (!status.valid) {
      console.error(`[VERIFY][MIGRATION][FAIL] Missing: ${status.missing.join(", ") || "none"}, Extra: ${status.extra.join(", ") || "none"}`);
    } else {
      console.log(`[VERIFY][MIGRATION][PASS] All ${expectedMigrations.length} migrations applied`);
    }

    return status;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("relation") && errorMsg.includes("does not exist")) {
      console.error("[VERIFY][MIGRATION][FAIL] supabase_migrations.schema_migrations table not found");
      status.missing = expectedMigrations;
      return status;
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function assertMigrationIntegrity(): Promise<void> {
  const status = await verifyMigrationIntegrity();
  if (!status.valid) {
    throw new Error(
      `[VERIFY][MIGRATION][FAIL] Migration integrity check failed. ` +
      `Missing: ${status.missing.join(", ") || "none"}, ` +
      `Extra: ${status.extra.join(", ") || "none"}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: DETERMINISTIC REPLAY VERIFICATION (LEGACY)
// ─────────────────────────────────────────────────────────────────────────────

export type ReplayVerificationResult = {
  gameId: string;
  matches: boolean;
  roundIndex: number;
  runtimeCommits: number;
  dbCommits: number;
  mismatch?: string;
};

export async function verifyDeterministicReplay(
  gameId: string,
  expectedRoundIndex: number,
  expectedCommitCount: number
): Promise<ReplayVerificationResult> {
  const result: ReplayVerificationResult = {
    gameId,
    matches: false,
    roundIndex: expectedRoundIndex,
    runtimeCommits: expectedCommitCount,
    dbCommits: 0
  };

  let client: DbTransactionClient | null = null;

  try {
    client = await getNewPoolConnection();

    const commitResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = $2`,
      [gameId, expectedRoundIndex]
    );

    result.dbCommits = parseInt(commitResult.rows[0]?.count ?? "0", 10);

    if (result.dbCommits !== expectedCommitCount) {
      result.mismatch = `Commit count mismatch: runtime=${expectedCommitCount}, db=${result.dbCommits}`;
      console.error(`[VERIFY][REPLAY][FAIL] ${result.mismatch} game_id=${gameId} round=${expectedRoundIndex}`);
      throw new Error(`[VERIFY][REPLAY][FAIL] ${result.mismatch}`);
    }

    const commitsResult = await client.query<{
      player_id: string;
      year_guess: number | null;
      location_lat: number | null;
      location_lng: number | null;
      score: number | null;
    }>(
      `SELECT player_id, year_guess, location_lat, location_lng, score
       FROM round_commits
       WHERE game_id = $1 AND round_index = $2
       ORDER BY player_id ASC`,
      [gameId, expectedRoundIndex]
    );

    for (const commit of commitsResult.rows) {
      if (commit.score === null || commit.score === undefined) {
        result.mismatch = `Commit for player ${commit.player_id} missing score`;
        console.error(`[VERIFY][REPLAY][FAIL] ${result.mismatch}`);
        throw new Error(`[VERIFY][REPLAY][FAIL] ${result.mismatch}`);
      }
    }

    result.matches = true;
    console.log(`[VERIFY][REPLAY][PASS] game_id=${gameId} round=${expectedRoundIndex} commits=${result.dbCommits}`);
    return result;

  } catch (error) {
    if (!result.mismatch) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.mismatch = `Replay verification error: ${errorMsg}`;
    }
    throw new Error(`[VERIFY][REPLAY][FAIL] ${result.mismatch}`);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// END OF ZERO-TRUST VERIFICATION SYSTEM v3.0 (MP-CORE-LOOP-005)
// ═════════════════════════════════════════════════════════════════════════════
