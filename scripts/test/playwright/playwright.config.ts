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
  timeout: 300000, // 5min per test — full 3-game/5-round/8-edge-case suite against prod latency needs more than 60s
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
  ],
  globalSetup: require.resolve('./fixtures/auth'),
  globalTeardown: require.resolve('./fixtures/auth'),
  // Run setup-auth after globalSetup to create storageState files
  // This is handled by modifying globalSetup to call setup-auth
});
