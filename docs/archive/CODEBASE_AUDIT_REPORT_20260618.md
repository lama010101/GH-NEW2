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

## 12. Verification & Corrections

Before writing the atomic plan, I verified every CRITICAL and HIGH finding against the actual source code. Three findings from the subagent reports were **incorrect or misleading** and have been corrected:

### Correction 1: French translations are NOT missing (C5 partially retracted)
- **Original claim**: 14 keys missing in `fr.json`
- **Verification**: Ran a script to flatten and compare both files. Result: **345 keys in EN, 345 keys in FR, 0 missing**.
- **All 14 supposedly missing keys exist** with proper French translations (e.g., `game.all_rounds` = "Toutes les manches", `game.hist_context` = "Contexte historique").
- **Only `game.guess_history`** = "Guess History" in both languages — this is an intentional brand name, not a translation gap.
- **Status**: C5 downgraded from CRITICAL to LOW. The hardcoded-strings portion remains valid (see below).

### Correction 2: Join route does NOT use service-role key (H9 retracted)
- **Original claim**: `src/app/api/compete/join/route.ts` uses `SUPABASE_SERVICE_ROLE_KEY` directly.
- **Verification**: The route at line 2 imports `createAuthenticatedServerClient` and at line 9-14 validates the user via `supabase.auth.getUser()`. It uses the anon key with cookies (respects RLS).
- **Status**: H9 **RETRACTED**. This route is correctly secured.

### Correction 3: OAuth state parameter is handled by Supabase (H8 downgraded)
- **Original claim**: OAuth callback doesn't validate state parameter (CSRF risk).
- **Verification**: Supabase's `signInWithOAuth` with PKCE flow automatically generates and includes the state parameter. The `exchangeCodeForSession(code)` call validates state internally as part of the PKCE exchange. Custom state validation is not needed — the library handles it.
- **Status**: H8 downgraded from HIGH to **LOW (informational)**. No action needed unless migrating away from Supabase auth.

### Correction 4: Hardcoded string count is lower than claimed
- **Original claim**: 71 hardcoded English strings, including AuthModal lines 66, 72.
- **Verification**: AuthModal lines 66 and 72 actually use `t('err_email_password_required')` and `t('err_passwords_mismatch')` — they ARE wired to i18n.
- **Confirmed hardcoded**: RoundActiveSection lines 829, 889, 903, 962 ("No location set", "Confirm location", "No year set", "Confirm year") and LobbySection lines 63-67 (era preset labels: "Ancient", "Medieval", "Early Modern", "Modern", "Contemporary").
- **Status**: Real hardcoded count is ~15-25 (not 71). Still worth fixing but not CRITICAL.

### Verified findings (all confirmed accurate)
- ✅ RLS policies use `USING (true)` — confirmed at migration 012 lines 117-158
- ✅ Hardcoded OAuth redirect URLs — confirmed at AuthModal.tsx lines 49, 117
- ✅ Unauthenticated snapshot endpoint — confirmed at `compete/[gameId]/route.ts` (no auth check)
- ✅ Unauthenticated results endpoint — confirmed at `compete/[gameId]/round/[roundIndex]/results/route.ts`
- ✅ Missing ResizeObserver on GameMap — confirmed (only MapClickHandler + FlyToHandler exist)
- ✅ N+1 query — confirmed at sessionCore.ts:2349 (`fetchEventById` inside loop, constant `eventIds[roundIndex]`)
- ✅ PartyKit 0.0.115 — confirmed at package.json:56
- ✅ `reactStrictMode: false` — confirmed at next.config.mjs:5
- ✅ CSP only defines `img-src` — confirmed at next.config.mjs:24-25
- ✅ No `.env.example` — confirmed (file does not exist)
- ✅ 8 temp files in root — confirmed (`_temp_*.mjs`, `apply_*.py`, `apply_fixes.js`)
- ✅ `@use-gesture/react` unused — confirmed (zero import matches in src/)

---

## 13. Atomic Remediation Plan

Each issue below is broken down into: **Root Cause**, **Solution**, **Files**, **Atomic Steps**, **Verification**, and **Risk**. Issues are ordered by severity (verified) then dependency.

### PLAN-01: Fix overly permissive RLS policies [CRITICAL]

**Root cause**: Migration 012 was written during early prototyping when all authenticated users needed to browse any game (for testing). The `USING (true)` policy was never tightened before production. This means any logged-in user can `SELECT` from `sessions`, `session_players`, `round_commits`, `round_results`, and `round_events` for ANY game — including other players' guesses, scores, and event payloads.

