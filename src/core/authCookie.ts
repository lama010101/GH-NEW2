/**
 * AUTH-FIX-COOKIECLEAR-IDENTITY-1013-004 — single source of truth for the
 * production auth-cookie Domain and the matching deletion strings.
 *
 * In production the session cookie is written with Domain=.guess-history.com
 * so it is shared between apex and www (see supabaseBrowser.ts cookieOptions
 * and middleware.ts). A deletion cookie must carry the SAME Domain attribute
 * to remove it — expiring `path=/` alone (host-only) only clears cookies
 * that were set host-only, which is why forceClearAuthStorage() silently
 * failed to clear the real session cookie in production (localhost has no
 * Domain attribute, so the bug was unreproducible in dev).
 */

export const AUTH_COOKIE_DOMAIN =
  process.env.NODE_ENV === "production" ? ".guess-history.com" : undefined;

/**
 * Deletion `document.cookie` strings for a cookie name: one host-only string
 * (no Domain attribute — clears cookies set without Domain, e.g. localhost
 * dev or legacy writes), plus one Domain-scoped string when
 * AUTH_COOKIE_DOMAIN is defined (required to remove the production
 * `.guess-history.com` cookie — browsers treat host-only and Domain=
 * cookies as distinct entries). Both use path=/ and an epoch expiry.
 * Chunked names (sb-<ref>-auth-token.0/.1) are plain names to this helper —
 * callers must apply it per cookie name. Pure function: no I/O.
 */
export function authCookieDeletionStrings(name: string): string[] {
  const hostOnly = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  if (!AUTH_COOKIE_DOMAIN) {
    return [hostOnly];
  }
  return [hostOnly, `${hostOnly}; domain=${AUTH_COOKIE_DOMAIN}`];
}
