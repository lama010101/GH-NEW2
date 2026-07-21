# Database Connection Guide

This guide documents how the Guess-History application connects to Supabase (Postgres + PostgREST) and how developers can verify that connection.

The authoritative connection setup lives in:

- `src/core/supabaseBrowser.ts` — browser-side Supabase client
- `src/core/supabaseServer.ts` — server-side Supabase clients
- `src/server/db.ts` — direct `pg` pool used by server-side game logic

## Required environment variables

Create a `.env.local` file in the repo root. The variables that must be present for local development are:

```env
# Supabase PostgREST endpoint (public + used by SSR/auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase Service Role key (server-side only, never exposed to the browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Direct PostgreSQL connection string (used by src/server/db.ts Pool)
# Use the Supabase pooler/transaction string, e.g.:
SUPABASE_DB_CONNECTION=postgresql://postgres.project-ref:password@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

### Optional variables

- `SUPABASE_DB_POOLER` — some scripts prefer this variable and fall back to `SUPABASE_DB_CONNECTION`
- `NEXT_PUBLIC_PARTY_KIT_HOST` — PartyKit durable object host, e.g. `localhost:1999` for local dev
- `PARTYKIT_SECRET` — used by `src/server/partykitAuth.ts` to authenticate DO requests
- `ENABLE_ZERO_TRUST=true` — turns on the execution-proof verification system in `src/server/db.ts`
- `ADMIN_BYPASS_TOKEN` — optional middleware bypass token

## Connection patterns

### 1. Server-side direct PostgreSQL pool

Game engine code uses the singleton pool from `src/server/db.ts`:

```typescript
import { getDbPool } from "@/server/db";

const result = await getDbPool().query(
  "SELECT current_database() AS db, version() AS v"
);
```

The pool is created at first use, validates the connection immediately, and hard-fails on startup if `SUPABASE_DB_CONNECTION` is missing. See `src/server/db.ts` lines 29–97.

### 2. Server-side Supabase client (service role)

For server components / API routes that need PostgREST access with RLS bypass:

```typescript
import { createSupabaseServerClient } from "@/core/supabaseServer";

const supabase = createSupabaseServerClient();
const { data, error } = await supabase.from("sessions").select("*");
```

### 3. Cookie-authenticated server client

For API routes that must act on behalf of the logged-in user:

```typescript
import { createAuthenticatedServerClient } from "@/core/supabaseServer";

const supabase = createAuthenticatedServerClient();
```

### 4. Browser client

Client components import the singleton browser client:

```typescript
import { supabaseBrowser } from "@/core/supabaseBrowser";
```

## Verifying the connection

### Validate the connection-string format

```bash
npx tsx scripts/validateConnection.ts
```

### List all database tables

```bash
npx tsx --env-file=.env.local scripts/listTables.ts
```

### Inspect core multiplayer schema

```bash
npx tsx --env-file=.env.local scripts/check_schema.ts
```

### Audit core tables and RLS status

```bash
npx tsx --env-file=.env.local scripts/audit-tables.ts
```

### Apply local SQL migrations

Historical seed migrations live in `scripts/migrations/` and can be applied manually:

```bash
npx tsx --env-file=.env.local scripts/runMigrations.ts
```

Production/current migrations live in `supabase/migrations/` and are normally applied with the Supabase CLI:

```bash
supabase db push
```

## Troubleshooting

### "SUPABASE_DB_CONNECTION environment variable is REQUIRED"

`src/server/db.ts` refuses to start without a direct Postgres connection. Ensure `.env.local` contains a valid `SUPABASE_DB_CONNECTION` string and that your shell has loaded it (e.g. `source .env.local` or use `--env-file=.env.local` with `tsx`).

### "NEXT_PUBLIC_SUPABASE_URL is not set"

The browser client and SSR helpers require `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These variables must be present at build time and at runtime.

### "Invalid API key"

- Confirm the key in `SUPABASE_SERVICE_ROLE_KEY` is the service-role key, not the anon key.
- Check for trailing whitespace or newlines in `.env.local`.
- Verify the key is still valid in the Supabase dashboard.

### `getaddrinfo ENOTFOUND` / connection timeout

- Confirm the project ref in `NEXT_PUBLIC_SUPABASE_URL` matches the user in `SUPABASE_DB_CONNECTION`.
- For the pooler string, use the host and port shown in Supabase Dashboard → Database → Connect → "Transaction" pooler.
- Ensure no local firewall/VPN is blocking port `6543`.

### SSL certificate errors

The `pg` pool sets `ssl: { rejectUnauthorized: false }` for development. Do not disable SSL verification in production.

## Security notes

- Never commit `.env.local` or any file containing service-role keys.
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server-side code.
- The browser client must use `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
- All state mutations must go through `src/server/sessionCore.ts` and be written to PostgreSQL; PartyKit is a runtime executor, not a source of truth.

## Useful scripts reference

| Script | Purpose |
|---|---|
| `scripts/validateConnection.ts` | Parse and DNS-check `SUPABASE_DB_CONNECTION` |
| `scripts/listTables.ts` | List every table by schema |
| `scripts/check_schema.ts` | Inspect `sessions` / `session_players` columns |
| `scripts/audit-tables.ts` | Check core tables, columns, and RLS |
| `scripts/runMigrations.ts` | Apply all `.sql` files under `scripts/migrations/` |
