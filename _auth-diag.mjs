import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const networkErrors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('requestfailed', (req) => {
  networkErrors.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
});

console.log('=== Navigating to /home ===');
await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('domcontentloaded').catch(() => undefined);
console.log('URL after redirect:', page.url());

console.log('=== Waiting for auth modal ===');
const modal = page.getByTestId('auth-modal').first();
await modal.waitFor({ state: 'visible', timeout: 15000 });
console.log('Auth modal visible!');

console.log('=== Filling credentials ===');
await page.getByTestId('auth-email-input').first().fill('gh-test-player-1@test.guess-history.com');
await page.getByTestId('auth-password-input').first().fill('TestPass123!');
console.log('=== Clicking submit ===');
await page.getByTestId('auth-submit-btn').first().click();

console.log('=== Waiting up to 15s for modal to detach ===');
try {
  await modal.waitFor({ state: 'detached', timeout: 15000 });
  console.log('SUCCESS: Modal detached (login worked!)');
  console.log('URL after login:', page.url());
} catch (err) {
  console.log('FAIL: Modal did not detach');
  console.log('=== Console errors ===');
  for (const e of consoleErrors) console.log('  CONSOLE:', e);
  console.log('=== Page errors ===');
  for (const e of pageErrors) console.log('  PAGE:', e);
  console.log('=== Network errors ===');
  for (const e of networkErrors) console.log('  NET:', e);
  const text = await page.textContent('[data-testid="auth-modal"]').catch(() => 'null');
  console.log('=== Modal text ===');
  console.log('  ', text?.slice(0, 800));
}

await browser.close();