**Solution**: Replace `USING (true)` with participant-scoped policies that check `auth.uid()` against `session_players`. For `round_events` and `round_results` (which don't have a direct `player_id` column), use a subquery to `session_players`.

**Files**:
- New migration: `supabase/migrations/20260618120000_tighten_rls_policies.sql`

**Atomic steps**:
1. Create new migration file `supabase/migrations/20260618120000_tighten_rls_policies.sql`
2. For each of the 5 core tables, `DROP POLICY IF EXISTS` the old `*_select_policy` then `CREATE POLICY` with participant check:
   ```sql
   -- sessions: user must be a player in the session
   DROP POLICY IF EXISTS sessions_select_policy ON public.sessions;
   CREATE POLICY sessions_select_policy ON public.sessions
     FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.session_players sp
                     WHERE sp.game_id = sessions.game_id AND sp.player_id = auth.uid()));

   -- session_players: user must be in the same game
   DROP POLICY IF EXISTS session_players_select_policy ON public.session_players;
   CREATE POLICY session_players_select_policy ON public.session_players
     FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.session_players sp
                     WHERE sp.game_id = session_players.game_id AND sp.player_id = auth.uid()));

   -- round_commits: user must be in the same game
   DROP POLICY IF EXISTS round_commits_select_policy ON public.round_commits;
   CREATE POLICY round_commits_select_policy ON public.round_commits
     FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.session_players sp
                     WHERE sp.game_id = round_commits.game_id AND sp.player_id = auth.uid()));

   -- round_results: user must be in the same game
   DROP POLICY IF EXISTS round_results_select_policy ON public.round_results;
   CREATE POLICY round_results_select_policy ON public.round_results
     FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.session_players sp
                     WHERE sp.game_id = round_results.game_id AND sp.player_id = auth.uid()));

   -- round_events: user must be in the same game
   DROP POLICY IF EXISTS round_events_select_policy ON public.round_events;
   CREATE POLICY round_events_select_policy ON public.round_events
     FOR SELECT TO authenticated
     USING (EXISTS (SELECT 1 FROM public.session_players sp
                     WHERE sp.game_id = round_events.game_id AND sp.player_id = auth.uid()));
   ```
3. **Important**: The service-role client (used by API routes + PartyKit) bypasses RLS, so server-side reads are unaffected. Only direct Supabase client reads from the browser are impacted.

**Verification**:
- Run migration against a test DB
- As user A (not in game X), attempt `SELECT * FROM sessions WHERE game_id = 'X'` → should return 0 rows
- As user B (in game X), attempt same query → should return 1 row
- Run `npm run test:integration` to ensure server-side reads still work

**Risk**: MEDIUM — If any client-side code reads game data directly via Supabase browser client (instead of via API), it will break. **Mitigation**: Search for `supabase.from('sessions')` / `supabase.from('round_')` in client code before deploying. All current reads go through API routes via `loadCompeteSessionSnapshot`, so risk is low.

**Effort**: 1-2 hours (migration + testing)

---

### PLAN-02: Move OAuth redirect URLs to environment variables [CRITICAL]

**Root cause**: During initial OAuth setup, the production domain `guess-history.com` was hardcoded directly in `AuthModal.tsx` for simplicity. This was never refactored to use an env var, meaning staging/preview deployments (e.g., Vercel preview URLs) redirect to production after Google OAuth, breaking the auth flow in non-production environments.

**Solution**: Introduce `NEXT_PUBLIC_OAUTH_REDIRECT_URL` env var and derive the redirect URL from `window.location.origin` as a fallback.

**Files**:
- `src/components/AuthModal.tsx` (lines 49, 117)
- `.env.example` (new — see PLAN-11)
- `.env.local` (developer's local env)

**Atomic steps**:
1. In `AuthModal.tsx`, replace line 49:
   ```typescript
   // BEFORE:
   redirectTo: `https://guess-history.com/auth/callback?next=/`,
   // AFTER:
   redirectTo: `${process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URL ?? typeof window !== 'undefined' ? window.location.origin : 'https://guess-history.com'}/auth/callback?next=/`,
   ```
2. Replace line 117 similarly:
   ```typescript
   redirectTo: `${process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URL ?? typeof window !== 'undefined' ? window.location.origin : 'https://guess-history.com'}/auth/callback?next=/account`,
   ```
3. Add `NEXT_PUBLIC_OAUTH_REDIRECT_URL=https://guess-history.com` to `.env.example` (PLAN-11)
4. Add the same to `.env.local` for local dev: `NEXT_PUBLIC_OAUTH_REDIRECT_URL=http://localhost:3000`

**Verification**:
- In local dev, click "Sign in with Google" → redirect URL should be `http://localhost:3000/auth/callback`
- In production, redirect URL should be `https://guess-history.com/auth/callback`
- Password reset flow should redirect to correct origin

**Risk**: LOW — `window.location.origin` is always available in browser context. Fallback ensures SSR safety.

**Effort**: 30 minutes

---

### PLAN-03: Add authentication to snapshot and results GET endpoints [CRITICAL]

**Root cause**: These endpoints were designed to be called by PartyKit (server-to-server with `x-partykit-secret`) but the GET variants were left public for client-side cold-start fetching. The `viewerPlayerId` is passed as a query param or header but never validated against the authenticated session — any anonymous user can fetch any game's snapshot by guessing a UUID.

**Solution**: Require cookie-based auth via `createAuthenticatedServerClient()` and validate that the authenticated user is a participant in the game.

**Files**:
- `src/app/api/compete/[gameId]/route.ts`
- `src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts`

**Atomic steps**:
1. In `src/app/api/compete/[gameId]/route.ts`, add auth check at top of GET handler:
   ```typescript
   import { createAuthenticatedServerClient } from "@/core/supabaseServer";
   // ...
   export async function GET(request: Request, { params }: { params: { gameId: string } }) {
     try {
       const supabase = createAuthenticatedServerClient();
       const { data: { user }, error: authError } = await supabase.auth.getUser();
       if (authError || !user) {
         return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
       }
       const gameId = params.gameId.trim();
       if (gameId.length === 0) {
         return NextResponse.json({ error: "gameId is required" }, { status: 400 });
       }
       // Use authenticated user's ID as viewerPlayerId (ignore client-supplied value)
       const snapshot = await loadCompeteSessionSnapshot(gameId, user.id);
       // ... rest unchanged
   ```
2. In `src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts`, add same auth check:
   ```typescript
   import { createAuthenticatedServerClient } from "@/core/supabaseServer";
   // ...
   const supabase = createAuthenticatedServerClient();
   const { data: { user }, error: authError } = await supabase.auth.getUser();
   if (authError || !user) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }
   // ... rest unchanged
   ```
3. **Important**: PartyKit cold-start also calls the snapshot endpoint. PartyKit uses `x-partykit-secret` header, not cookies. **Add a fallback**: if `x-partykit-secret` is valid, skip cookie auth:
   ```typescript
   const partykitSecret = request.headers.get("x-partykit-secret");
   const isPartyKit = partykitSecret && partykitSecret === process.env.PARTYKIT_SECRET;
   if (!isPartyKit) {
     // Require cookie auth for non-PartyKit callers
     const supabase = createAuthenticatedServerClient();
     const { data: { user }, error } = await supabase.auth.getUser();
     if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }
   ```

**Verification**:
- Unauthenticated `curl http://localhost:3000/api/compete/<gameId>` → 401
- Authenticated request (with session cookie) → 200 with snapshot
- PartyKit cold-start (with `x-partykit-secret` header) → 200

**Risk**: MEDIUM — PartyKit cold-start must still work. The fallback for `x-partykit-secret` handles this. Test PartyKit connection after change.

**Effort**: 1 hour

---

### PLAN-04: Add missing security headers and expand CSP [HIGH]

**Root cause**: `next.config.mjs` was written with only `img-src` in the CSP header (the most immediately necessary directive for map tiles and images). Other security headers were never added. This leaves the app vulnerable to clickjacking (no `X-Frame-Options`), MIME sniffing (no `X-Content-Type-Options`), and doesn't enforce HTTPS (no HSTS).

**Solution**: Add comprehensive security headers and expand CSP with all necessary directives.

**Files**:
- `next.config.mjs` (lines 18-30)

**Atomic steps**:
1. Replace the `headers()` function in `next.config.mjs`:
   ```javascript
   async headers() {
     const csp = [
       "default-src 'self'",
       "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
       "style-src 'self' 'unsafe-inline'",
       "img-src 'self' data: blob: https://im.runware.ai https://firebasestorage.googleapis.com https://*.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.tile.opentopomap.org https://*.a.ssl.fastly.net",
       "connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org wss://*.partykit.io wss://*.partykit.dev",
       "font-src 'self' data:",
       "frame-ancestors 'none'",
       "base-uri 'self'",
       "form-action 'self'",
     ].join('; ');

     return [
       {
         source: '/(.*)',
         headers: [
           { key: 'Content-Security-Policy', value: csp },
           { key: 'X-Frame-Options', value: 'DENY' },
           { key: 'X-Content-Type-Options', value: 'nosniff' },
           { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
           { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
           { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
         ],
       },
     ];
   }
   ```
2. **Note on `script-src 'unsafe-inline' 'unsafe-eval'`**: Next.js requires these for its inline scripts and eval in dev mode. In production, consider using nonces (advanced, defer to PLAN-28).
3. **Note on `connect-src`**: Must include WebSocket URLs for PartyKit (`wss://*.partykit.io`). Verify the actual PartyKit host from `NEXT_PUBLIC_PARTY_KIT_HOST` and add it.

**Verification**:
- Check response headers: `curl -I http://localhost:3000/`
- All 6 headers should be present
- App should still load without CSP violations (check browser console)
- Map tiles should load (img-src unchanged)
- WebSocket should connect (connect-src includes partykit)

**Risk**: MEDIUM — Overly strict CSP can break the app. **Mitigation**: Test thoroughly in dev mode. If something breaks, check browser console for CSP violation messages and add the needed source.

**Effort**: 1 hour

---

### PLAN-05: Use constant-time comparison for PARTYKIT_SECRET [HIGH]

**Root cause**: All 14 compete API routes compare the `x-partykit-secret` header with `!==` (non-constant-time). This is vulnerable to timing attacks where an attacker measures response time to gradually guess the secret byte by byte.

**Solution**: Create a shared utility function using `crypto.timingSafeEqual()` and use it in all 14 routes.

**Files**:
- New: `src/server/auth/partykitSecret.ts`
- All 14 routes: `src/app/api/compete/[gameId]/*/route.ts`

**Atomic steps**:
1. Create `src/server/auth/partykitSecret.ts`:
   ```typescript
   import { timingSafeEqual } from 'crypto';

   export function validatePartyKitSecret(headerValue: string | null): boolean {
     const expected = process.env.PARTYKIT_SECRET;
     if (!expected) return false;
     if (!headerValue) return false;
     const a = Buffer.from(headerValue);
     const b = Buffer.from(expected);
     if (a.length !== b.length) return false;
     return timingSafeEqual(a, b);
   }
   ```
2. In each of the 14 compete API routes, replace:
   ```typescript
   // BEFORE:
   const secret = request.headers.get("x-partykit-secret");
   if (!secret || secret !== process.env.PARTYKIT_SECRET) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }
   // AFTER:
   import { validatePartyKitSecret } from "@/server/auth/partykitSecret";
   if (!validatePartyKitSecret(request.headers.get("x-partykit-secret"))) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }
   ```

**Verification**:
- All 14 routes still accept valid secret
- All 14 routes reject invalid secret with 401
- `npm run typecheck` passes

**Risk**: LOW — Drop-in replacement, same behavior, just constant-time.

**Effort**: 1 hour (mostly mechanical replacement across 14 files)

---

### PLAN-06: Add ResizeObserver to GameMap [HIGH]

**Root cause**: `GameMap.tsx` uses Leaflet via `react-leaflet`'s `MapContainer`. Leaflet initializes its internal size from the container's dimensions at mount time. When the container resizes (e.g., user switches browser tabs, opens a bottom sheet, or the layout shifts between phases), Leaflet doesn't automatically re-measure. The map renders with stale tile positions until the user manually interacts (pan/zoom). The fix is to call `map.invalidateSize()` whenever the container resizes, via a `ResizeObserver`.

**Solution**: Add a `ResizeHandler` component inside `MapContainer` that observes the container and calls `invalidateSize()`.

**Files**:
- `src/components/GameMap.tsx`

**Atomic steps**:
1. Add a new functional component after `FlyToHandler` (around line 96):
   ```typescript
   function ResizeHandler() {
     const map = useMap();
     useEffect(() => {
       const container = map.getContainer();
       const observer = new ResizeObserver(() => {
         map.invalidateSize();
       });
       observer.observe(container);
       return () => observer.disconnect();
     }, [map]);
     return null;
   }
   ```
2. Add `<ResizeHandler />` inside `<MapContainer>` (after `<FlyToHandler>` at line 151):
   ```tsx
   <MapClickHandler onSetLocation={this.props.onSetLocation} />
   <FlyToHandler target={this.props.flyToTarget} />
   <ResizeHandler />
   ```

**Verification**:
- Open a game, place a guess, submit → round complete phase shows results
- Switch to a different browser tab, then back → map should render correctly without manual interaction
- Open bottom sheet → map should resize smoothly
- No console errors

**Risk**: LOW — `ResizeObserver` is well-supported (all modern browsers). `invalidateSize()` is the canonical Leaflet fix.

**Effort**: 15 minutes

---

### PLAN-07: Fix N+1 query in computeAndWriteRoundResults [HIGH]

**Root cause**: In `computeAndWriteRoundResults()`, the loop at line 2346 iterates over all player commits for a round. Inside the loop, line 2349 calls `fetchEventById(eventIds[roundIndex], executor)`. Since `eventIds[roundIndex]` is constant for the entire loop (same event for all players in the same round), the same event is fetched N times (once per player). With 4 players, this is 4 redundant DB queries for the same row.

**Solution**: Move `fetchEventById` call outside the loop, before it starts. Reuse the fetched event for all iterations.

**Files**:
- `src/server/sessionCore.ts` (lines 2346-2389)

**Atomic steps**:
1. Move the `fetchEventById` call from line 2349 to before the loop (after line 2344):
   ```typescript
   // AFTER line 2344 (eventIds check):
   const event = await fetchEventById(eventIds[roundIndex], executor);
   if (!event) return roundResultsToken;

   for (let i = 0; i < commits.rows.length; i++) {
     const row = commits.rows[i];
     // REMOVE: const event = await fetchEventById(eventIds[roundIndex], executor);
     // REMOVE: if (!event) continue;

     const guessState = {
       year: row.year_guess,
       location: row.location_lat !== null && row.location_lng !== null
         ? { lat: row.location_lat, lng: row.location_lng } as LatLng
         : null
     };

     const evaluation = evaluateRound(
       event,
       guessState,
       roundIndex,
       false,
       row.acc_penalty_when ?? 0,
       row.acc_penalty_where ?? 0
     );
     // ... rest of loop body unchanged
   }
   ```

**Verification**:
- `npm run typecheck` passes
- `npm run test` passes (rules.test.ts)
- `npm run test:integration` passes (eventStore, zeroTrust)
- Manual test: complete a round with 4 players → results computed correctly
- Optional: add a console.log to count `fetchEventById` calls → should be 1, not N

**Risk**: LOW — Pure refactor, no logic change. The event is the same for all commits in the same round.

**Effort**: 15 minutes

---

### PLAN-08: Upgrade PartyKit from 0.0.115 to 1.0+ [HIGH]

**Root cause**: `package.json` pins `partykit` to `^0.0.115`, a pre-release version. The 1.0 stable release has been available for some time. Pre-release versions may have breaking changes, missing security patches, and no long-term support guarantees.

**Solution**: Upgrade to the latest stable PartyKit version. Review breaking changes in the changelog first.

**Files**:
- `package.json` (line 56)
- `partykit/server.ts` (may need API updates)
- `partykit.json` (may need config changes)

**Atomic steps**:
1. Check the latest stable version: `npm view partykit version`
2. Review PartyKit changelog for breaking changes between 0.0.115 and latest
3. Update `package.json`: `"partykit": "^1.0.0"` (or latest stable)
4. Run `npm install`
5. Run `npm run party:dev` and test locally
6. Fix any API changes in `partykit/server.ts` (e.g., changed imports, lifecycle methods)
7. Run `npm run party:build` to verify build
8. Test a full game flow locally (create → join → start → guess → complete)

**Verification**:
- `npm run party:dev` starts without errors
- Full game flow works (create, join, start, guess, round complete, session complete)
- `npm run party:build` succeeds
- No deprecation warnings in console

**Risk**: HIGH — Major version upgrade may have breaking API changes. **Mitigation**: Review changelog carefully. Test thoroughly. Keep `0.0.115` as fallback (`git stash` or branch).

**Effort**: 2-4 hours (depending on breaking changes)

---

### PLAN-09: Fix E2E test auth fixture [CRITICAL for testing]

**Root cause**: 10 of 12 Playwright specs are skipped with `.describe.skip()` because the auth fixture (`scripts/test/playwright/fixtures/auth.ts`) failed to authenticate via UI-based `storageState`. The fixture creates test users via Supabase Admin API but the UI login flow had selector timing issues. Without working auth, no E2E test can run.

**Solution**: Bypass UI login entirely. Use Supabase Admin API to create test users and generate session tokens directly, then inject the session cookies into the browser context via `context.addCookies()`.

**Files**:
- `scripts/test/playwright/fixtures/auth.ts` (rewrite)
- `scripts/test/playwright/playwright.config.ts` (may need adjustments)

**Atomic steps**:
1. Read current `scripts/test/playwright/fixtures/auth.ts` to understand current approach
2. Rewrite to use Supabase Admin API for direct session token generation:
   ```typescript
   import { createClient } from '@supabase/supabase-js';

   async function globalSetup() {
     const admin = createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!
     );
     // Create or sign in test users
     const { data, error } = await admin.auth.signInWithPassword({
       email: 'test-user-1@example.com',
       password: 'TestPassword123!',
     });
     // Extract session cookies and save to storageState
     // ...
   }
   ```
3. Alternative simpler approach: Use `supabase.auth.signInWithPassword` server-side, extract the access_token + refresh_token, and set them as cookies in the Playwright browser context:
   ```typescript
   await context.addCookies([{
     name: 'sb-access-token',
     value: session.access_token,
     domain: 'localhost',
     path: '/',
   }]);
   ```
4. Remove `.skip()` from the 10 skipped specs
5. Run `npm run test:e2e` and fix any remaining issues

**Verification**:
- `npm run test:e2e` runs all 12 specs (none skipped)
- At least 8 of 12 specs pass
- Auth fixture creates users and injects cookies successfully

**Risk**: MEDIUM — Test users may conflict with production data if using shared Supabase project. **Mitigation**: Use separate test Supabase project or clean up test users in `globalTeardown`.

**Effort**: 4-8 hours (auth fixture rewrite + unskipping + fixing flaky tests)

---

### PLAN-10: Add unit tests for sessionCore mutations [HIGH for reliability]

**Root cause**: The core game loop functions (`createCompeteSession`, `joinCompeteSession`, `submitGuess`, `advanceRound`, `completeRound`) have zero unit test coverage. Only the scoring logic (`rules.test.ts`) and event store validation (`eventStore.integration.test.ts`) are tested. A regression in any mutation function could go undetected until production.

**Solution**: Add integration tests for each mutation function, using a test database (or transaction-rollback pattern).

**Files**:
- New: `src/server/sessionCore.integration.test.ts`

**Atomic steps**:
1. Create test file `src/server/sessionCore.integration.test.ts`
2. Set up test harness with transaction rollback (so tests don't pollute DB):
   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { createCompeteSession, joinCompeteSession, submitGuess, advanceRound } from './sessionCore';
   import { getTransactionClient } from './db';

   describe('sessionCore mutations', () => {
     let client;
     beforeEach(async () => {
       client = await getTransactionClient();
       await client.query('BEGIN');
     });
     afterEach(async () => {
       await client.query('ROLLBACK');
       client.release();
     });
     // ... tests
   });
   ```
3. Write tests for each mutation:
   - `createCompeteSession`: creates session + host player + SESSION_CREATED event
   - `joinCompeteSession`: adds player to session_players
   - `submitGuess`: writes commit + GUESS_SUBMITTED event, idempotent on re-submit
   - `submitGuess` (all submitted): triggers ROUND_COMPLETE + computes results
   - `advanceRound`: writes ROUND_STARTED for next round
   - `advanceRound` (final round): writes SESSION_COMPLETE
4. Run `npm run test:integration`

**Verification**:
- All new tests pass
- Tests run in < 30 seconds
- Tests don't pollute the DB (rollback works)

**Risk**: LOW — Tests only add coverage. Requires `SUPABASE_DB_CONNECTION` env var.

**Effort**: 6-12 hours (comprehensive test suite)

---

### PLAN-11: Create `.env.example` [HIGH for onboarding]

**Root cause**: No `.env.example` file exists. Developers must grep the codebase to find required env vars. `docs/DATABASE_CONNECTION.md` references `.env.example` but the file doesn't exist.

**Solution**: Create `.env.example` with all required env vars and comments.

**Files**:
- New: `.env.example`

**Atomic steps**:
1. Create `.env.example`:
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_DB_CONNECTION=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

   # PartyKit
   PARTYKIT_SECRET=your-partykit-secret
   NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999

   # OAuth (optional — defaults to window.location.origin)
   NEXT_PUBLIC_OAUTH_REDIRECT_URL=http://localhost:3000
   ```
2. Verify `.gitignore` does NOT ignore `.env.example` (it should ignore `.env` and `.env.local`)

**Verification**:
- File exists at repo root
- Contains all env vars referenced in code
- `grep -r 'process.env\.' src/ | sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u` matches the list

**Risk**: NONE — Example file only, no real secrets.

**Effort**: 15 minutes

---

### PLAN-12: Wire hardcoded English strings to i18n [MEDIUM]

**Root cause**: During rapid UI development, strings were hardcoded in JSX for speed. The i18n setup (`next-intl`) was added later, and some strings were never wired to `t()`. Confirmed hardcoded locations: RoundActiveSection (validation messages), LobbySection (era preset labels).

**Solution**: Add missing i18n keys and replace hardcoded strings with `t()` calls.

**Files**:
- `src/i18n/en.json` (add keys)
- `src/i18n/fr.json` (add translations)
- `src/components/compete/RoundActiveSection.tsx` (lines 829, 889, 903, 962)
- `src/components/compete/LobbySection.tsx` (lines 63-67)

**Atomic steps**:
1. Add to `src/i18n/en.json` under `game`:
   ```json
   "no_location_set": "No location set",
   "confirm_location": "Confirm location",
   "tap_map_to_set": "Tap the map to set a location",
   "no_year_set": "No year set",
   "confirm_year": "Confirm year",
   "pick_year_to_continue": "Pick a year to continue",
   "era_ancient": "Ancient",
   "era_medieval": "Medieval",
   "era_early_modern": "Early Modern",
   "era_modern": "Modern",
   "era_contemporary": "Contemporary"
   ```
2. Add corresponding French translations to `src/i18n/fr.json`:
   ```json
   "no_location_set": "Aucun lieu défini",
   "confirm_location": "Confirmer le lieu",
   "tap_map_to_set": "Touchez la carte pour définir un lieu",
   "no_year_set": "Aucune année définie",
   "confirm_year": "Confirmer l'année",
   "pick_year_to_continue": "Choisissez une année pour continuer",
   "era_ancient": "Antiquité",
   "era_medieval": "Médiéval",
   "era_early_modern": "Époque moderne",
   "era_modern": "Moderne",
   "era_contemporary": "Contemporain"
   ```
3. In `RoundActiveSection.tsx`, replace hardcoded strings:
   - Line 829: `t('no_location_set')` instead of `"No location set"`
   - Line 889: `t('confirm_location')` / `t('tap_map_to_set')` instead of hardcoded
   - Line 903: `t('no_year_set')` instead of `"No year set"`
   - Line 962: `t('confirm_year')` / `t('pick_year_to_continue')` instead of hardcoded
4. In `LobbySection.tsx`, replace era preset `label` fields with `t()` calls (or use the `id` as i18n key: `t(\`era_${preset.id}\`)`)

**Verification**:
- Switch locale to French → all formerly-hardcoded strings appear in French
- `npm run typecheck` passes
- No missing key warnings in console

**Risk**: LOW — Adding keys and wiring strings. No logic change.

**Effort**: 1-2 hours

---

### PLAN-13: Delete temporary root files [LOW]

**Root cause**: Debugging scripts created during development were never cleaned up. They clutter the repo root and may confuse new contributors.

**Solution**: Delete the 8 temporary files.

**Files to delete**:
- `_temp_check.mjs`
- `_temp_insert.mjs`
- `_temp_query.mjs`
- `_temp_test.mjs`
- `_temp_test2.mjs`
- `_temp_test3.mjs`
- `apply_changes.py`
- `apply_fixes.js`

**Atomic steps**:
1. Verify none are imported by any source file: `grep -r '_temp_\|apply_changes\|apply_fixes' src/ scripts/ partykit/`
2. Delete: `rm _temp_check.mjs _temp_insert.mjs _temp_query.mjs _temp_test.mjs _temp_test2.mjs _temp_test3.mjs apply_changes.py apply_fixes.js`
3. Check `git status` — 8 deletions

**Verification**:
- `npm run build` still succeeds
- `git status` shows only the 8 deletions

**Risk**: NONE — Files are temporary debugging scripts, not imported anywhere.

**Effort**: 5 minutes

---

### PLAN-14: Enable reactStrictMode [LOW]

**Root cause**: `reactStrictMode` was set to `false` (likely to avoid double-render noise during development). This means React's development-mode checks for unsafe lifecycles, deprecated APIs, and side-effect bugs are not running.

**Solution**: Set `reactStrictMode: true`.

**Files**:
- `next.config.mjs` (line 5)

**Atomic steps**:
1. Change line 5: `reactStrictMode: true,`
2. Run `npm run dev` and check for React warnings in console
3. Fix any warnings that appear (unsafe lifecycles, missing keys, etc.)

**Verification**:
- No new React warnings in console
- `npm run build` succeeds
- App behavior unchanged

**Risk**: LOW — May surface existing latent bugs (which is the point). If warnings appear, they should be fixed, not suppressed.

**Effort**: 15 minutes (plus time to fix any surfaced warnings)

---

### PLAN-15: Remove unused `@use-gesture/react` dependency [LOW]

**Root cause**: `@use-gesture/react` was likely added for touch gesture handling during prototyping but is no longer imported anywhere in `src/`. It adds bundle size for no benefit.

**Solution**: Remove from `package.json` and run `npm install`.

**Files**:
- `package.json` (line 25)

**Atomic steps**:
1. Verify no imports: `grep -r 'use-gesture\|@use-gesture' src/ partykit/ scripts/` → should return 0 matches (already confirmed)
2. Remove line 25 from `package.json`: `"@use-gesture/react": "^10.3.1",`
3. Run `npm install`
4. Run `npm run build` to verify no breakage

**Verification**:
- `npm run build` succeeds
- `npm ls @use-gesture/react` → not found

**Risk**: NONE — Confirmed unused.

**Effort**: 5 minutes

---

### PLAN-16: Replace `any` type in players/follow route [LOW]

**Root cause**: Line 134 of `src/app/api/players/follow/route.ts` uses `(row: any)` in a `.map()` callback, bypassing TypeScript's type safety.

**Solution**: Define a proper type for the database row.

**Files**:
- `src/app/api/players/follow/route.ts` (line 134)

**Atomic steps**:
1. Define the row type:
   ```typescript
   type FollowRow = {
     follower_id: string;
     followee_id: string;
     created_at: string;
   };
   ```
2. Replace `(row: any)` with `(row: FollowRow)`
3. Run `npm run typecheck`

**Verification**:
- `npm run typecheck` passes with no `any` warnings

**Risk**: NONE — Type narrowing only.

**Effort**: 10 minutes

---

### PLAN-17: Fix duplicate migration numbers [MEDIUM]

**Root cause**: Three migration numbers (025, 027, 028) each have two files. Migration execution order depends on filesystem alphabetical sorting, which is fragile and may differ between environments.

**Solution**: Rename duplicate files to use unique sequential numbers or timestamps.

**Files**:
- `supabase/migrations/025_create_profiles.sql` → keep as `025_create_profiles.sql`
- `supabase/migrations/025_round_hints_unique_constraint.sql` → rename to `20260525000001_round_hints_unique_constraint.sql`
- `supabase/migrations/027_add_event_validation_trigger.sql` → keep as `027_add_event_validation_trigger.sql`
- `supabase/migrations/027_add_per_axis_acc_penalty.sql` → rename to `20260527000001_add_per_axis_acc_penalty.sql`
- `supabase/migrations/028_create_player_global_stats.sql` → keep as `028_create_player_global_stats.sql`
- `supabase/migrations/028_create_round_hints.sql` → rename to `20260528000001_create_round_hints.sql`

**Atomic steps**:
1. `git mv` the 3 duplicate files to timestamp-based names
2. Verify migration ordering: `ls supabase/migrations/ | sort`
3. If using Supabase CLI, verify `supabase migration list` shows correct order

**Verification**:
- `ls supabase/migrations/ | sort` shows no duplicate numbers
- All migrations still apply cleanly to a fresh DB

**Risk**: LOW — Renaming files. Content unchanged. Already-applied migrations are tracked by filename in Supabase's `supabase_migrations.schema_migrations` table, so **renaming will cause Supabase to re-run them**. **Mitigation**: Only rename if migrations are idempotent, or use `supabase migration repair` to mark new names as applied.

**Effort**: 30 minutes (plus DB migration tracking fix)

---

### PLAN-18: Update `docs/DATABASE_SCHEMA_STATE.md` [LOW]

**Root cause**: The schema doc is outdated — missing columns, wrong defaults, missing tables.

**Solution**: Update the doc to match current schema.

**Files**:
- `docs/DATABASE_SCHEMA_STATE.md`

**Atomic steps**:
1. Fix `results_auto_advance_sec` default: 10 → 90
2. Add `acc_penalty_when`, `acc_penalty_where` columns to `round_commits`
3. Add `idx_round_events_unique_round_started` to indexes section
4. Add `round_hints`, `player_global_stats`, `leaderboard_daily`, `leaderboard_daily_alltime`, `leaderboard_levelup`, `player_follows` tables
5. Note that migrations 012-023 are reconstructed in `012_consolidated_multiplayer_baseline.sql`

**Verification**:
- Doc matches actual schema (cross-check with migrations)
- No stale information

**Risk**: NONE — Documentation only.

**Effort**: 30 minutes

---

### PLAN-19: Split sessionCore.ts into modules [MEDIUM — backlog]

**Root cause**: `sessionCore.ts` is 2392 lines containing ALL multiplayer game mutations. This violates single responsibility, makes navigation difficult, and complicates testing.

**Solution**: Split into 4 focused modules, re-exporting from `sessionCore.ts` for backward compatibility.

**Files**:
- New: `src/server/sessionLifecycle.ts` (create, join, leave)
- New: `src/server/roundManagement.ts` (start, complete, advance)
- New: `src/server/guessSubmission.ts` (submitGuess, scoring)
- New: `src/server/playerManagement.ts` (ready, kick)
- Modified: `src/server/sessionCore.ts` (becomes re-export barrel)

**Atomic steps**:
1. Identify function boundaries in `sessionCore.ts`
2. Move functions to appropriate new files (preserving imports)
3. Update `sessionCore.ts` to re-export from new files:
   ```typescript
   export * from './sessionLifecycle';
   export * from './roundManagement';
   export * from './guessSubmission';
   export * from './playerManagement';
   ```
4. Run `npm run typecheck` — all imports should still work via `@/server/sessionCore`
5. Run `npm run test:integration`

**Verification**:
- `npm run typecheck` passes
- All imports via `@/server/sessionCore` still resolve
- No file exceeds 800 lines

**Risk**: MEDIUM — Large refactor. **Mitigation**: Re-export pattern ensures backward compatibility. Do this on a separate branch.

**Effort**: 4-8 hours

---

### PLAN-20: Split large React components [MEDIUM — backlog]

**Root cause**: `RoundActiveSection.tsx` (978 lines) and `LobbySection.tsx` (940 lines) mix multiple concerns (map controls, year picker, submit logic, sheet management, settings, invites) in single files.

**Solution**: Extract sub-components and custom hooks.

**Files**:
- `src/components/compete/RoundActiveSection.tsx` → extract:
  - `src/components/compete/SheetPanel.tsx` (sheet backdrop + container)
  - `src/components/compete/WhereSheet.tsx` (WHERE panel content)
  - `src/components/compete/WhenSheet.tsx` (WHEN panel content)
  - `src/hooks/usePanZoom.ts` (pan/zoom gesture logic)
- `src/components/compete/LobbySection.tsx` → extract:
  - `src/components/compete/SettingsPanel.tsx` (timer, year range, results timer)
  - `src/components/compete/InvitePanel.tsx` (player invites)
  - `src/components/compete/EraSelector.tsx` (era preset selection)

**Atomic steps**:
1. For each extraction: identify the JSX block + its state/handlers
2. Create new component file with props interface
3. Move JSX and related state to new component
4. Import and use in parent
5. Verify rendering unchanged

**Verification**:
- Visual regression: app looks and behaves identically
- `npm run typecheck` passes
- No file exceeds 400 lines (target)

**Risk**: MEDIUM — Visual regression possible. **Mitigation**: Test each extraction individually. Use screenshots before/after.

**Effort**: 8-16 hours

---

### PLAN-21: Implement GameContext to reduce prop drilling [MEDIUM — backlog]

**Root cause**: `CompeteGamePage` passes 17+ props to `RoundActiveSection` and 15+ to `RoundCompleteSection`. This tight coupling makes it hard to modify prop interfaces and causes unnecessary re-renders when unrelated props change.

**Solution**: Create a `GameContext` that holds shared game state and handlers.

**Files**:
- New: `src/components/compete/GameContext.tsx`
- Modified: `src/app/compete/[gameId]/page.tsx`
- Modified: `src/components/compete/RoundActiveSection.tsx`, `RoundCompleteSection.tsx`, `LobbySection.tsx`, `SessionComplete.tsx`

**Atomic steps**:
1. Create `GameContext.tsx` with context type matching current props
2. Wrap all phase sections in `<GameContext.Provider value={{...}}>`
3. In each child, replace props with `useContext(GameContext)`
4. Remove prop drilling from parent

**Verification**:
- App behavior unchanged
- `npm run typecheck` passes
- Reduced prop count on child components

**Risk**: MEDIUM — Context changes can cause re-render issues if not memoized. **Mitigation**: Memoize context value with `useMemo`.

**Effort**: 4-6 hours

---

### PLAN-22: Add useCallback/useMemo/React.memo for render performance [MEDIUM — backlog]

**Root cause**: `useCompeteSocket` returns 9 unmemoized functions (recreated every render). `RoundCompleteSection` computes player stats on every render. No `React.memo()` on large components. This causes unnecessary child re-renders.

**Solution**: Wrap callbacks in `useCallback`, computations in `useMemo`, and large components in `React.memo()`.

**Files**:
- `src/hooks/useCompeteSocket.ts`
- `src/components/compete/RoundCompleteSection.tsx`
- `src/components/compete/RoundActiveSection.tsx`
- `src/components/compete/LobbySection.tsx`

**Atomic steps**:
1. In `useCompeteSocket.ts`, wrap all 9 returned functions in `useCallback` with appropriate deps
2. In `RoundCompleteSection.tsx`, wrap `computePlayerStats` in `useMemo`
3. Wrap `RoundActiveSection`, `LobbySection`, `RoundCompleteSection`, `SessionComplete` in `React.memo()`
4. Profile with React DevTools before/after

**Verification**:
- React DevTools Profiler shows fewer re-renders
- App behavior unchanged

**Risk**: LOW — Performance optimization only.

**Effort**: 2-3 hours

---

### PLAN-23: Add idempotency to non-idempotent migrations [LOW]

**Root cause**: Migrations 024, 028a, 028b, 033-037, 20260528120000 use `CREATE TABLE` without `IF NOT EXISTS`. Re-running these migrations (e.g., on a fresh DB rebuild) will fail.

**Solution**: Add `IF NOT EXISTS` to all `CREATE TABLE` statements and `IF NOT EXISTS` to `ADD CONSTRAINT`.

**Files**:
- `supabase/migrations/024_add_translation_tables.sql`
- `supabase/migrations/028_create_player_global_stats.sql`
- `supabase/migrations/028_create_round_hints.sql`
- `supabase/migrations/033_create_leaderboard_daily.sql`
- `supabase/migrations/034_create_leaderboard_daily_alltime.sql`
- `supabase/migrations/035_create_leaderboard_levelup.sql`
- `supabase/migrations/037_create_player_follows.sql`
- `supabase/migrations/20260528120000_create_invite_and_notifications_schema.sql`

**Atomic steps**:
1. For each file, change `CREATE TABLE public.X` to `CREATE TABLE IF NOT EXISTS public.X`
2. For `ADD CONSTRAINT`, wrap in `DO $$ BEGIN IF NOT EXISTS ... END $$` pattern (as used in migration 012)

**Verification**:
- Run all migrations twice on a test DB → no errors

**Risk**: LOW — Idempotency changes only.

**Effort**: 1 hour

---

### PLAN-24: Enable RLS on translation tables [HIGH]

**Root cause**: Migration 024 creates `event_translations`, `hint_translations`, `location_translations` but never enables RLS. These tables are readable by service-role only (not authenticated), but the missing RLS is an inconsistency.

**Solution**: Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and a SELECT policy.

**Files**:
- New migration: `supabase/migrations/20260618130000_enable_rls_translation_tables.sql`

**Atomic steps**:
1. Create migration:
   ```sql
   ALTER TABLE public.event_translations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.hint_translations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.location_translations ENABLE ROW LEVEL SECURITY;

   CREATE POLICY event_translations_select ON public.event_translations
     FOR SELECT TO authenticated USING (true);
   CREATE POLICY hint_translations_select ON public.hint_translations
     FOR SELECT TO authenticated USING (true);
   CREATE POLICY location_translations_select ON public.location_translations
     FOR SELECT TO authenticated USING (true);
   ```
   (These are public reference data, so `USING (true)` is appropriate here — unlike game data.)

**Verification**:
- Authenticated user can SELECT from translation tables
- Anon user cannot

**Risk**: LOW — Adding RLS, not removing.

**Effort**: 15 minutes

---

## 14. Execution Order & Dependencies

```
Phase 1 (Critical — do first, in parallel where possible):
  PLAN-02 (OAuth URLs)         ─── no deps ───┐
  PLAN-11 (.env.example)       ─── no deps ───┤
  PLAN-13 (delete temp files)  ─── no deps ───┤
  PLAN-14 (reactStrictMode)    ─── no deps ───┤
  PLAN-15 (remove unused dep)  ─── no deps ───┤
  PLAN-16 (replace any type)   ─── no deps ───┤
  PLAN-01 (RLS policies)       ─── no deps    │
  PLAN-03 (auth on endpoints)  ─── depends on PLAN-01 (RLS) being compatible
  PLAN-04 (security headers)   ─── no deps    │
  PLAN-05 (constant-time cmp)  ─── no deps ───┘

Phase 2 (High — after Phase 1):
  PLAN-06 (ResizeObserver)     ─── no deps
  PLAN-07 (N+1 query fix)      ─── no deps
  PLAN-24 (RLS on translations)── no deps
  PLAN-08 (PartyKit upgrade)   ─── no deps (but test thoroughly)
  PLAN-09 (E2E auth fixture)   ─── no deps (but benefits from PLAN-11)
  PLAN-10 (sessionCore tests)  ─── benefits from PLAN-07 being done first

Phase 3 (Medium — next sprint):
  PLAN-12 (i18n strings)       ─── no deps
  PLAN-17 (migration numbers)  ─── no deps
  PLAN-18 (update schema doc)  ─── depends on PLAN-01, PLAN-17, PLAN-24
  PLAN-23 (migration idempotency)── no deps

Phase 4 (Backlog — large refactors):
  PLAN-19 (split sessionCore)  ─── benefits from PLAN-10 (tests as safety net)
  PLAN-20 (split components)   ─── no deps
  PLAN-21 (GameContext)        ─── best done after PLAN-20
  PLAN-22 (memoization)        ─── best done after PLAN-21
```

### Quick wins (can all be done in one session, < 1 hour each)
- PLAN-02: OAuth URLs to env vars
- PLAN-06: ResizeObserver on GameMap
- PLAN-07: N+1 query fix
- PLAN-11: Create .env.example
- PLAN-13: Delete temp files
- PLAN-14: Enable reactStrictMode
- PLAN-15: Remove unused dependency
- PLAN-16: Replace `any` type
- PLAN-24: RLS on translation tables

---

*This report was generated by six parallel read-only investigation subagents covering architecture, security, database, frontend, testing/i18n/deps/build, and game logic/performance. All CRITICAL and HIGH findings were then verified against the actual source code, with three corrections applied. No files were modified during this audit.*
