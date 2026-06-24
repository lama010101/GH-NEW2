# CTO BACKLOG & BUG TRACKER
**Project:** Guess-History (GH-NEW)
**Maintained by:** Claude (CTO) — updated via coder prompts, never edited directly by coders without instruction
**Status:** ACTIVE — single source of truth for bug/task status, supersedes long-form status text in Claude's memory

---

## HOW THIS FILE WORKS

- Every coder prompt that resolves, advances, or discovers a bug/task MUST include a validation step instructing the coder to update the relevant entry below (status + one-line evidence + commit hash).
- Status values: `OPEN` (not investigated) · `INVESTIGATING` (A0/B in progress) · `APPROVED-FOR-FIX` (Phase C passed) · `FIX-APPLIED` (committed, not re-verified) · `CLOSED` (Phase E re-verified) · `PARKED` (deprioritized, not abandoned).
- Do not delete closed items — move them to the "CLOSED LOG" section at the bottom. History matters for this project (see process gap MP-INV-HARNESS-BLOCKER-STATUS-001).
- Claude (CTO) is the only one who changes an item's status in conversation; the coder only proposes evidence in the file via prompted instruction.

---

## SECTION A — MULTIPLAYER TEST HARNESS (MP-AUTO-TEST-001)

### Harness Bug Tracker

