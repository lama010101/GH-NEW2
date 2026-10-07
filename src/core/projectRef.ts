// INFRA-BUILD-ENVCHECK-038 — single source of truth for which Supabase project
// this repo's credentials must belong to. Two products share the Devin Cloud
// secret store under the same env var names, so a PRESENT env var is not proof
// it is ours; only a parsed ref compared against this constant is.
//
// Pure module: no env access, no node-only imports — safe to bundle anywhere.
// Never put a DSN/URL value into an error or a log; callers only get the ref.

export const EXPECTED_SUPABASE_PROJECT_REF = "gzvixlvkwjsrtmtybtkf";

export function parseProjectRefFromSupabaseUrl(url: string): string | null {
  try {
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(url).hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function parseProjectRefFromDsn(dsn: string): string | null {
  try {
    const parsed = new URL(dsn);
    // Pooler form: postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:6543/postgres
    const userMatch = /^postgres\.([a-z0-9]+)$/.exec(parsed.username);
    if (userMatch) {
      return userMatch[1];
    }
    // Direct form: postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
    const hostMatch = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname);
    if (hostMatch) {
      return hostMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}
