# KNOWN CONSTRAINTS
## Architectural trip-wires that are easy to accidentally break.
## Every coder prompt touching affected files MUST reference this document.

---

### [KC-001] Leaflet z-index stacking context ceiling
**Affected files:** Any CSS module used in a component that renders a Leaflet map
**Affected rule:** `.sheetFieldWrap` in `src/components/compete/RoundActiveSection.module.css` 

**Constraint:**
Leaflet creates its own stacking context. Its internal z-index ceiling is 1000
(tile panes: 200–700, controls: 1000). Any UI element that must appear ABOVE
the map (dropdowns, tooltips, overlays, search results) MUST be placed in a
container with ALL THREE of:
  position: relative;
  overflow: visible;
  z-index: 1001; /* minimum — do not reduce */

Raising z-index on a CHILD inside a lower stacking context has ZERO effect.
The fix must be on the CONTAINER, not the child.

**History:** Fixed three times — MP-FIX-MAP-ZINDEX-001, MP-FIX-SEARCH-DROPDOWN-002,
MP-FIX-ZINDEX-REGRESSION-003. Each time it regressed because a subsequent task
overwrote the container rule without knowing this constraint existed.

**Regression guard (include in ALL prompts touching RoundActiveSection.module.css):**
  grep -A4 "sheetFieldWrap" src/components/compete/RoundActiveSection.module.css | grep "z-index: 1001"
  # Must return a match. If empty = FAIL, rollback immediately.

---

### [KC-002] broadcastStateUpdate must never use room.broadcast()
**Affected files:** `partykit/server.ts` 
**Affected function:** `broadcastStateUpdate` 

**Constraint:**
`broadcastStateUpdate` MUST use a per-socket loop via `room.getConnections()`.
NEVER use `room.broadcast()` directly inside this function.

**Regression guard (include in ALL prompts touching partykit/server.ts):**
  grep -n "room.broadcast" partykit/server.ts
  # Must return ZERO matches. Any match = FAIL.

---

### [KC-003] Nominatim geocoding must be proxied server-side
**Affected files:** Any component calling geocode/search
**Affected route:** `src/app/api/geocode/search/route.ts` 

**Constraint:**
Direct browser calls to Nominatim violate CSP. All geocoding must go through
the server-side proxy at `/api/geocode/search`.
Never call Nominatim from client-side code directly.

---

### [KC-004] WhenCard timeline avatar year label top offset
**Affected files:** WhenCard.tsx or its CSS module

**Constraint:**
The timeline avatar year label final value is `top: 30px`.
Do NOT revert to 26px. This was manually adjusted post MP-FIX-WHEN-AVATAR-002.

---

### [KC-005] Antimeridian haversine clamp
**Affected files:** `src/core/rules.ts`, `src/core/competeUtils.ts` 

**Constraint:**
Haversine `dLng` must be clamped to `[-π, π]` in both files.
Removing this clamp causes incorrect distance calculations for locations
near the antimeridian (Pacific).

---

### [KC-006] Pre-task WIP commit (mandatory before every coder task)
**Applies to:** Every prompt that modifies any file

**Constraint:**
Before touching any file, the coder must run:
  git add -A && git commit -m "wip: before [TASK-ID]"
This creates a rollback point. A task without a prior WIP commit cannot be
safely rolled back if a regression is introduced.

---

### [KC-007] Auth state machine — single source of truth
**Affected files:** `src/core/identity.ts`, `src/middleware.ts`, `src/app/auth/callback/route.ts`,
`src/core/supabaseBrowser.ts`, `src/components/AuthModal.tsx`, `src/components/NavModal.tsx`,
`src/app/account/page.tsx`, `src/app/home/page.tsx`, `src/hooks/useIdentity.ts`

**Constraint:**
1. `cachedState` in `src/core/identity.ts` is the ONLY client-side auth state cache.
   No other file may maintain a parallel auth-state variable.
2. Middleware (`src/middleware.ts`) uses `supabase.auth.getUser()` independently
   (server-side) — it does NOT read `cachedState`. This is intentional: middleware
   runs on a different runtime and cannot share module-level state with the browser.
3. `signOut()` in `identity.ts` MUST set `cachedState` to `{ status: "unauthenticated" }`
   in the `finally` block, AFTER `await supabase.auth.signOut()` resolves.
4. Callers of `signOut()` (NavModal, account/page) MUST NOT close UI, navigate,
   or call `onClose()` before `await signOut()` resolves. Doing so creates a race
   where `onAuthStateChange` can re-fire a stale `SIGNED_IN` event and reset
   `cachedState` back to ready.
5. `flowType: "pkce"` is hardcoded inside `@supabase/ssr`'s `createBrowserClient`.
   Do NOT add or remove `flowType` explicitly in `src/core/supabaseBrowser.ts`.
   It has been toggled 3 times (MP-FIX-AUTH-PKCE-001 → MP-FIX-AUTH-SIGNIN-005 →
   MP-FIX-AUTH-OAUTH-PKCE-001) with no effect — the library default is always PKCE.
