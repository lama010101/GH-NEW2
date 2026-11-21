/**
 * DOMAIN-MIGRATE-DIGTHEPAST-1114-001 — single source of truth for the
 * production auth-cookie Domain (derived from the serving host) and the
 * matching deletion strings.
 *
 * In production the session cookie is written with a Domain attribute
 * matching the serving host — .digthepast.org on digthepast.org hosts or
 * .guess-history.com on guess-history.com hosts — so it is shared between
 * apex and www (see supabaseBrowser.ts cookieOptions and middleware.ts).
 * A deletion cookie must carry the SAME Domain attribute to remove it —
 * expiring `path=/` alone (host-only) only clears cookies that were set
 * host-only, which is why forceClearAuthStorage() silently failed to clear
 * the real session cookie in production (localhost has no Domain attribute,
 * so the bug was unreproducible in dev). Both domain literals live only in
 * this file.
 */

/**
 * Production auth-cookie Domain for a request/page hostname, or undefined
 * when no Domain attribute should be written: outside production, for a
 * missing host, and for hosts that are neither digthepast.org nor
 * guess-history.com (localhost, *.vercel.app previews, lookalikes such as
 * evil-digthepast.org or digthepast.org.evil.com). The host is lowercased
 * and any :port suffix stripped before matching. Pure function: no I/O.
 */
export function authCookieDomainForHost(
  hostname?: string | null
): string | undefined {
  if (process.env.NODE_ENV !== "production" || !hostname) {
    return undefined;
  }
  const host = hostname.toLowerCase().replace(/:\d+$/, "");
  if (host === "digthepast.org" || host.endsWith(".digthepast.org")) {
    return ".digthepast.org";
  }
  if (host === "guess-history.com" || host.endsWith(".guess-history.com")) {
    return ".guess-history.com";
  }
  return undefined;
}

/**
 * Deletion `document.cookie` strings for a cookie name: one host-only string
 * (no Domain attribute — clears cookies set without Domain, e.g. localhost
 * dev or legacy writes), plus one Domain-scoped string when
 * authCookieDomainForHost(hostname) returns a domain (required to remove a
 * production Domain= cookie — browsers treat host-only and Domain=
 * cookies as distinct entries). Both use path=/ and an epoch expiry.
 * Chunked names (sb-<ref>-auth-token.0/.1) are plain names to this helper —
 * callers must apply it per cookie name. Pure function: no I/O.
 */
export function authCookieDeletionStrings(
  name: string,
  hostname?: string | null
): string[] {
  const hostOnly = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  const domain = authCookieDomainForHost(hostname);
  if (!domain) {
    return [hostOnly];
  }
  return [hostOnly, `${hostOnly}; domain=${domain}`];
}
