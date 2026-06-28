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
  timeout: 1800000, // 30min per test — 6-player x 3-game x 5-round x 19-edge-case suite under heavy local dev load needs generous budget
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