6. OAuth redirect URLs in `AuthModal.tsx` should derive from `window.location.origin`
   or an environment variable, NOT be hardcoded to a production domain.
7. **NEVER add a `state` parameter check to `src/app/auth/callback/route.ts`.**
   The `@supabase/ssr` PKCE flow does NOT include a `state` query param in the
   callback redirect URL. CSRF protection is provided by the PKCE `code_verifier`
   (only the browser that initiated the OAuth flow holds the verifier, so
   `exchangeCodeForSession()` fails for any attacker-injected code). Adding a
   `state` presence check blocks ALL valid OAuth callbacks. This happened in
   commit 8498d2c (July 2) and broke Google Sign-In for all users for 24+ hours.
8. **NEVER add `flowType`, `autoRefreshToken`, `detectSessionInUrl`, or
   `persistSession` to `createBrowserClient` or `createServerClient` calls.**
   The `@supabase/ssr` library hardcodes these internally. Overriding them causes
   session desync between browser and server clients.
9. **The callback route (`src/app/auth/callback/route.ts`) MUST call
   `exchangeCodeForSession(code)` for any request with a `code` param.** The only
   acceptable early-return is when `code` is absent (redirect to `/login?error=missing_code`).
   Do NOT add additional guards (state, CSRF tokens, referer checks) that could
   block valid callbacks. The PKCE code_verifier is the CSRF defense.
10. **Email sign-in/sign-out flows MUST go through `supabaseBrowser.auth` methods**
    (`signInWithPassword`, `signUp`, `signOut`). Do NOT create custom auth endpoints
    or bypass the Supabase auth state machine.

**History:** Auth has regressed 7+ times across May–July 2026 due to:
- flowType ping-pong (3 cycles, all no-ops)
- sign-out race condition (MP-INV-AUTH-SIGNOUT-002, still partially open)
- WIP commits silently removing auth fixes (commit a7b614f)
- Authenticated users hitting /login and re-triggering OAuth (FIX-MIDDLEWARE-LOGIN-AUTH-REDIRECT-001)
- **state parameter check blocking all PKCE OAuth callbacks (FIX-PKCE-STATE-CHECK-BLOCKING-OAUTH-001,
   July 3 — broke Google Sign-In for 24+ hours, 0 sessions created for Google users)**

**Regression guard (include in ALL prompts touching auth files):**
  grep -n "flowType" src/core/supabaseBrowser.ts
  # Must return ZERO matches. Any match = someone added it again = FAIL.

  grep -rn "cachedState" src/ | grep -v "identity.ts"
  # Must return ZERO matches. Any match = parallel auth state = FAIL.

  grep -n "state" src/app/auth/callback/route.ts | grep -v "//\|console\|next\|import"
  # Must return ZERO matches. Any match = someone re-added the state check = FAIL.

  grep -n "Missing state" src/app/auth/callback/route.ts
  # Must return ZERO matches. Any match = the blocking state check is back = FAIL.

  grep -n "Promise.race" src/core/identity.ts
  # Must return ZERO matches EXCEPT for fetchDisplayName (PostgREST timeout, line 40). Any other match = retry/backoff logic re-added = FAIL.

  grep -rn "auth\.getSession\|auth\.getUser" src/app src/components src/hooks --include=*.ts --include=*.tsx | grep -v "src/app/api/"
  # Must return ZERO matches. Client code must route through readSession() only.
  # Server routes (src/app/api/**, src/middleware.ts, src/server/**) are exempt.

---

### [KC-008] IDE Editor-Buffer Desync
**Applies to:** Every task that edits a file via shell commands (sed/python/str_replace-via-terminal)

