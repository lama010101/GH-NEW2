// AUTH-TEST-TWOCTXLOCK-CHARACTERIZE-1013-003 — standalone Playwright config for
// the auth-lock characterization harness. NOT referenced by the pre-push hook,
// CI, or package.json scripts. Run with:
//   npx playwright test --config=scripts/test/playwright/characterization/playwright.config.ts
import { defineConfig } from "@playwright/test";
import path from "node:path";

const MOCK_PORT = 3999;
const APP_PORT = 3100;
const PG_PORT = 5433;
const REPO_ROOT = path.resolve(__dirname, "../../../..");
export const MOCK_BASE = `http://localhost:${MOCK_PORT}`;
export const APP_BASE = `http://localhost:${APP_PORT}`;

// Every auth/REST host the app could possibly use is bound to the mock.
// Asserted inside the harness too: no request may leave localhost.
const env = {
  NEXT_PUBLIC_SUPABASE_URL: MOCK_BASE,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
  SUPABASE_URL: MOCK_BASE,
  SUPABASE_SECRET_KEY_PROD: "dummy-secret-key",
  SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key",
  NEXT_PUBLIC_APP_URL: APP_BASE,
  NEXTJS_BASE_URL: APP_BASE,
  NEXT_PUBLIC_PARTY_KIT_HOST: "localhost:1999",
  // src/server/db.ts HALTS the dev server when its startup SELECT fails —
  // point it at the wire-protocol mock so DB-touching routes cannot kill the
  // server. It never reaches a real database.
  SUPABASE_DB_CONNECTION: `postgresql://mock:mock@localhost:${PG_PORT}/mock`,
  DATABASE_URL: `postgresql://mock:mock@localhost:${PG_PORT}/mock`,
  NODE_ENV: "development" as const,
};

export default defineConfig({
  testDir: ".",
  testMatch: /twoctx-lock\.spec\.ts/,
  timeout: 150_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: APP_BASE,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: [
    {
      command: `node ${__dirname}/mock-supabase.mjs`,
      url: `${MOCK_BASE}/__health`,
      reuseExistingServer: false,
      env: { ...env, MOCK_PORT: String(MOCK_PORT) },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
    {
      command: `node ${__dirname}/mock-postgres.mjs`,
      port: PG_PORT, // TCP probe — the pg protocol has no HTTP endpoint
      reuseExistingServer: false,
      env: { MOCK_PG_PORT: String(PG_PORT) },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `${APP_BASE}/login`,
      cwd: REPO_ROOT,
      reuseExistingServer: false,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
