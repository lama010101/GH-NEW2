// DOMAIN-BUILD-ORIGINALLOWLIST-1116-009 — exact-host Origin allowlist.
//
// The realtime worker (partykit/server.ts) derives detectedBaseUrl from the
// client-controlled Origin header. That value becomes the base for
// server-to-server fetches carrying x-partykit-secret, so it MUST be an
// exact-host match — substring matching lets origins like
// "https://guess-history.com.evil.com" pass and leaks PARTYKIT_SECRET.
//
// This module is the single source of truth for trusted origins. The host
// allowlist lives here only; callers must not duplicate it.
//
// Rules:
//   - null/undefined/empty or unparseable -> null
//   - the raw header must equal u.origin exactly (rejects paths, userinfo,
//     ports on default-scheme hosts, and any trailing junk)
//   - production hosts require https: and an exact hostname match
//   - local hosts allow http: or https: on any port
//   - everything else (incl. *.vercel.app, *.partykit.dev) -> null so the
//     caller falls back to env NEXTJS_BASE_URL

const TRUSTED_HTTPS_HOSTS = new Set([
  "guess-history.com",
  "www.guess-history.com",
  "digthepast.org",
  "www.digthepast.org",
]);

const TRUSTED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function resolveTrustedBaseUrl(
  origin: string | null | undefined,
): string | null {
  if (!origin) return null;

  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }

  if (u.origin !== origin) return null;

  if (u.protocol === "https:" && TRUSTED_HTTPS_HOSTS.has(u.hostname)) {
    return u.origin;
  }

  if (
    (u.protocol === "http:" || u.protocol === "https:") &&
    TRUSTED_LOCAL_HOSTS.has(u.hostname)
  ) {
    return u.origin;
  }

  return null;
}