**Constraint:**
- Symptom: shell-based edits (sed/python/str_replace-via-terminal) to a file appear to succeed, but a later read shows the edits reverted and/or the file corrupted at the end (duplicated trailing fragments).
- Root cause: the coding IDE (Devin cloud IDE / Windsurf-Cascade) maintains an internal editor buffer for any file it has opened via its structured edit tool or a viewer/preview pane. If that buffer goes stale relative to disk (because a shell command changed the file outside the tool's knowledge) and the IDE later flushes/syncs that buffer, it silently overwrites the shell-made changes.
- Rule: for any file touched via shell commands in a task, do NOT also open or edit that same file through the IDE's built-in structured editor tool, and do NOT leave it open in a viewer/preview pane, within the same task. Pick exactly one edit modality per file per task.
- Verification requirement: re-read the file fresh from disk immediately before each individual edit (never edit from a cached read), and run `git diff <file>` immediately after each individual edit — not deferred to end of task — to confirm the specific change landed before making the next edit.
- On failure: if `git diff` shows an edit did not persist, STOP immediately and report. Do not attempt the same edit via a different tool/method as a workaround — that tool-switching is itself what produces the desync.
- Reference incident: 2026-07-07, SessionComplete.tsx — sed edits were correctly applied, then silently reverted and end-of-file corrupted by a stale IDE buffer flush.

---

### [KC-009] Sync compete pre-push golden-path gate (mandatory)
**Applies to:** Every push touching the sync compete protected-file list
(`scripts/dev/sync-compete-protected-files.txt`)

**Constraint:**
The husky `pre-push` hook runs the two-context golden-path Playwright spec
(`scripts/test/playwright/specs/sync-compete-golden-path.spec.ts`) before any
push that touches a protected file. The spec exercises the full sync compete
happy path (2 players, 2 rounds, PLAY_AGAIN) with per-context read-only WS
cross-assertion, plus preflight grep guards for KC-001/002/005/007.

Rules:
1. The hook MUST fail loudly (non-zero exit) if either the Next.js dev server
   (port 3000) or PartyKit (port 1999) is not running. The gate never silently
   passes. Use `scripts/dev/check-compete-stack.sh` for the liveness check.
2. The `--no-verify` bypass is accepted for rescue pushes, but does NOT replace
   the mandatory manual two-browser smoke test that must be performed pre-deploy
   regardless of hook outcome.
3. The protected-file list is data-driven from
   `scripts/dev/sync-compete-protected-files.txt` — edit the manifest, not the
   hook, when the file list changes.
4. The spec MUST NOT be weakened to make the gate pass. If the spec is flaky,
   fix the flakiness; do not loosen assertions. A green gate that does not
   catch regressions is worse than no gate.

**History:** Sync compete regressed multiple times during UI work (MP-FIX-SYNC-
DESYNC-001/002, BUG-FIX-COMPETE-EARLY-CLOSURE-001) because no fast gate existed
between the 45-min heavy simulation suite and manual testing. The heavy suite
is too slow to run pre-push; manual testing is too easy to skip.

**Regression guard (include in ALL prompts touching the hook or spec):**
  test -f .husky/pre-push && grep -q "sync-compete-golden-path" .husky/pre-push
  # Must return a match. If empty = hook removed or bypassed = FAIL.

  test -f scripts/dev/check-compete-stack.sh && grep -q "1999" scripts/dev/check-compete-stack.sh
  # Must return a match. If empty = partykit liveness check removed = FAIL.

---

### [KC-010] Playwright actionability bypass — CSS glow + sheet backdrop (golden-path spec)
**Affected files:** `scripts/test/playwright/helpers/compete-ui.ts`,
`scripts/test/playwright/specs/sync-compete-golden-path.spec.ts`

**Constraint:**
The golden-path spec uses two techniques that bypass Playwright's default
actionability checks. Both are deliberate workarounds for known UI issues,
not shortcuts to make the test pass. They create a coverage gap that MUST
be understood by anyone editing the spec or the components it exercises.

1. **`force: true` on WHEN button click** — The WHEN button has a CSS glow
   animation (`whenBtnGlow` in `RoundActiveSection.module.css`) that makes
   Playwright's actionability check consider the element unstable. The
   `force: true` flag bypasses this check. If the glow animation is removed
   or changed, the `force: true` should also be removed so Playwright can
   verify the button is actually clickable.

2. **`page.evaluate(() => element.click())` for sheet transitions** — The
   WHERE/WHEN bottom sheets have a backdrop (`sheetBackdrop`) that intercepts
   Playwright's pointer-based clicks. The helper uses `page.evaluate` to fire
   `element.click()` directly on the DOM element, bypassing the backdrop.
   This is necessary because Playwright's click simulates a real pointer event
   that hits the topmost element at the coordinates (the backdrop), not the
   button behind it.

**Coverage gap (CRITICAL):**
DOM-level clicks via `page.evaluate(() => element.click())` bypass
Playwright's pointer-interception checks. This means:
- If a backdrop regression makes buttons unclickable for REAL users (pointer
  events blocked by the backdrop), the golden-path spec will NOT catch it —
  the DOM click fires the React onClick handler directly, ignoring whether
  the element is actually reachable by a real pointer.
- The spec verifies that the React handlers fire and state transitions
  correctly, but does NOT verify that a real user can physically click the
  buttons through the UI.
- This gap is accepted for the golden-path gate because the alternative
  (making the spec fully pointer-accurate) would require fixing the backdrop
  interception issue in the component CSS, which is a separate task. A
  pointer-accurate regression test for backdrop interception should be added
  as a separate spec if backdrop regressions become recurrent.

**Regression guard (include in ALL prompts touching compete-ui.ts):**
  grep -n "force: true" scripts/test/playwright/helpers/compete-ui.ts
  # Must return at least 2 matches (WHEN button + map click). If zero = the
  # force bypass was removed without fixing the underlying actionability issue.

  grep -n "page.evaluate" scripts/test/playwright/helpers/compete-ui.ts
  # Must return at least 4 matches (close WHEN backdrop, open WHERE, close
  # WHERE backdrop, submit). If zero = DOM-click bypass removed without fixing
  # backdrop interception.

---
