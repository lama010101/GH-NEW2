# GH-NEW2 Session Orientation — Secrets & Environment

## Project

- **Repo:** `lama010101/GH-NEW2`
- **Project:** Guess-History
- **Runtime:** Next.js 14 + Supabase + PartyKit

## Required secrets

The following Supabase credentials are required for `npm run dev` / `npm run build` and for any server-side Supabase client:

| Env var | Devin qualified reference | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `secret:repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `secret:repo:lama010101/GH-NEW2:NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `secret:repo:lama010101/GH-NEW2:SUPABASE_SERVICE_ROLE_KEY` | Service-role key for admin SDK calls |
| `SUPABASE_DB_CONNECTION` | `secret:repo:lama010101/GH-NEW2:SUPABASE_DB_CONNECTION` | PostgreSQL pooler connection string |

These secrets are stored in Devin's platform secrets store as repo-scoped secrets for `lama010101/GH-NEW2`. They were saved via `suggest_save_secret` in session `devin-ee8acd1a3e9340e69ad047d75e67ea2f` on 2026-07-21 05:15 UTC.

## How secrets are loaded

1. **Official mechanism:** Devin writes repo secrets to `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` and should source them automatically when working in the repo.
2. **Current working fallback (configured in the repo blueprint):** The `maintenance` step appends `source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets` to Devin's `$ENVRC` (`/opt/.devin/envrc`) during snapshot builds. Because Devin sources `$ENVRC` at shell startup, every new shell will have the four variables exported.
3. **Result:** `env | grep -i SUPABASE` should print all four values in a fresh session from a snapshot that was built after the blueprint change.

> **Status:** The blueprint change has been submitted as a Devin environment suggestion. It must be approved and the snapshot must be rebuilt before new sessions auto-load the values.

## Manual fallback (if auto-loading is not yet active)

Run one of these in a new shell:

```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
```

Or append it to Devin's envrc once per session:

```bash
echo "source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets" >> /opt/.devin/envrc
```

Then verify:

```bash
env | grep -i SUPABASE
```

## Build / dev commands

Do **not** prefix commands with placeholder values. Run:

```bash
npm run build
npm run dev
```

The real `NEXT_PUBLIC_*` values are injected from the environment. Placeholder prefixes have been removed from the repo blueprint's `knowledge.build` and `knowledge.dev` entries.

## Security notes

- Do not commit `.env*` files or any secret values.
- The actual secret values are never written to the repo or the blueprint YAML; only a `source` path to Devin's runtime secrets file is persisted in `$ENVRC`.
- `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets` is mounted by Devin at session start and is not part of the repository.
