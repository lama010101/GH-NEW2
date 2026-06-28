import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const allRequests = [];
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes('localhost:3000/_next') && !url.includes('favicon') && !url.includes('.woff') && !url.includes('.css') && !url.includes('.js')) {
    allRequests.push(`${req.method()} ${url}`);
  }
});

console.log('=== Navigating to /login ===');
await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
console.log('URL:', page.url());

// Check if supabaseBrowser is available
const sbInfo = await page.evaluate(() => {
  try {
    // Check if the Supabase client is initialized
    const results = {};
    results.envUrl = window.__NEXT_DATA__?.runtimeConfig?.NEXT_PUBLIC_SUPABASE_URL || 'not in runtimeConfig';
    // Try to find supabase in module scope - won't work directly, but let's check window
    results.hasSupabase = typeof window.supabase !== 'undefined';
    return results;
  } catch (e) {
    return { error: e.message };
  }
});
console.log('=== Browser env ===', JSON.stringify(sbInfo));

// Fill and submit via UI
const modal = page.getByTestId('auth-modal').first();
await modal.waitFor({ state: 'visible', timeout: 15000 });

// Check button state before click
const btnText1 = await page.getByTestId('auth-submit-btn').first().textContent();
console.log('Button text before click:', btnText1);

await page.getByTestId('auth-email-input').first().fill('gh-test-player-1@test.guess-history.com');
await page.getByTestId('auth-password-input').first().fill('TestPass123!');

// Check button state after fill
const btnText2 = await page.getByTestId('auth-submit-btn').first().textContent();
console.log('Button text after fill:', btnText2);

// Check input values
const emailVal = await page.getByTestId('auth-email-input').first().inputValue();
const passVal = await page.getByTestId('auth-password-input').first().inputValue();
console.log('Email input value:', emailVal);
console.log('Password input value:', passVal ? '***' + passVal.slice(-3) : 'EMPTY');

console.log('=== Clicking submit ===');
await page.getByTestId('auth-submit-btn').first().click();

// Wait and check button state
await page.waitForTimeout(2000);
const btnText3 = await page.getByTestId('auth-submit-btn').first().textContent().catch(() => 'N/A');
console.log('Button text 2s after click:', btnText3);

await page.waitForTimeout(5000);
const btnText4 = await page.getByTestId('auth-submit-btn').first().textContent().catch(() => 'N/A');
console.log('Button text 7s after click:', btnText4);

console.log('=== All non-static requests ===');
for (const r of allRequests) console.log('  ', r);

console.log('=== Current URL ===', page.url());
const stillVisible = await modal.isVisible().catch(() => false);
console.log('=== Modal still visible:', stillVisible);

// Check for error text in modal
const modalText = await page.textContent('[data-testid="auth-modal"]').catch(() => '');
const hasError = modalText?.toLowerCase().includes('error') || modalText?.toLowerCase().includes('invalid');
console.log('=== Modal has error text:', hasError);
console.log('=== Modal text (last 200) ===', modalText?.slice(-200));

await browser.close();
