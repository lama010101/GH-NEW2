import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('PAGE_ERROR: ' + err.message));

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
const modal = page.getByTestId('auth-modal').first();
await modal.waitFor({ state: 'visible', timeout: 15000 });

await page.getByTestId('auth-email-input').first().fill('gh-test-player-1@test.guess-history.com');
await page.getByTestId('auth-password-input').first().fill('TestPass123!');
await page.getByTestId('auth-submit-btn').first().click();

// Poll for auth cookies every 1s for 30s
const AUTH_COOKIE = 'sb-gzvixlvkwjsrtmtybtkf-auth-token';
let cookieFound = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const cookies = await ctx.cookies();
  const authCookies = cookies.filter(c => c.name === AUTH_COOKIE || c.name.startsWith(AUTH_COOKIE + '.'));
  if (authCookies.length > 0) {
    console.log(`Cookie found at ${i+1}s: ${authCookies.map(c => c.name).join(', ')}`);
    cookieFound = true;
    break;
  }
}

if (!cookieFound) {
  console.log('No auth cookie found after 30s');
}

console.log('Console errors:', consoleErrors.length);
for (const e of consoleErrors) console.log('  ', e);

// Check if modal is still visible
const stillVisible = await modal.isVisible().catch(() => false);
console.log('Modal still visible:', stillVisible);
console.log('URL:', page.url());

// If cookie found, try navigating to /home
if (cookieFound) {
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  console.log('After navigate to /home, URL:', page.url());
  const homeText = await page.textContent('body').catch(() => '');
  console.log('Home page text (first 200):', homeText?.slice(0, 200));
}

await browser.close();
