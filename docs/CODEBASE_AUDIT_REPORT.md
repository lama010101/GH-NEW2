# GH-NEW Codebase Audit Report

**Date:** 2026-06-18
**Scope:** Full deep investigation — architecture, security, database, frontend, testing, i18n, dependencies, build/deploy, game logic, performance
**Method:** Six parallel read-only subagents; no files modified
**Verdict:** Architecturally sound with strong event-sourcing foundations, but multiple CRITICAL security gaps and significant tech debt in testing/i18n need attention before production hardening.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture & Code Structure](#2-architecture--code-structure)
3. [Security & Authentication](#3-security--authentication)
4. [Database & Schema](#4-database--schema)
5. [Frontend UI & State Management](#5-frontend-ui--state-management)
6. [Game Logic, Scoring & Performance](#6-game-logic-scoring--performance)
7. [Testing](#7-testing)
8. [Internationalization](#8-internationalization)
9. [Dependencies](#9-dependencies)
10. [Build & Deployment](#10-build--deployment)
11. [Consolidated Recommendations](#11-consolidated-recommendations)

---

## 1. Executive Summary

### What this is
A **Next.js 14 + PartyKit + Supabase PostgreSQL** multiplayer history-guessing game. Players guess the year and location of historical events against friends in real-time.

### Architecture verdict
The system implements a strict **DB-authoritative, DO-executor, client-renderer** pattern with event sourcing, FSM-validated transitions, and deterministic state reconstruction. This is a well-considered architecture that prevents client-side state fabrication and ensures replay determinism.

### Top findings by severity

| # | Severity | Finding | Section |
|---|----------|---------|---------|
| 1 | CRITICAL | Overly permissive RLS — any authenticated user can read ANY game's data | §3 |
| 2 | CRITICAL | Hardcoded OAuth redirect URLs (break on env/domain change) | §3 |
| 3 | CRITICAL | Unauthenticated API endpoints expose game snapshots & results | §3 |
| 4 | CRITICAL | 10 of 12 E2E tests skipped — no end-to-end coverage | §7 |
| 5 | CRITICAL | 14 missing French translations + 71 hardcoded English strings | §8 |
| 6 | HIGH | No foreign keys on core multiplayer tables | §4 |
| 7 | HIGH | Missing security headers (X-Frame-Options, HSTS, etc.) | §3 |
| 8 | HIGH | No state parameter validation in OAuth callback (CSRF risk) | §3 |
| 9 | HIGH | Service-role key used in client-facing API route | §3 |
| 10 | HIGH | PartyKit 0.0.115 is pre-release (production risk) | §9 |
| 11 | HIGH | Missing ResizeObserver on Leaflet map (tab-toggle rendering bug) | §5 |
| 12 | HIGH | N+1 query in computeAndWriteRoundResults | §6 |
| 13 | MEDIUM | God file: sessionCore.ts (2392 lines) | §2 |
| 14 | MEDIUM | Large components: RoundActiveSection (978), LobbySection (940) | §5 |
| 15 | MEDIUM | No `.env.example` — onboarding friction | §10 |

### Strengths
- Event sourcing with append-only logs + FSM validation
- Deterministic state reconstruction via `getGameState()`
- All SQL parameterized — zero injection vectors
- Race conditions handled (partial indexes + ON CONFLICT + advisory locks)
- Comprehensive design token system in globals.css
- TypeScript strict mode enabled
- Scoring logic well-tested (22 unit tests)

---

## 2. Architecture & Code Structure

### Layered architecture

```
Client (React)  →  PartyKit DO  →  API Routes  →  sessionCore.ts  →  getGameState.ts  →  PostgreSQL
   renderer         executor        validators      mutation authority   reconstruction     source of truth
```

**Single mutation authority**: PartyKit + API routes only. Client never writes DB directly. Enforced by `assertValidExecutionContext()` in every mutation function (`sessionCore.ts:1212-1218`).

**Single snapshot builder**: `loadCompeteSessionSnapshot()` is the ONLY function that builds snapshots, used by API endpoints, DO cold start, and DO state reconstruction. No parallel logic exists.

### Event sourcing & FSM
- **Event types**: `SESSION_CREATED`, `ROUND_STARTED`, `GUESS_SUBMITTED`, `PRESSURE_APPLIED`, `ROUND_COMPLETE`, `READY_NEXT`, `SESSION_COMPLETE`
- **FSM transitions**: Defined in `eventStream.ts:30-38`, validated at write-time in `eventStore.ts:86-99` and via DB trigger (`trg_validate_event`, migration 027a)
- **Phase authority**: `round_events` table is the ONLY source of phase truth — no inference shortcuts
- **Deterministic ordering**: Events ordered by `id ASC` (BIGSERIAL), not `created_at`

### Data flow (single round)
1. **Lobby → Round**: Client sends `START_GAME` → PartyKit → `POST /api/compete/[gameId]/start` → `startCompeteSession()` writes `SESSION_CREATED` + `ROUND_STARTED` → snapshot broadcast
2. **Guess**: Client sends `SUBMIT_GUESS` → PartyKit → `POST /api/compete/[gameId]/guess` → `submitGuess()` writes `round_commits` + `GUESS_SUBMITTED` event → if all submitted, writes `ROUND_COMPLETE` + computes results → snapshot broadcast
3. **Round complete → next**: Auto-advance timer or all-ready → `POST /api/compete/[gameId]/advance` → `advanceRound()` writes `ROUND_STARTED` (or `SESSION_COMPLETE` if final round)

### Key files

| File | Lines | Role |
|------|-------|------|
| `src/server/sessionCore.ts` | 2392 | **Mutation authority** — all game writes |
| `src/server/getGameState.ts` | 544 | **State reconstruction** — DB → state |
| `src/server/eventStream.ts` | 250 | **FSM & phase derivation** |
| `src/server/eventStore.ts` | 200+ | **Event write pipeline** |
| `partykit/server.ts` | 1469 | **DO-authoritative** WebSocket handler |
| `src/server/db.ts` | 600+ | **DB connection** pool + verification |

### Architectural smells

**1. God file: sessionCore.ts (2392 lines)**
Contains ALL multiplayer mutations: session creation, player management, guess submission, round advancement, scoring. Violates single responsibility. **Recommend splitting** into:
- `sessionLifecycle.ts` (create, join, leave)
- `roundManagement.ts` (start, complete, advance)
- `guessSubmission.ts` (submitGuess, scoring)
- `playerManagement.ts` (ready, kick)

**2. Large component files (>400 lines)**

| Component | Lines | Issue |
|-----------|-------|-------|
| `RoundActiveSection.tsx` | 978 | Map + year picker + submit + sheet controls in one file |
| `LobbySection.tsx` | 940 | Timer + settings + invites + era selection in one file |
| `src/app/profile/page.tsx` | 733 | Multiple sections not extracted |
| `src/app/leaderboard/page.tsx` | 508 | Single large page |
| `src/app/compete/[gameId]/page.tsx` | 588 | 18 useState hooks, 17+ props drilled |
| `RoundCompleteSection.tsx` | 456 | Results + leaderboard + badges |
| `CompetePanel.tsx` | 432 | Home compete card |
| `YearPicker.tsx` | 413 | Slider + display + range controls |

**3. Temporary files in root**
`_temp_check.mjs`, `_temp_insert.mjs`, `_temp_query.mjs`, `_temp_test.mjs`, `_temp_test2.mjs`, `_temp_test3.mjs`, `apply_changes.py`, `apply_fixes.js` — should be deleted or moved to `scripts/temp/`.

**4. Prototype directory**
`src/app/prototype/` contains 9 standalone prototype pages not imported by the main app. Should be documented or moved to `docs/`.

**5. API route duplication**
All 14 compete API routes follow an identical pattern (validate secret, parse body, call sessionCore, return snapshot). Could be reduced with a generic handler factory.

---

## 3. Security & Authentication

### Auth architecture (strengths)
- **PKCE OAuth**: `createBrowserClient` from `@supabase/ssr` with PKCE flow (`supabaseBrowser.ts:16-19`)
- **Cookie-based sessions**: HTTP-only cookies, not localStorage — prevents XSS token theft
- **`getUser()` pattern**: Middleware uses `getUser()` instead of `getSession()` to trigger automatic token refresh (`middleware.ts:43-47`)
- **Dual client pattern**: `createSupabaseServerClient()` (service-role, bypasses RLS) vs `createAuthenticatedServerClient()` (anon key, respects RLS) — clear separation

### CRITICAL findings

**C1. Overly permissive RLS policies**
- **File**: `supabase/migrations/012_consolidated_multiplayer_baseline.sql:117-160`
- **Issue**: `sessions`, `session_players`, `round_commits`, `round_results`, `round_events` all use `USING (true)` for SELECT
- **Impact**: Any authenticated user can read ANY game's data — guesses, scores, events
- **Fix**: Restrict to session participants:
  ```sql
  CREATE POLICY sessions_select_policy ON public.sessions
    FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM session_players
              WHERE game_id = sessions.game_id AND player_id = auth.uid())
    );
  ```

**C2. Hardcoded OAuth redirect URLs**
- **File**: `src/components/AuthModal.tsx:49, 117`
- **Issue**: `redirectTo: "https://guess-history.com/auth/callback"` hardcoded
- **Impact**: Breaks on domain change or non-production environments; OAuth fails silently
- **Fix**: Use `NEXT_PUBLIC_OAUTH_REDIRECT_URL` env var or derive from request origin

**C3. Unauthenticated API endpoints**
- **Files**: `src/app/api/compete/[gameId]/route.ts:7-33`, `src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts:7-30`
- **Issue**: GET endpoints allow unauthenticated access to game snapshots and round results
- **Impact**: Anyone can fetch game data by guessing `gameId`
- **Fix**: Require authentication and validate requester is a session participant

### HIGH findings

**H1. No state parameter validation in OAuth callback**
- **File**: `src/app/auth/callback/route.ts:5-46`
- **Issue**: Only checks `code` parameter, not `state` — CSRF vulnerability

**H2. Service-role key in client-facing route**
- **File**: `src/app/api/compete/join/route.ts:7-10`
- **Issue**: Uses `SUPABASE_SERVICE_ROLE_KEY` directly — bypasses all RLS
- **Fix**: Use `createAuthenticatedServerClient()`

**H3. Weak password validation**
- **File**: `src/components/AuthModal.tsx:75`
- **Issue**: Minimum 6 characters — should be 12+ with complexity requirements

**H4. PARTYKIT_SECRET not constant-time comparison**
- **Files**: All 14 compete API routes
- **Issue**: Uses `!==` operator — vulnerable to timing attacks
- **Fix**: Use `crypto.timingSafeEqual()`

**H5. Incomplete CSP header**
- **File**: `next.config.mjs:24-26`
- **Issue**: Only defines `img-src` — missing `default-src`, `script-src`, `style-src`, `connect-src`, `frame-ancestors`, `base-uri`, `form-action`

**H6. Missing security headers**
- **Issue**: No `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`

**H7. No RLS on translation tables**
- **File**: `supabase/migrations/024_add_translation_tables.sql:6-47`
- **Issue**: `event_translations`, `hint_translations`, `location_translations` have no RLS enabled

**H8. No Zod validation in most API routes**
- Only 4 files use zod; most routes do manual validation inconsistently

### MEDIUM findings
- No rate limiting on any API endpoint
- No session timeout configured
- No session invalidation on password change
- No concurrent session limit
- Weak email validation (only checks non-empty)
- Inconsistent Bearer token extraction (duplicated across routes)
- No UUID validation on game ID parameters in most routes

### Positive security findings
- No hardcoded secrets in source code
- All SQL queries parameterized (zero injection vectors)
- x-partykit-secret header guard on all 14 compete mutation routes
- Bearer token auth on social routes (friends, invitations, notifications)
- Cookie-based auth on user routes (profile, avatar, username)

---

## 4. Database & Schema

### Schema overview
5 core multiplayer tables + 12 supporting tables. All core tables have RLS enabled (but overly permissive — see §3).

| Table | PK | Purpose |
|-------|-----|---------|
| `sessions` | `game_id` (UUID) | Game config (mode, timer, rounds, year range) |
| `session_players` | `(game_id, player_id)` | Roster + ready flags + host |
| `round_commits` | `(game_id, player_id, round_index)` | Player guesses (append-only) |
| `round_results` | `(game_id, round_index, player_id)` | Computed scores (append-only) |
| `round_events` | `id` (BIGSERIAL) | Append-only event log (phase authority) |

### CRITICAL: No foreign keys on core tables
The 5 canonical multiplayer tables have **zero FK constraints**. All integrity is enforced at the application layer. This is an intentional design decision (DB as append-only log, not enforcer) but creates orphaned-row risk if application logic fails.

### Migration issues

**Duplicate migration numbers**: 025, 027, 028 each have two files — execution order is ambiguous.

**Missing migrations 012-023**: Not in repo. Reconstructed in `012_consolidated_multiplayer_baseline.sql`. Fresh DB rebuild from migrations alone will NOT reproduce live schema.

**Idempotency failures**: Migrations 024, 028a, 028b, 033-037, 20260528120000 use `CREATE TABLE` without `IF NOT EXISTS` — fail on re-run.

### Connection pool (`db.ts:44-56`)
- `max: 50`, `min: 2`, `connectionTimeoutMillis: 15000`, `idleTimeoutMillis: 30000`
- Keep-alive enabled
- **Concern**: `ssl.rejectUnauthorized: false` — disables SSL cert validation (acceptable for Supabase but not ideal)
- **Concern**: No pool exhaustion monitoring

### Race condition handling (excellent)
- **Duplicate submissions**: PK constraint + `ON CONFLICT DO NOTHING` on `round_commits`
- **Duplicate ROUND_COMPLETE**: Partial unique index + `ON CONFLICT WHERE event_type = 'ROUND_COMPLETE' DO NOTHING` + `RETURNING id` (only winner computes results)
- **Manual compute race**: `pg_advisory_xact_lock(hashtext(gameId:roundIndex))` serializes callers
- **Room code collision**: SAVEPOINT + 5-attempt retry loop

### SQL injection audit
All 50+ queries in `sessionCore.ts` use parameterized placeholders. Two cases of string interpolation are for placeholder positions (`$1`, `$2`), not values. **Zero SQL injection vectors.**

### Documentation drift
`docs/DATABASE_SCHEMA_STATE.md` is outdated:
- Says `results_auto_advance_sec` default is 10 (actually 90)
- Missing `acc_penalty_when`, `acc_penalty_where` columns
- Missing `idx_round_events_unique_round_started` index
- Missing `round_hints`, `player_global_stats`, `leaderboard_*` tables

---

## 5. Frontend UI & State Management

### State management
**No Context API or Redux.** All state via local `useState` + WebSocket as single source of truth.

- `src/core/identity.ts` (185 lines) — Supabase auth singleton with cached state + promise-based ready signal
- `src/hooks/useCompeteSocket.ts` (215 lines) — WebSocket wrapper, validates snapshots via `isCompeteSessionSnapshot()`
- `src/hooks/useCompeteTimer.ts` (146 lines) — UI-only display timer, auto-submits on expiry

### Prop drilling
`CompeteGamePage` passes **17+ props** to `RoundActiveSection` and **15+ props** to `RoundCompleteSection`. **Recommend GameContext** to reduce coupling.

### Missing memoization
- `useCompeteSocket` returns 9 unmemoized functions — recreated every render, causing unnecessary child re-renders
- `RoundCompleteSection` computes player stats on every render (should use `useMemo`)
- No `React.memo()` wrappers on large components

### CSS strategy
- **20 CSS Module files** — good separation
- **Comprehensive design tokens** in `globals.css` (typography, colors, backgrounds, borders, glass surfaces, shadows)
- **232 hardcoded hex colors** remain in inline styles and CSS modules — should migrate to tokens
- **21 files with `style={{}}` inline styles** — highest in LobbySection (9), YearPicker (9), WhenCard (7), SessionComplete (7)

### Map integration (HIGH RISK)
**`GameMap.tsx` has no `invalidateSize()` / `ResizeObserver`**. When user switches browser tabs or the container resizes (e.g., tab toggle in results), the Leaflet map renders incorrectly until manual interaction. This is a known issue flagged in prior sessions.

**Fix**: Add a `ResizeHandler` component inside `MapContainer`:
```tsx
function ResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
```

### Image handling
- CSP `img-src` is comprehensive (Runware, Firebase, Supabase, OSM, CartoDB, OpenTopoMap, Fastly)
- `next.config.mjs` `remotePatterns` only has 2 entries (Runware, Firebase) — should add Supabase and OSM
- `GameMap.tsx` uses raw `<img>` tags for avatar markers instead of Next.js Image — no optimization, no lazy loading
- No image preloading for event images

### Accessibility gaps
- Submit button has `aria-label="Submit"` ✅
- **Missing**: No `role` attributes on custom components (sheet overlay, modal backdrops)
- **Missing**: No keyboard navigation for game controls
- **Missing**: No focus management in modals (focus trap)
- **Missing**: No text alternative for color-only timer urgency indicator
- **Missing**: No ARIA labels for map click-to-place, year picker, location search

### Mobile responsiveness
- Media queries in 4 CSS module files
- `touch-action: none` properly set on image containers and sheets
- `100dvh` and `100vw` used for full-viewport layouts
- Zoom controls hidden on mobile via media query

---

## 6. Game Logic, Scoring & Performance

### Scoring formulas (`src/core/rules.ts`)

**Location accuracy**: `100 * e^(-distanceKm/1500)` clamped [0,100]
- 0 km = 100%, 1500 km ≈ 37%, 3000 km ≈ 13%
- Null location → MAX_DISTANCE_KM (20,000) → 0%

**Year accuracy**: `100 * e^(-effectiveDiff/40)` where `effectiveDiff = |yearDiff| / sqrt(age/50)`
- Era scaling: older events are more forgiving (sqrt of age/50, min age 50)
- Null year → MAX_YEAR_DIFF (200) → 0%

**XP**: `yearAccuracy + locationAccuracy` (0-200 max)
**Round accuracy**: average of both axes
**Combo accuracy**: minimum of both (stricter)

### Badges
- Gold: 100% | Silver: 95-99% | Bronze: 90-94% | None: <90%
- 3 dimensions: year, location, combo (max 3 badges per round)
- Near-miss detection: 88-89% accuracy without badge

### Hint penalties
- Tiers 1-5: -10, -20, -30, -40, -50 accuracy per axis
- WHEN hints penalize year accuracy, WHERE hints penalize location accuracy
- Clamped at 0 (cannot go negative)

### Edge case handling (solid)
- Both null (timeout) → all zeros, no crash
- Year null only → 0% year, location still scored
- Location null only → 0% location, year still scored
- Invalid coordinates → throws `[GEO_HARD_FAIL]` (validated upstream)
- Haversine handles antimeridian crossing + clamps `sqrt(haversine)` to prevent NaN

### Timer management
- `scheduleRoundTimer()` in PartyKit properly clears existing timers before scheduling new
- `PRESSURE_APPLIED` event can override `roundEndsAt` (timer clamping)
- Grace period for in-flight submissions (15s max wait)
- Results display: 30 seconds (`RESULTS_COUNTDOWN_SECONDS`)

### Performance findings

**N+1 query (HIGH)**: `computeAndWriteRoundResults()` (`sessionCore.ts:2349`) calls `fetchEventById()` inside a loop over commits — same event fetched N times (once per player). Should fetch once before loop.

**Snapshot size (MEDIUM)**: Full snapshot (~50 KB for 5-round, 4-player game) broadcast on every state change. No delta/patch mechanism. ~40+ broadcasts per game = 2+ MB per session.

**Client state (MEDIUM)**: 18 `useState` hooks in compete page — cascading re-renders. Should consolidate with `useReducer`.

**Image loading (LOW)**: No preloading, no Next.js Image optimization for avatars.

### Constants reference

| Constant | Value | File |
|----------|-------|------|
| MAX_DISTANCE_KM | 20,000 | `rules.ts:3` |
| MAX_YEAR_DIFF | 200 | `rules.ts:4` |
| Location decay | 1500 km | `rules.ts:37` |
| Year decay | 40 years | `rules.ts:45` |
| Era min age | 50 years | `rules.ts:42` |
| TIMER_MIN_SEC | 15 | `types.ts:6` |
| TIMER_MAX_SEC | 300 | `types.ts:7` |
| HINT_TOTAL | 12 | `types.ts:9` |
| PRESSURE_CLAMP_SECONDS | 20 | `sessionCore.ts:75` |
| RESULTS_COUNTDOWN_SECONDS | 30 | `sessionCore.ts:76` |
| DB Pool max | 50 | `db.ts:49` |

---

## 7. Testing

### Framework
- **Unit**: Vitest 2.1.8 — `src/core/rules.test.ts` (22 cases)
- **Integration**: Vitest — `eventStore.integration.test.ts` (15 cases), `zeroTrust.integration.test.ts` (21 cases), `zeroTrust.execution.integration.test.ts`
- **E2E**: Playwright 1.61.0 — 12 specs in `scripts/test/playwright/specs/`

### CRITICAL: 10 of 12 E2E tests skipped
All skipped due to auth fixture limitations (UI-based auth via `storageState` failed). Only `task-02-iphone-navbar.spec.ts` is active (soft assertions only).

### Untested critical paths
| Path | Location | Severity |
|------|----------|----------|
| Game session creation | `sessionCore.ts:520` | HIGH |
| Player join flow | `sessionCore.ts:671` | HIGH |
| Guess submission | `sessionCore.ts:1220` | HIGH |
| Round completion | `sessionCore.ts:1694` | HIGH |
| Round advancement | `sessionCore.ts:1969` | HIGH |
| Auth flow | `identity.ts` | HIGH |
| Multiplayer sync | `partykit/server.ts` | HIGH |

### Well-tested paths
- Scoring logic (22 cases: perfect/null/penalty/era/badges)
- Event store FSM validation (15 cases: invalid transitions, round mismatches)
- Zero-trust DB verification (21 cases: corruption, missing rows, replay drift)

### Test config issues
- No `.env.example` — developers must guess required env vars
- Playwright requires `SUPABASE_SERVICE_ROLE_KEY` (undocumented)
- Integration tests require `SUPABASE_DB_CONNECTION` (undocumented)

---

## 8. Internationalization

### Setup
- `next-intl` v3.26.3 with cookie-based locale switching (`gh_locale` cookie, 1-year expiry)
- Browser detection fallback via `navigator.language`
- Server action `src/actions/setLocale.ts` sets cookie + revalidates path

### CRITICAL: Translation file mismatch
- **English**: 274 keys | **French**: 260 keys | **14 keys missing in French**

Missing French keys: `game.all_rounds`, `game.avg_km_away`, `game.avg_yrs_off`, `game.close_hints`, `game.col_score`, `game.hist_context`, `game.next_arrow`, `game.open_profile_menu`, `game.round_label_compact`, `game.source_link`, `game.this_round`, `game.total_penalty` (and `game.guess_history` is not translated — same as English).

### Hardcoded English strings
**71 hardcoded strings** found in JSX not using `t()` or `useTranslations()`:

High-impact locations:
- `AuthModal.tsx` — error messages ("Email and password are required", "Passwords do not match")
- `RoundActiveSection.tsx` — validation messages ("No location set", "No year set", "Select X first")
- `LobbySection.tsx` — era presets ("Ancient", "Medieval", "Early Modern", "Modern", "Contemporary")
- `profile/page.tsx` — "Unknown" default name

### ICU format
No ICU message format issues detected. Interpolations use `{n}` correctly.

---

## 9. Dependencies

### Production dependencies (17)
| Package | Version | Status |
|---------|---------|--------|
| `next` | ^14.2.35 | Current |
| `react` / `react-dom` | 18.3.1 | Current |
| `@supabase/ssr` | ^0.10.3 | Minor gap (0.11+ available) |
| `@supabase/supabase-js` | ^2.101.1 | Minor gap |
| `pg` | ^8.20.0 | Current |
| `zod` | ^4.4.3 | Current |
| `leaflet` / `react-leaflet` | ^1.9.4 / ^4.2.1 | Current |
| `framer-motion` | ^11.18.2 | Current |
| `next-intl` | ^3.26.3 | Current |
| `partysocket` | ^1.0.2 | Current |

### DevDependencies (22)
| Package | Version | Status |
|---------|---------|--------|
| `partykit` | ^0.0.115 | **CRITICAL — pre-release** |
| `typescript` | ^5.7.3 | Current |
| `vitest` | ^2.1.8 | Current |
| `@playwright/test` | ^1.61.0 | Current |
| `tailwindcss` | ^4.3.0 | Current |
| `eslint` | ^8.57.1 | Current |

### Key issues
- **PartyKit 0.0.115**: Pre-release version. Latest stable is 1.0+. Production risk — upgrade required.
- **lucide-react 1.8.0**: Major version gap (1.263+ available)
- **`@use-gesture/react`**: Imported but no usage found in codebase — potential unused dependency
- **`partysocket`**: No direct import found — likely used via PartyKit internally
- No duplicate dependencies detected
- No `npm audit` run (read-only environment) — recommend running in CI

---

## 10. Build & Deployment

### Next.js config (`next.config.mjs`)
- `reactStrictMode: false` — should be `true` in development
- CSP header configured for `img-src` only (incomplete — see §3)
- `remotePatterns` only has 2 entries (should add Supabase, OSM)
- next-intl plugin integrated correctly

### TypeScript config (`tsconfig.json`)
- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — excellent
- Path alias `@/*` → `src/*` configured
- `scripts/` excluded from type checking
- **1 `any` type found**: `src/app/api/players/follow/route.ts:134`

### ESLint (`.eslintrc.json`)
- Extends `next/core-web-vitals` + `next/typescript` — minimal but sufficient

### PartyKit config (`partykit.json`)
- Worker name: `guess-history-multiplayer`
- Dev port: 1999
- `vars: {}` empty (correct — secrets via env vars)

### Vercel config (`vercel.json`)
- Redirects `guess-history.com` → `www.guess-history.com` (301 permanent)
- No other Vercel config

### Environment variables (CRITICAL gap)
**No `.env.example` file exists.** Required vars scattered across codebase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_CONNECTION` (integration tests)
- `PARTYKIT_SECRET`
- `NEXT_PUBLIC_PARTY_KIT_HOST` (optional)

`docs/DATABASE_CONNECTION.md` references `.env.example` but the file doesn't exist.

### Build scripts
Well-organized: `dev` (concurrent Next.js + PartyKit), `build`, `test`, `test:integration`, `test:e2e`, `typecheck`, `party:dev/build/deploy`.

---

## 11. Consolidated Recommendations

### Phase 1: Critical Security (fix immediately)

| # | Action | File(s) | Effort |
|---|--------|---------|--------|
| 1 | Fix RLS policies — restrict to session participants | `supabase/migrations/012_*.sql` | Medium |
| 2 | Move OAuth redirect URLs to env vars | `src/components/AuthModal.tsx:49,117` | Small |
| 3 | Add auth to snapshot/results GET endpoints | `src/app/api/compete/[gameId]/route.ts`, `.../results/route.ts` | Small |
| 4 | Remove service-role key from join route | `src/app/api/compete/join/route.ts` | Small |
| 5 | Add state parameter validation to OAuth callback | `src/app/auth/callback/route.ts` | Small |
| 6 | Add missing security headers | `next.config.mjs` | Small |
| 7 | Expand CSP header with all directives | `next.config.mjs` | Small |
| 8 | Use constant-time secret comparison | All 14 compete API routes | Small |

### Phase 2: Testing & Reliability (fix this sprint)

| # | Action | Effort |
|---|--------|--------|
| 9 | Fix E2E auth fixture or implement alternative auth strategy | Medium |
| 10 | Add unit tests for sessionCore mutations (submitGuess, advanceRound, etc.) | Large |
| 11 | Create `.env.example` with all required variables | Small |
| 12 | Fix N+1 query in computeAndWriteRoundResults | Small |
| 13 | Add ResizeObserver to GameMap | Small |
| 14 | Upgrade PartyKit from 0.0.115 to 1.0+ | Medium |

### Phase 3: i18n & UX (fix next sprint)

| # | Action | Effort |
|---|--------|--------|
| 15 | Add 14 missing French translations | Small |
| 16 | Wire 71 hardcoded English strings to i18n | Medium |
| 17 | Add accessibility: roles, keyboard nav, focus management | Medium |
| 18 | Migrate 232 hardcoded hex colors to CSS tokens | Medium |

### Phase 4: Architecture & Maintainability (backlog)

| # | Action | Effort |
|---|--------|--------|
| 19 | Split sessionCore.ts (2392 lines) into 4 modules | Large |
| 20 | Split RoundActiveSection (978) and LobbySection (940) | Large |
| 21 | Implement GameContext to reduce prop drilling | Medium |
| 22 | Add useCallback/useMemo/React.memo for render perf | Medium |
| 23 | Extract API route middleware (secret validation factory) | Medium |
| 24 | Fix duplicate migration numbers (025, 027, 028) | Small |
| 25 | Add idempotency (`IF NOT EXISTS`) to non-idempotent migrations | Small |
| 26 | Update docs/DATABASE_SCHEMA_STATE.md | Small |
| 27 | Delete temporary root files (`_temp_*.mjs`, `apply_*.py/js`) | Small |
| 28 | Implement snapshot delta updates or compression | Large |
| 29 | Enable reactStrictMode in next.config.mjs | Small |
| 30 | Replace `any` type in `players/follow/route.ts:134` | Small |

### Quick wins (< 1 hour each)
- Move OAuth redirect URLs to env vars (#2)
- Add auth to snapshot/results endpoints (#3)
- Add security headers to next.config.mjs (#6, #7)
- Add ResizeObserver to GameMap (#13)
- Create `.env.example` (#11)
- Delete temp files (#27)
- Enable reactStrictMode (#29)
- Replace `any` type (#30)
- Fix N+1 query (#12)

---

*This report was generated by six parallel read-only investigation subagents covering architecture, security, database, frontend, testing/i18n/deps/build, and game logic/performance. No files were modified during this audit.*