| # | Bug | Status | Commit | Notes |
|---|-----|--------|--------|-------|
| 1 | host()-call bug | CLOSED | 77efc97 | Confirmed fixed |
| 2 | gameId-param bug | CLOSED | 60f7119 | Confirmed fixed |
| 3 | kick-rejoin bug | CLOSED | 5433acd | Confirmed fixed |
| 4 | sleep-prevention bug | CLOSED | 5433acd | Confirmed fixed |
| 5 | playerId-empty (globalSetup/test-process split) | CLOSED | a71b9c2 | File-based handoff via `.test-user-ids.json` |
| 6 | hostClient early-capture in `runGame()` | CLOSED | (same as #5) | Fixed by playerId-empty PR |
| 7 | hostClient early-capture in `playAgain()` | **INVESTIGATING (A0 in progress)** | 97d2837 (fix applied, NOT verified) | CTO REJECTED coder's self-contradictory "1 passed" / "Overall FAILED" report. Phase A0 required: investigate browser-closure errors (`Target page, context or browser has been closed`) during playAgain()'s game transition (2nd/3rd game in suite) — specifically shared `chromiumBrowser`/`webkitBrowser` in `beforeAll`/`afterAll` across sequential tests in `multiplayer-simulation.spec.ts`. Root cause HYPOTHESIS (unconfirmed): Test 1's `afterAll` force-closes browsers Test 2 then inherits. Proposed fix: move browser declarations to local per-test scope w/ try/finally. Phase B execution attempt on commit `216c916` REJECTED — structurally correct but zero validation ran (node/npm/npx not on PATH; nvm-prefixed follow-up issued). |
| 8 | `resume-after-refresh` test — `wsClients[0]` undefined at `gameOrchestrator.ts:153` | **OPEN — needs full log + code read** | none | Attempt 1 hangs silently after lobby state; retry throws `TypeError: Cannot read properties of undefined (reading 'waitForState')`. Suggests `initClients()` didn't populate `wsClients`. Log was truncated — need full untruncated log + read of `initClients()`/`runGame()` lobby-wait sequence before any fix attempt. |

### Harness Infrastructure (CLOSED/verified facts — do not re-investigate)
- Harness file committed on `main`: `scripts/test/playwright/specs/multiplayer-simulation.spec.ts` 
- `PLAYWRIGHT_BASE_URL` env var (not .env.local's app config) controls target — was never set, defaulted to `localhost:3000`. Correct invocation:
  - Prod: `PLAYWRIGHT_BASE_URL=https://www.guess-history.com npm run test:simulation` 
  - Local: `npm run dev` in one shell + `npm run test:simulation` in another
- WS transport fix confirmed end-to-end: commit `aab6e49` 
- Production PartyKit host confirmed healthy: `guess-history-multiplayer.lama010101.partykit.dev`, party `"lobby"` 
- Execution environment: Devin Local (MacBook Air) — required for persistent env / production Supabase access
- 6 disposable test accounts: `gh-test-player-N@test.guess-history.com`, recreated by `globalSetup()` every run

### Other Active Multiplayer Issues
| Issue | Status | Notes |
|-------|--------|-------|
| Sign-in/sign-out intermittency (sign-out sometimes UI-only, session not cleared) | OPEN | Not yet diagnosed. Auth client confirmed using `createBrowserClient` from `@supabase/ssr` in `src/core/supabaseBrowser.ts`. PKCE-active-by-default unconfirmed. Possible localStorage-vs-cookie session gap — needs one live browser test (document.cookie + localStorage check post-sign-in, plus refresh-on-protected-route check) before any fix. |
| 5-player live test disconnect at RESULT_PHASE (2026-06-21) | OPEN | One player dropped, cause undiagnosed. Needs read-only investigation. Fold into MP-AUTO-TEST-001 scenario inventory as "disconnect-at-RESULT_PHASE recovery" — but root cause of THIS incident is separate from the general reconnect-resilience scenario; do not conflate. Product goal: not "never disconnects" but "always recoverable, zero data loss, clear path back in." |
| Home Compete card "Your turn" indicator + cold re-entry | OPEN — design questions unresolved | (1) force-switch tab vs badge/highlight — forced switch may be disorienting; (2) does existing STATE_SNAPSHOT reconnect support cold re-entry from Home, or does new plumbing need to be built — UNKNOWN, needs investigation. |
| MP-FIX-VIEWER-BROADCAST-001 (guest doesn't see host's live era/year-range changes in lobby) | CONFIRMED BROKEN (2026-06-18) | Separately PARKED/deprioritized — broken and parked are both true, not contradictory. Not urgent. |

---

## SECTION B — UIX BACKLOG (opened 2026-06-24)

**Priority note:** This entire section is a parallel track to MP-AUTO-TEST-001. The harness has priority for Devin Local if both need it at the same time. Default UIX tasks to Devin Cloud or Windsurf/Cascade unless there's a specific reason to need Devin Local.

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | Home > Compete card invite link sometimes unresponsive until browser refresh | INVESTIGATING (Phase B-002 live verification complete, awaiting CTO review) | Phase B-001: 4 scenarios tested (3 FAIL, 1 code-read). Phase B-002 (MP-INV-INVITE-LINK-UNRESPONSIVE-B-002): dev server started, live Playwright verification run. INV-B1-01 PASS: hanging /api/compete/create leaves Create Game and Join Game buttons disabled after 60s (disabled=""). INV-B1-02 FAIL: hanging /auth/v1/user did not leave spinner visible; bootstrapIdentity also uses /auth/v1/user and hung first, so CompetePanel rendered with empty playerId and set invitesLoading=false. Blocker: cannot isolate getValidAccessToken hang from bootstrapIdentity on the same endpoint. INV-B1-03 PASS: rejected PATCH to game_invitations returned 403, invite row remained in DOM, no navigation, no unhandled promise rejection. Commit: <COMMIT_HASH>. |
| B2 | In-game map search can't resolve some English place names (confirmed failing: Delhi, Vietnam, Thailand) | OPEN — needs investigation | Likely a geocoding/place-search provider config issue. **Distinct from** CARTO Voyager tile labels (CLOSED, commit `c0a8636`, MP-IMPL-MAP-LANG-001) — that fix was for map tile rendering, not search/geocoding. Needs investigation into which search API is wired (Nominatim? Google Places? CARTO geocoder?) and why these specific queries fail. |
| B3 | **PRIORITY** — Rating button (1–10) at round/final results | NEEDS VERIFY-BEFORE-BUILD | `GAME_MODES_SPEC.md` §1.2 item 4 and §4.8 (History Collection) already specify a "Rate" tappable button opening a 1–10 rating modal on the result screen. Before any coder prompt: investigate whether this is (a) fully built and working, (b) UI present but non-functional, or (c) not built at all. Do not assume greenfield. |
| B4 | Language choice at sign-in/sign-up | OPEN — new feature | Touches auth UI + i18n config. No existing spec found for language selection at auth. Distinct from the deferred local/English map-label toggle (Zustand+Supabase+Settings, not started, tracked separately). |
| B5 | Image zoom during active round goes toward center instead of toward touch/pinch point | OPEN — in scope here (Lolo confirmed, despite styling adjacency — NOT deferred to the separate CSS conversation) | Likely a `transform-origin` bug in the image zoom component. Related to but distinct from the already-prioritized "gameplay image zoom" item (Priority #2, top-level). |
| B6 | Welcome modal should let new users pick an avatar using the same picker UI as the profile page avatar picker | OPEN — feature/reuse | Identify the existing avatar-picker component via investigation (likely already exists, given the closed 2026-06-18 avatar/profile backfill work) and surface it in the welcome modal flow. |

---

## SECTION C — TOP-LEVEL PRIORITIES (set 2026-06-18)
1. MP-AUTO-TEST-001 — automated 6-concurrent-user test harness (Section A)
2. Gameplay image zoom during active round (relates to B5 above but is the original, broader priority item)

---

## CLOSED LOG

- **MP-IMPL-MAP-LANG-001** (2026-06-19): CARTO Voyager tiles for English map labels. Commit `c0a8636`. Visually confirmed. RISK ACCEPTED: CARTO free tier is non-commercial-only — must move to paid plan before commercial launch (pre-launch blocker, tracked, not "someday"). Future scope, not started: local/English toggle (Zustand + Supabase + Settings UI).
- **Avatar/profile backfill** (2026-06-18): 67/111 accounts missing `profiles` row, backfilled via direct Supabase MCP. 111/111 confirmed. Avatar picker bug was a data gap, not a code bug — closed.
- **MP-FEAT-BOTTOMBAR-RESTYLE-001** (2026-06-19): Countdown card, Next button, progress dots restyled. Visually confirmed.
- **RainbowRing.tsx styling** (2026-06-19, commit `6386583`): Track stroke + center text. Color logic FINAL: `hsl(round((clamped/100)*120), 100%, 50%)` — value-based red→green hue. Gradient version explicitly REJECTED — do not reintroduce.
- **MP-REFACTOR-CARD-TOKENS-001**: Card design tokens into `globals.css`. Commit `85303be`. Done.

---

*File created 2026-06-24 by Claude (CTO) to replace long-form bug/status tracking in the `memory_user_edits` tool, which is capped at 30 entries. Memory now holds only compressed pointers to this file plus standing process rules. Coders update this file as instructed by prompt validation steps; Claude reviews and corrects status changes, coders never self-certify a CLOSED status.*
