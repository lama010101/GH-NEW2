import { BrowserContext, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { type TestUser } from '../fixtures/auth';

// Load env from .env.local so this helper can be used standalone in specs and
// throwaway verification scripts.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required Supabase environment variables for auth-cookie helper');
}

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
export const AUTH_COOKIE_NAME = `sb-${projectRef}-auth-token`;

export interface SessionBundle {
  cookieName: string;
  cookieValue: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const sessionCache = new Map<string, SessionBundle>();

/**
 * Obtain a Supabase session for a test user via the password-grant auth API.
 *
 * Results are cached per process keyed by user email, so repeated calls for
 * the same user reuse the existing session instead of re-requesting a token.
 */
export async function getSession(user: TestUser): Promise<SessionBundle> {
  const cached = sessionCache.get(user.email);
  if (cached) return cached;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Auth token fetch failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: { id: string };
  };

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: data.expires_at,
    token_type: data.token_type,
    user: data.user,
  };

  const cookieValue = JSON.stringify(session);
  const bundle: SessionBundle = {
    cookieName: AUTH_COOKIE_NAME,
    cookieValue,
    userId: data.user.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };

  sessionCache.set(user.email, bundle);
  return bundle;
}

function getContext(pageOrContext: Page | BrowserContext): BrowserContext {
  // Pages have a `goto` method; BrowserContexts do not.
  return 'goto' in pageOrContext ? (pageOrContext as Page).context() : pageOrContext;
}

/**
 * Add the Supabase auth-token cookie to a Playwright browser context so the
 * page is authenticated without using the AuthModal UI.
 *
 * Accepts either a `Page` or a `BrowserContext`. Cookie shape matches the one
 * used successfully by `daily-golden-path.spec.ts` and `practice-golden-path.spec.ts`.
 */
export async function authenticatePage(
  pageOrContext: Page | BrowserContext,
  user: TestUser,
): Promise<SessionBundle> {
  const bundle = await getSession(user);
  const ctx = getContext(pageOrContext);

  await ctx.addCookies([
    {
      name: bundle.cookieName,
      value: bundle.cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);

  return bundle;
}
