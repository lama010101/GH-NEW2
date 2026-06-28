import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const supabaseResponses = [];
page.on('response', async (resp) => {
  const url = resp.url();
  if (url.includes('supabase') || url.includes('auth')) {
    const status = resp.status();
    let body = '';
    try { body = await resp.text(); } catch {}
    supabaseResponses.push(`${resp.request().method()} ${url} -> ${status} body=${body.slice(0, 300)}`);
  }
});

console.log('=== Navigating to /home ===');
await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
console.log('URL:', page.url());

const modal = page.getByTestId('auth-modal').first();
await modal.waitFor({ state: 'visible', timeout: 15000 });
console.log('Modal visible');

await page.getByTestId('auth-email-input').first().fill('gh-test-player-1@test.guess-history.com');
await page.getByTestId('auth-password-input').first().fill('TestPass123!');
console.log('=== Clicking submit ===');
await page.getByTestId('auth-submit-btn').first().click();

// Wait for network to settle
await page.waitForTimeout(8000);

console.log('=== Supabase/auth responses ===');
for (const r of supabaseResponses) console.log('  ', r);

// Check if auth cookies were set
const cookies = await ctx.cookies();
const authCookies = cookies.filter(c => c.name.includes('auth-token'));
console.log('=== Auth cookies ===');
for (const c of authCookies) console.log(`  ${c.name}=${c.value.slice(0, 50)}...`);

// Check current URL
console.log('=== Current URL ===', page.url());

// Check if modal is still visible
const stillVisible = await modal.isVisible().catch(() => false);
console.log('=== Modal still visible:', stillVisible);

// Check page text for any error
const bodyText = await page.textContent('body').catch(() => '');
console.log('=== Body text (first 300) ===', bodyText?.slice(0, 300));

await browser.close();
