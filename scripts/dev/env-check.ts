// INFRA-BUILD-ENVCHECK-038 — `npm run env:check` preflight (STEP ZERO).
// Offline only: never opens a DB connection, never makes a network call,
// never imports src/server/db.ts. Loads .env.local like
// scripts/test/playwright/helpers/auth-cookie.ts (dotenv default: does NOT
// override existing process.env), evaluates credential candidates against
// EXPECTED_SUPABASE_PROJECT_REF, prints a fixed-width table, and exits:
//   0 = PASS, 1 = FAIL, 2 = usage error.
// A FAIL means the credential set is not provably THIS project's — report
// "BLOCKED: ENV MISMATCH" with the table; never guess or swap credentials.

import * as dotenv from "dotenv";
import * as path from "node:path";
import { EXPECTED_SUPABASE_PROJECT_REF } from "../../src/core/projectRef";
import {
  envCheckFailed,
  evaluateEnv,
  formatRows,
  type EnvCheckContext,
} from "./envCheckCore";

const CONTEXTS: readonly EnvCheckContext[] = ["build", "test", "live-db"];

function usage(): never {
  console.log(
    "Usage: npm run env:check -- --context=<build|test|live-db> [--expected-ref=<ref>]",
  );
  process.exit(2);
}

function main(): void {
  let context: EnvCheckContext | null = null;
  let expectedRef = EXPECTED_SUPABASE_PROJECT_REF;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--context=")) {
      const value = arg.slice("--context=".length);
      if ((CONTEXTS as readonly string[]).includes(value)) {
        context = value as EnvCheckContext;
      } else {
        usage();
      }
    } else if (arg.startsWith("--expected-ref=")) {
      expectedRef = arg.slice("--expected-ref=".length);
    } else {
      usage();
    }
  }
  if (context === null) {
    usage();
  }

  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

  const rows = evaluateEnv(process.env, context, expectedRef);
  console.log(formatRows(rows));
  const failed = envCheckFailed(rows);
  console.log(
    `ENV CHECK: ${failed ? "FAIL" : "PASS"} (context=${context}, expected-ref=${expectedRef})`,
  );
  process.exit(failed ? 1 : 0);
}

main();
