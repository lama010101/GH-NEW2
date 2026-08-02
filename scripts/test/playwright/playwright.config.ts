import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // Tests need to run sequentially for shared resources
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid conflicts between tests
  timeout: 2700000, // 45min per test — 6-player x 2-game x 2-round x 19-edge-case suite under heavy local dev load needs generous budget
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iPhone 14',
      use: { ...devices['iPhone 14'] },
      testMatch: /task-02-iphone-navbar\.spec\.ts/,
    },
    {
      name: 'sync-golden',
      testMatch: /sync-compete-golden-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      timeout: 300000, // 5-min cap — under heavy dev load, login + 2 rounds + play-again needs headroom
      retries: 0, // no retries — a slow gate gets bypassed; fix flakiness, don't retry past it
    },
    {
      name: 'relax-golden',
      testMatch: /relax-golden-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      timeout: 300000, // 5-min cap — manual burn-in; mirror sync-golden budget
      retries: 1, // switch to retries:0 once wired to pre-push
    },
    {
      name: 'practice-golden',
      testMatch: /practice-golden-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      timeout: 300000, // 5-min cap — manual burn-in
      retries: 1, // switch to retries:0 once wired to pre-push
    },
  ],
  globalSetup: require.resolve('./fixtures/auth'),
  // globalSetup returns the teardown function; do not set a separate globalTeardown path
  // Run setup-auth after globalSetup to create storageState files
  // This is handled by modifying globalSetup to call setup-auth
});
