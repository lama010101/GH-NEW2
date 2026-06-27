# GUESS-HISTORY | MP-PLAN-COMPETE-AUDIT-FIX-001
# Implementation Plan — Compete Mode Structural Audit (10 findings)

STATUS: PLANNING ONLY. No code edits performed in this task.
All file:line references verified against live code on 2026-06-27.

=====================================================================
ORDER: C1, C3, H1, H3, M1, M2, M3, L1, L2, then C2+H2 (DECISION block)
=====================================================================

---------------------------------------------------------------------
## C1 — MP-FIX-COMPETE-AUDIT-REVEAL-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed, not re-investigated)
src/server/getGameState.ts:481-487 computes `shouldRevealAnswer` by taking
the LATEST event for the roundIndex and requiring its eventType to be
exactly "ROUND_COMPLETE" or "SESSION_COMPLETE". After ROUND_COMPLETE is
written, additional events are appended for the SAME roundIndex
(RESULT_STARTED, READY_NEXT), which then become "latest" and fail the
allowlist → answer nulls out for every player once any player clicks
Next Round.

### REQUIRED PRE-FIX ENUMERATION (per task spec)
Question: "what is the FULL set of event types that can be appended for
a round AFTER ROUND_COMPLETE or SESSION_COMPLETE?"

Grep evidence (eventStore.ts:20-28 EventType union + eventStream.ts:31-37
VALID_PHASE_TRANSITIONS + sessionCore.ts:2077 SESSION_COMPLETE write +
PROGRESS.md MP-FIX-RESULT-PHASE-001b RESULT_STARTED write):

  EventType union (eventStore.ts:20-28):
    SESSION_CREATED, ROUND_STARTED, GUESS_SUBMITTED, ROUND_COMPLETE,
    RESULT_STARTED, READY_NEXT, SESSION_COMPLETE, PRESSURE_APPLIED

  Events that can carry the SAME roundIndex AFTER ROUND_COMPLETE:
    1. RESULT_STARTED   — written in submitGuess transaction immediately
                          after ROUND_COMPLETE (sessionCore.ts, per
                          MP-FIX-RESULT-PHASE-001b). roundIndex = same.
    2. READY_NEXT       — written per player clicking Next Round
                          (partykit READY_NEXT handler → DB). roundIndex
                          = same. Multiple per round (one per player).
    3. SESSION_COMPLETE — written at end of last round; carries the LAST
                          round's roundIndex (sessionCore.ts:2077
                          appendEvent(..., roundIndex)). So for the
                          final round, SESSION_COMPLETE is appended
                          AFTER ROUND_COMPLETE with the same roundIndex.

  Events that carry a DIFFERENT roundIndex after ROUND_COMPLETE:
    - ROUND_STARTED (next round, roundIndex+1) — does NOT affect this
      round's reveal decision under the proposed fix.

  NOTE on FSM inconsistency (out of scope for this task, flagged only):
  eventStream.ts:35 VALID_PHASE_TRANSITIONS["ROUND_COMPLETE"] does NOT
  list RESULT_STARTED, yet sessionCore writes it. That is a separate
  finding (FSM gap), NOT C1. C1's fix must be robust to RESULT_STARTED
  existing regardless of whether the FSM is later tightened.

  => The proposed fix must treat the round as "revealed" if a
     ROUND_COMPLETE OR SESSION_COMPLETE event EXISTS for that
     roundIndex, regardless of what was appended afterward
     (RESULT_STARTED / READY_NEXT / SESSION_COMPLETE).

### FILE TO TOUCH (ONE file)
src/server/getGameState.ts — single function (the roundEventContent
builder inside getGameState, lines 479-499).

### PROPOSED CHANGE

BEFORE (getGameState.ts:481-487):
```ts
const latestRoundEvent = events
  .filter(event => event.roundIndex === roundIndex)
  .reduce<RoundEvent | null>(
    (latest, event) => latest === null || event.id > latest.id ? event : latest,
    null
  );
const shouldRevealAnswer =
  latestRoundEvent?.eventType === "ROUND_COMPLETE" ||
  latestRoundEvent?.eventType === "SESSION_COMPLETE";
```

AFTER:
```ts
// Reveal answer for a round once ROUND_COMPLETE (or terminal
// SESSION_COMPLETE) has been written for that roundIndex, regardless
// of later RESULT_STARTED / READY_NEXT / SESSION_COMPLETE events
// appended with the same roundIndex. See MP-FIX-COMPETE-AUDIT-REVEAL-001.
const shouldRevealAnswer = events.some(
  event =>
    event.roundIndex === roundIndex &&
    (event.eventType === "ROUND_COMPLETE" ||
     event.eventType === "SESSION_COMPLETE")
);
```

Rationale: switches from "latest event matches" to "any completing
event exists for the round". This correctly handles the full enumerated
set (RESULT_STARTED, READY_NEXT, SESSION_COMPLETE appended after) because
none of them erase the prior ROUND_COMPLETE from the events array.

### VALIDATION (specific to this fix)
1. `npm run typecheck` exits 0.
2. grep proof no duplicate reveal logic:
   `grep -rn "shouldRevealAnswer" src/` → exactly 1 match (this site).
3. grep proof old "latest event" pattern removed:
   `grep -n "latestRoundEvent" src/server/getGameState.ts` → 0 matches.
4. Behavioral proof (manual, against a live game in ROUND_COMPLETE→
   READY_NEXT state): call `GET /api/compete/[gameId]` after one player
   has clicked Next Round (READY_NEXT written). BEFORE: `rounds[].year`
   is null/0 for the completed round. AFTER: `rounds[].year` equals the
   real event_year for the completed round.
5. FSM enumeration proof: confirm the fix is invariant to event order
   by checking that for a round with events
   [ROUND_COMPLETE, RESULT_STARTED, READY_NEXT, READY_NEXT], `some()`
   returns true (ROUND_COMPLETE present) — unit-style assertion in a
   scratch ts file (deleted after), no production test file added.

### DEPENDENCY ORDER
C1 is INDEPENDENT. It should be fixed BEFORE H3 because both touch
round-result interpretation in getGameState.ts (H3 is line 350, C1 is
lines 481-487 — same file, different functions). Fixing C1 first keeps
the one-file-per-task discipline clean and avoids merge conflicts.

---------------------------------------------------------------------
## C3 — MP-FIX-COMPETE-AUDIT-GETAUTH-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
Four GET route handlers query the service-role `dbPool` (bypasses RLS)
and return full game data based solely on the path gameId, with NO
check that the caller is a participant of that game:
  - src/app/api/compete/[gameId]/all-results/route.ts (dbPool.query)
  - src/app/api/compete/[gameId]/route.ts (loadCompeteSessionSnapshot)
  - src/app/api/compete/[gameId]/snapshot/route.ts (loadCompeteSessionSnapshot)
  - src/app/api/compete/[gameId]/round/[roundIndex]/results/route.ts (getRoundResults)

### IMPORTANT CORRECTION TO THE AUDIT WORDING (must be resolved before fix)
The audit says "unauthenticated". The middleware (src/middleware.ts)
already enforces Supabase auth on `/api/compete/[gameId]/*` (it is NOT
in PUBLIC_API_ROUTES, lines 12-18) and redirects caller to /login when
`supabase.auth.getUser()` returns no user (lines 109-113). The
x-partykit-secret bypass (lines 100-107) only applies to DO
server-to-server calls.

So the ACTUAL vulnerability is BROKEN OBJECT-LEVEL AUTHORIZATION
(BOLA / IDOR), not "no auth at all": any LOGGED-IN user can read ANY
game's full data by guessing a gameId, because the handlers use the
service-role pool and never verify the caller's playerId is a
session_players row for that gameId.

The plan must first VERIFY this with curl (step V0 below). If curl
without auth returns 200+data (not 307→/login), the middleware has a
gap and the fix scope expands to middleware too. If curl without auth
returns 307→/login, the fix is purely per-handler participant
authorization.

### FILES TO TOUCH
This genuinely requires 4 files (one per route handler). Under the
one-file-per-task rule this is split into 4 sub-tasks executed
sequentially with identical pattern:
  C3a — all-results/route.ts
  C3b — [gameId]/route.ts
  C3c — snapshot/route.ts
  C3d — round/[roundIndex]/results/route.ts

JUSTIFICATION for not collapsing into 1 file: the 4 routes are
independent handlers in 4 separate files; the one-file-per-task rule
forbids touching 4 files in one task. Each sub-task adds the SAME
authorization check to its own handler.

A shared helper `assertGameParticipant(gameId, playerId)` SHOULD be
added to src/server/sessionCore.ts as a prerequisite task (C3-pre),
because duplicating the participant-lookup SQL across 4 handlers would
violate the single-source-of-truth rule. So execution order:
  C3-pre (add helper to sessionCore.ts) → C3a, C3b, C3c, C3d.

### PROPOSED CHANGE — C3-pre (src/server/sessionCore.ts)
Add one exported function:
```ts
// Returns true iff playerId is an active (left_at IS NULL) row in
// session_players for gameId. Used by GET route handlers to enforce
// object-level authorization (C3). Throws on DB error.
export async function isGameParticipant(
  gameId: string,
  playerId: string | null | undefined
): Promise<boolean> {
  if (!playerId) return false;
  const result = await dbPool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM session_players
     WHERE game_id = $1 AND player_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [gameId, playerId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}
```

### PROPOSED CHANGE — each of C3a/C3b/C3c/C3d
In each handler, BEFORE the existing data query, resolve the caller's
playerId from the SAME source the handler already reads (header
`x-viewer-player-id` / query `playerId`), then:
```ts
const ok = await isGameParticipant(gameId, viewerPlayerId);
if (!ok) {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
```
For all-results and round-results routes (which currently do NOT read
a playerId param), add the same header/query read. The caller's
playerId is the authorization identity; middleware already guarantees
a logged-in Supabase user, and the client sends its playerId via
x-viewer-player-id (existing pattern in [gameId]/route.ts:18-21).

NOTE: This plan does NOT bind the Supabase user.id to the playerId in
this task (that is a deeper identity-binding fix, separate finding).
This task closes the BOLA gap by requiring a valid participant
playerId. A follow-up task should verify playerId ↔ supabase auth.uid
binding; flagged in CTO_BACKLOG but out of scope here.

### VALIDATION (per route, with exact curl)
Run against a local dev server with a known gameId `G` (real UUID from
a test session) and a participant playerId `P` and a non-participant
playerId `X`.

V0 (middleware gap check, run once before any fix):
  curl -i http://localhost:3000/api/compete/G/snapshot
  EXPECT: 307 redirect to /login (confirms middleware blocks
  unauthenticated; fix scope = per-handler BOLA only).
  If instead 200 + JSON → middleware gap; STOP and escalate.

C3a — all-results:
  curl -i -H "x-viewer-player-id: X" http://localhost:3000/api/compete/G/all-results
  EXPECT AFTER fix: 403 {"error":"forbidden"}
  curl -i -H "x-viewer-player-id: P" http://localhost:3000/api/compete/G/all-results
  EXPECT AFTER fix: 200 {"results":[...]}

C3b — [gameId]:
  curl -i "http://localhost:3000/api/compete/G?playerId=X"
  EXPECT AFTER fix: 403
  curl -i "http://localhost:3000/api/compete/G?playerId=P"
  EXPECT AFTER fix: 200 + snapshot JSON

C3c — snapshot:
  curl -i "http://localhost:3000/api/compete/G/snapshot?playerId=X"
  EXPECT AFTER fix: 403
  curl -i "http://localhost:3000/api/compete/G/snapshot?playerId=P"
  EXPECT AFTER fix: 200 + snapshot JSON

C3d — round results:
  curl -i -H "x-viewer-player-id: X" http://localhost:3000/api/compete/G/round/0/results
  EXPECT AFTER fix: 403
  curl -i -H "x-viewer-player-id: P" http://localhost:3000/api/compete/G/round/0/results
  EXPECT AFTER fix: 200 {"results":[...]}

Also: `npm run typecheck` exits 0; grep proof the helper exists once:
  grep -rn "isGameParticipant" src/ → 5 matches (1 def + 4 call sites).

### DEPENDENCY ORDER
C3-pre must land first. C3a–C3d are independent of each other and of
C1/H1/H3/M/L. No dependency on C2/H2.

---------------------------------------------------------------------
## H1 — MP-FIX-COMPETE-AUDIT-GEOCODE-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
src/app/compete/[gameId]/page.tsx:331-341 calls Nominatim reverse
geocode directly from the browser:
`https://nominatim.openstreetmap.org/reverse?...`
This violates KNOWN_CONSTRAINTS.md KC-003 (no direct third-party calls
from browser; must proxy via server). The existing
src/app/api/geocode/search/route.ts only does FORWARD search (`?q=`),
not reverse (`?lat=&lon=`).

### FILES TO TOUCH
This requires 2 files:
  H1a — src/app/api/geocode/reverse/route.ts (NEW route, server proxy)
  H1b — src/app/compete/[gameId]/page.tsx (replace direct fetch with
        call to the new proxy)

JUSTIFICATION for 2 files: adding a server proxy is a new endpoint
(file 1), and the browser call site must switch to it (file 2). These
cannot be one file. Executed as two sequential sub-tasks.

### PROPOSED CHANGE — H1a (new file src/app/api/geocode/reverse/route.ts)
Mirror the existing search/route.ts structure:
```ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  if (lat === null || lon === null) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return NextResponse.json({ error: "lat and lon must be numbers" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lonNum}&format=json&zoom=10`,
      {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "GuessHistory/1.0 (contact@guesshistory.app)",
          "Accept": "application/json",
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "geocode failed" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "geocode failed" }, { status: 502 });
  }
}
```
Note: `/api/geocode` is already in PUBLIC_API_ROUTES (middleware.ts:16),
so the new `/api/geocode/reverse` route is reachable without changing
middleware. (If participant gating is desired later, that is a separate
hardening task — out of scope for H1, which is purely the KC-003
browser→server proxy violation.)

### PROPOSED CHANGE — H1b (page.tsx:331-341)
BEFORE:
```ts
const res = await fetch(
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
  {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "GuessHistory/1.0",
    },
  }
);
if (!res.ok) throw new Error("Geocode failed");
const data = await res.json();
```
AFTER:
```ts
const res = await fetch(
  `/api/geocode/reverse?lat=${lat}&lon=${lng}`
);
if (!res.ok) throw new Error("Geocode failed");
const data = await res.json();
```
The rest of the address-parsing block (lines 344-358) is unchanged.

### VALIDATION
1. `npm run typecheck` exits 0.
2. grep proof no direct Nominatim call remains in client code:
   `grep -rn "nominatim.openstreetmap.org" src/app/` → 0 matches in
   client components (only the two server proxies remain).
3. curl the proxy directly:
   curl -i "http://localhost:3000/api/geocode/reverse?lat=48.8566&lon=2.3522"
   EXPECT: 200 + JSON with `display_name` / `address`.
4. curl missing params:
   curl -i "http://localhost:3000/api/geocode/reverse"
   EXPECT: 400 {"error":"lat and lon are required"}.
5. Manual: in the compete UI, set a guess location and confirm the
   location name still resolves via the proxy (network tab shows
   /api/geocode/reverse, not nominatim directly).

### DEPENDENCY ORDER
H1a before H1b. Independent of all other items.

---------------------------------------------------------------------
## H3 — MP-FIX-COMPETE-AUDIT-DIDSUBMIT-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
src/server/getGameState.ts:350:
```ts
didSubmit: (r.year_diff as number | null) !== null,
```
Non-submitters get `year_diff = 200` written (penalty), never null, so
this is always true. The client-facing path getRoundResults
(sessionCore.ts:2184+) correctly uses `year_guess !== null` instead
(round_commits.year_guess is null when no commit was made).

### FILE TO TOUCH (ONE file, ONE function)
src/server/getGameState.ts — the resultsByRound builder, line 350 only.

### PROPOSED CHANGE
BEFORE (line 350):
```ts
didSubmit: (r.year_diff as number | null) !== null,
```
AFTER:
```ts
didSubmit: (r.year_guess as number | null) !== null,
```
REQUIREMENT: the SELECT that feeds `resultsJson` must include
`year_guess` from round_commits. This MUST be verified before editing —
grep the query that populates `resultsJson` for `year_guess`. If the
column is not selected, the fix expands to also add it to the SELECT
(still one file, but two lines). This is the "depends on something you
need to check first" case the task spec allows.

### VALIDATION
1. `npm run typecheck` exits 0.
2. grep proof the wrong expression is gone:
   `grep -n "year_diff as number | null) !== null" src/server/getGameState.ts`
   → 0 matches.
3. grep proof the correct expression matches the client path:
   `grep -n "year_guess as number | null) !== null" src/server/getGameState.ts`
   → 1 match (line 350).
4. Behavioral proof: for a round where one player did NOT submit,
   GET /api/compete/[gameId] must return `didSubmit: false` for that
   player on that round (BEFORE: true). Cross-check against
   getRoundResults which already returns false for the same player.
5. Single-source-of-truth proof: both getGameState and getRoundResults
   now derive didSubmit from year_guess — grep both:
   `grep -rn "didSubmit" src/server/` → all matches use year_guess.

### DEPENDENCY ORDER
Fix AFTER C1 (both touch getGameState.ts; C1 lines 481-487, H3 line
350 — different functions, but sequencing avoids conflicts). Otherwise
independent.

---------------------------------------------------------------------
## M1 — MP-FIX-COMPETE-AUDIT-EVENTNAME-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
Event is named `PRESSURE_APPLIED` in code and DB (eventStore.ts:24,
sessionCore.ts:356, etc.) but the spec/WS message type calls it
`TIMER_CLAMPED` (GAME_MODES_SPEC.md:535). Naming inconsistency only;
no behavior bug.

### DECISION REQUIRED (naming-direction)
This is a rename, which the gh-coder rule normally forbids. Two
candidate resolutions; the plan presents both but does NOT pick:

  Option M1-A: Code becomes canonical, spec updated.
    - Touch docs/GAME_MODES_SPEC.md only (change `TIMER_CLAMPED` →
      `PRESSURE_APPLIED` at line 535). Zero code/DB risk.
    - Tradeoff: spec text drifts from any future WS message type named
      TIMER_CLAMPED; but no such WS type exists in code today (grep
      shows TIMER_CLAMPED only in the spec).

  Option M1-B: Spec becomes canonical, rename code+DB.
    - Requires migrating existing `PRESSURE_APPLIED` rows in
      round_events.event_type to `TIMER_CLAMPED`, updating eventStore
      EventType union, eventStream VALID_PHASE_TRANSITIONS keys,
      sessionCore eventTypeToSessionStatus switch, all reads/writes.
    - Tradeoff: large blast radius, DB migration, breaks any
      historical event replay assumptions. NOT recommended for a
      naming-only issue.

  Recommended (pending CTO): M1-A (doc-only). But this is marked
  BLOCKED-PENDING-CTO-DECISION alongside C2/H2 because it is a
  canonical-naming ruling.

### FILE TO TOUCH (under M1-A)
docs/GAME_MODES_SPEC.md line 535 only.

### PROPOSED CHANGE (M1-A)
BEFORE: `...persisted as \`TIMER_CLAMPED\` in \`round_events\`.`
AFTER:  `...persisted as \`PRESSURE_APPLIED\` in \`round_events\`.`

### VALIDATION
1. grep proof code uses PRESSURE_APPLIED:
   `grep -rn "PRESSURE_APPLIED" src/ partykit/` → matches in
   eventStore.ts, sessionCore.ts, eventStream.ts.
2. grep proof spec no longer says TIMER_CLAMPED:
   `grep -n "TIMER_CLAMPED" docs/GAME_MODES_SPEC.md` → 0 matches.
3. grep proof no code references TIMER_CLAMPED (so rename is safe):
   `grep -rn "TIMER_CLAMPED" src/ partykit/` → 0 matches.

### DEPENDENCY ORDER
Independent. Marked BLOCKED-PENDING-CTO-DECISION (naming direction).

---------------------------------------------------------------------
## M2 — MP-FIX-COMPETE-AUDIT-COMMENT-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
partykit/server.ts:547-548 stale comment says "waits 40 seconds" but
ROUND_EXPIRY_SUBMIT_GRACE_MS = 1_000 (1 second) at partykit/server.ts:225.
Comment-only fix.

### FILE TO TOUCH (ONE file)
partykit/server.ts — comment block lines 546-549 only.

### PROPOSED CHANGE
BEFORE (lines 546-549):
```ts
  /**
   * Called when a round timer expires. First completes the round (scores + ROUND_COMPLETE),
   * waits 40 seconds for clients to display results and optionally click "Next Round",
   * then advances to next round. Uses API-returned snapshots — no re-fetch.
   */
```
AFTER:
```ts
  /**
   * Called when a round timer expires. First completes the round (scores + ROUND_COMPLETE),
   * waits ROUND_EXPIRY_SUBMIT_GRACE_MS (1s) for clients to display results and optionally click "Next Round",
   * then advances to next round. Uses API-returned snapshots — no re-fetch.
   */
```

### VALIDATION
1. grep proof no "40 seconds" stale text remains:
   `grep -n "40 seconds" partykit/server.ts` → 0 matches.
2. grep proof the referenced constant exists:
   `grep -n "ROUND_EXPIRY_SUBMIT_GRACE_MS" partykit/server.ts` → 2
   matches (declaration line 225 + usage line 570).
3. `npm run typecheck` exits 0 (comment-only, no behavior change).

### DEPENDENCY ORDER
Independent.

---------------------------------------------------------------------
## M3 — MP-FIX-COMPETE-AUDIT-RETRY-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
src/server/sessionCore.ts:489-500 — loadCompeteSessionSnapshot returns
null on a transient state (ROUND_COMPLETE or SESSION_COMPLETE event
written but round_results not yet committed), forcing caller retries.
Acceptable at low load; latency/race risk under concurrency.

### FILE TO TOUCH (ONE file, ONE function)
src/server/sessionCore.ts — the replay-equivalence check block,
lines 486-501.

### PROPOSED CHANGE
This is a HARDENING fix, not a behavior change. Two candidate
approaches; the plan recommends the bounded-retry approach but flags
the tradeoff:

  Option M3-A (recommended): Bounded in-function retry with backoff.
    Wrap the snapshot load in a short bounded retry (e.g. 3 attempts,
    50ms apart, total ≤150ms) BEFORE returning null. If still
    inconsistent after retries, return null (existing contract
    preserved). This collapses the transient window for callers without
    changing the null-return contract for truly broken state.

  Option M3-B: Leave as-is, document the retry expectation at call
    sites. Zero code change; only doc/comment. Tradeoff: every caller
    must implement its own retry; current callers already do (e.g.
    partykit cold load retries). Risk = caller that forgets to retry
    sees a spurious null.

UNDER M3-A, the change is local to loadCompeteSessionSnapshot:

BEFORE (lines 486-501, summarized):
```ts
if (gameState.events.length > 0) {
  const lastEvent = gameState.events[gameState.events.length - 1];
  if (lastEvent.eventType === "ROUND_COMPLETE" && status !== "ROUND_COMPLETE") {
    return null;
  }
  if (lastEvent.eventType === "SESSION_COMPLETE" && status !== "SESSION_COMPLETE") {
    return null;
  }
}
```

AFTER (sketch — exact loop bounds pending CTO approval of M3-A):
```ts
// Bounded retry for transient state where the phase event is written
// but round_results/session status not yet committed (M3). Total wait
// ≤ RETRY_TOTAL_MS to avoid unbounded blocking under concurrency.
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 50;
for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
  // ... existing snapshot rebuild ...
  if (gameState.events.length > 0) {
    const lastEvent = gameState.events[gameState.events.length - 1];
    const transient =
      (lastEvent.eventType === "ROUND_COMPLETE" && status !== "ROUND_COMPLETE") ||
      (lastEvent.eventType === "SESSION_COMPLETE" && status !== "SESSION_COMPLETE");
    if (transient && attempt < RETRY_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    if (transient) return null;
  }
  break;
}
```
NOTE: This sketch restructures the function body around the existing
rebuild. The exact diff depends on where the snapshot rebuild sits
relative to this check; the implementer must read lines ~370-506 in
full before editing. Flagged as "depends on something you need to
check first" per task spec.

### VALIDATION
1. `npm run typecheck` exits 0.
2. grep proof retry constants are local:
   `grep -n "RETRY_ATTEMPTS\|RETRY_DELAY_MS" src/server/sessionCore.ts`
   → 2 matches, both inside loadCompeteSessionSnapshot.
3. Behavioral proof: simulate the transient (write ROUND_COMPLETE event
   but delay round_results commit by 120ms). BEFORE: caller gets null
   on first call. AFTER: caller gets the snapshot within ~100ms
   without external retry.
4. Concurrency safety: confirm retry does NOT introduce a second
   source of truth — it only re-reads the same DB; no in-memory cache.
   (Satisfies determinism rule.)
5. Null contract preserved: if the inconsistency is permanent (truly
   broken state), the function still returns null after retries.

### DEPENDENCY ORDER
Independent of C1/H3 (different function in same file; sequence after
them to avoid merge conflicts). Marked as HARDENING — may be deferred
if CTO prefers M3-B (doc-only).

---------------------------------------------------------------------
## L1 — MP-FIX-COMPETE-AUDIT-ORPHANCONST-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
src/server/sessionCore.ts:75-76 — two exported constants never
referenced anywhere:
```ts
export const PRESSURE_CLAMP_SECONDS = 20;
export const RESULTS_COUNTDOWN_SECONDS = 30;
```
grep across repo confirms zero references outside their declaration
(only docs/audit reports mention them).

### CRITICAL ORDERING NOTE (per task spec)
DO NOT assume deletion is correct. The correct fix for C2 (clamp
seconds) and H2 (results countdown) might be to WIRE UP these
constants rather than delete them:
  - PRESSURE_CLAMP_SECONDS=20 matches the spec (GAME_MODES_SPEC.md:475
    "First-submission clamp to 20s") but NOT the live code
    (partykit/server.ts:1160 hardcodes CLAMP_SEC=30).
  - RESULTS_COUNTDOWN_SECONDS=30 matches the spec's Rush 30s timeout
    context but NOT RESULTS_AUTO_ADVANCE_DEFAULT=90.

Therefore L1 MUST be executed AFTER C2 and H2 are resolved:
  - If CTO rules "spec is canonical, fix code to 20s/30s" → the fix
    for C2/H2 is to WIRE UP these constants (import them in
    partykit/server.ts and sessionCore.ts respectively) and DELETE the
    hardcoded 30 / 90. In that case L1 becomes "wire up, do not
    delete" and is absorbed into C2/H2.
  - If CTO rules "code is canonical, update spec" → these constants
    remain orphan and L1 deletes them.

So L1 is BLOCKED-PENDING-CTO-DECISION (depends on C2/H2 ruling).

### FILE TO TOUCH (under the deletion branch only)
src/server/sessionCore.ts lines 75-76 only.

### PROPOSED CHANGE (deletion branch)
BEFORE:
```ts
export const PRESSURE_CLAMP_SECONDS = 20;
export const RESULTS_COUNTDOWN_SECONDS = 30;
```
AFTER: (lines removed entirely)

### VALIDATION
1. `npm run typecheck` exits 0 (proves no consumer existed).
2. grep proof zero references:
   `grep -rn "PRESSURE_CLAMP_SECONDS\|RESULTS_COUNTDOWN_SECONDS" src/ partykit/`
   → 0 matches.
3. Single-file proof: `git diff --name-only` → only
   src/server/sessionCore.ts.

### DEPENDENCY ORDER
BLOCKED on C2 + H2 CTO decision. Execute LAST among the L items.

---------------------------------------------------------------------
## L2 — MP-FIX-COMPETE-AUDIT-LOGROUNDEVENT-001
---------------------------------------------------------------------

### ROOT CAUSE (confirmed)
src/server/eventStore.ts:233-243 — logRoundEvent is marked
@deprecated with console.warn but still exported. grep across the
whole repo shows ZERO callers (only the definition matches). Dead code
that could be called by accident.

### FILE TO TOUCH (ONE file)
src/server/eventStore.ts — remove the logRoundEvent function and its
@deprecated JSDoc block, lines 225-243 (the "LEGACY COMPATIBILITY"
section header at 225-227 may also be removed since it has no other
content).

### PROPOSED CHANGE
BEFORE (lines 225-243):
```ts
// ═════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY — REMOVE AFTER MIGRATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use appendEvent() instead. This function exists only for backward
 * compatibility during migration and will be removed.
 */
export async function logRoundEvent(
  gameId: string,
  roundIndex: number | null,
  eventType: string,
  payload: Record<string, unknown>,
  client: DbTransactionClient
): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn("[DEPRECATED] logRoundEvent() called - migrate to appendEvent()");
  await appendEvent(client, gameId, eventType as EventType, payload, roundIndex);
}
```
AFTER: (entire block removed; file ends after the prior function at
line 223 `}`).

### VALIDATION
1. `npm run typecheck` exits 0 (proves no caller existed).
2. grep proof zero references:
   `grep -rn "logRoundEvent" .` → 0 matches (was 2: def + warn string,
   both inside the deleted function).
3. Single-file proof: `git diff --name-only` → only
   src/server/eventStore.ts.
4. No-export proof: confirm appendEvent (the canonical path) is still
   exported and used:
   `grep -rn "appendEvent" src/ partykit/` → many matches, unchanged.

### DEPENDENCY ORDER
Independent. Safe to execute anytime.

=====================================================================
## DECISION REQUIRED BLOCK — C2 + H2 (BLOCKED-PENDING-CTO-DECISION)
=====================================================================

These two findings are about CONFLICTING VALUES for the same concept
across code / orphan constant / spec. The plan does NOT propose a fix
value. It presents candidate resolutions with tradeoffs and awaits a
CTO ruling.

---------------------------------------------------------------------
### C2 — MP-FIX-COMPETE-AUDIT-CLAMPSEC-001 (BLOCKED)
---------------------------------------------------------------------
CONFLICT:
  - partykit/server.ts:1160  CLAMP_SEC = 30            (live behavior)
  - sessionCore.ts:75        PRESSURE_CLAMP_SECONDS = 20 (orphan, unused)
  - GAME_MODES_SPEC.md:475   "First-submission clamp to 20s" (spec)

Three values for the same concept (first-submission timer clamp).

CANDIDATE RESOLUTIONS:

  C2-Option-A: SPEC IS CANONICAL → fix code to 20s.
    - Wire up PRESSURE_CLAMP_SECONDS (import from sessionCore.ts) in
      partykit/server.ts:1160, replacing hardcoded `const CLAMP_SEC = 30`
      with `const CLAMP_SEC = PRESSURE_CLAMP_SECONDS;`.
    - Delete the hardcoded 30.
    - Tradeoff: changes LIVE behavior (clamp shortens 30s→20s). Players
      get 10s less after first submission. Must be communicated as a
      gameplay change. Matches spec intent. Absorbs L1 (constant
      becomes used, not deleted).

  C2-Option-B: CODE IS CANONICAL → update spec to 30s, delete orphan.
    - Update GAME_MODES_SPEC.md:475 "20s" → "30s".
    - Delete PRESSURE_CLAMP_SECONDS (L1 deletion branch).
    - Tradeoff: zero behavior change; spec documents what actually
      ships. Risk: if 30s was an accidental hardcoded value (not a
      deliberate product choice), codifying it hides the original
      intent.

  C2-Option-C: HYBRID — keep 30s live, but make it configurable via
    the existing session config table, default 30, spec updated.
    - Tradeoff: largest scope (schema/config plumbing); overkill for a
      single timer. NOT recommended unless product wants per-game
      clamp tuning.

RECOMMENDED EVIDENCE TO GATHER BEFORE RULING (not part of fix):
  - git blame partykit/server.ts:1160 to see if 30 was a deliberate
    change or a typo for 20.
  - Check whether any player-facing copy/UI references "20s" or "30s"
    for the clamp.

STATUS: BLOCKED-PENDING-CTO-DECISION. No file touched until ruling.

---------------------------------------------------------------------
### H2 — MP-FIX-COMPETE-AUDIT-AUTOADVANCE-001 (BLOCKED)
---------------------------------------------------------------------
CONFLICT:
  - sessionCore.ts:509       RESULTS_AUTO_ADVANCE_DEFAULT = 90
                            (also the DB column default at insert,
                             sessionCore.ts:563)
  - sessionCore.ts:76        RESULTS_COUNTDOWN_SECONDS = 30 (orphan)
  - GAME_MODES_SPEC.md:477   "Round advance: All tap Next OR 30s
                             timeout" (Rush); :109 "30-second timeout
                             also triggers advance"

Three values for the results-phase auto-advance timer (90 vs 30 vs
spec's 30). NOTE: the spec's "30s timeout" is the Rush round-advance
timeout, which may or may not be the same concept as
results_auto_advance_sec — the CTO must clarify whether
results_auto_advance_sec is intended to be the Rush 30s advance timer
or a separate results-display countdown. This semantic question is
part of the decision.

CANDIDATE RESOLUTIONS:

  H2-Option-A: SPEC IS CANONICAL → fix default to 30s.
    - Change RESULTS_AUTO_ADVANCE_DEFAULT = 30 (sessionCore.ts:509).
    - Change the DB column default (migration:
      ALTER TABLE sessions ALTER COLUMN results_auto_advance_sec
      SET DEFAULT 30).
    - Wire up RESULTS_COUNTDOWN_SECONDS where the result-phase
      countdown is computed (per MP-FIX-RESULT-PHASE-001b it is already
      used at the RESULT_STARTED write site — VERIFY this; if true,
      H2-Option-A is partly already in place and only the default
      mismatch remains).
    - Tradeoff: changes live behavior (auto-advance 90s→30s). Existing
      sessions keep their stored 90; only new sessions get 30 unless a
      backfill migration is run. Absorbs L1 for RESULTS_COUNTDOWN_SECONDS.

  H2-Option-B: CODE IS CANONICAL → update spec to 90s, delete orphan.
    - Update GAME_MODES_SPEC.md:477 and :109 to say "90s timeout"
      (or clarify that 30s is the round-advance timeout and 90s is the
      separate results-auto-advance).
    - Delete RESULTS_COUNTDOWN_SECONDS (L1 deletion branch) IF it is
      truly unused (verify the RESULT_STARTED write site does not
      reference it — PROGRESS.md MP-FIX-RESULT-PHASE-001b says it
      does; if so, it is NOT orphan and the audit's L1 finding is
      WRONG for this constant).
    - Tradeoff: zero behavior change; risk of codifying an unintended
      90s default.

  H2-Option-C: SEMANTIC SPLIT — 30s = Rush round-advance timeout
    (separate mechanism), 90s = results display auto-advance (current
    code), spec clarified to document BOTH as distinct concepts.
    - Tradeoff: requires spec rewrite to disambiguate; no code change
      except possibly deleting the orphan if truly unused. Most
      conservative if the two timers are genuinely different things.

CRITICAL PRE-RULING CHECK (resolves whether L1's "RESULTS_COUNTDOWN_SECONDS
is orphan" claim is even correct):
  grep -rn "RESULTS_COUNTDOWN_SECONDS" src/ partykit/
  PROGRESS.md claims it is used at the RESULT_STARTED write site
  (MP-FIX-RESULT-PHASE-001b). If grep finds a real reference, the
  audit's L1 finding for THIS constant is incorrect and it is NOT
  orphan — the CTO ruling must account for this. (Initial grep in this
  planning session found references only in sessionCore.ts:76
  declaration + docs; the PROGRESS.md claim of usage could not be
  confirmed in the declaration-only grep — needs a targeted re-grep
  before ruling.)

STATUS: BLOCKED-PENDING-CTO-DECISION. No file touched until ruling.

=====================================================================
## GLOBAL EXECUTION ORDER (after CTO rulings)
=====================================================================

UNBLOCKED (can start immediately, in this order):
  1. C1  — MP-FIX-COMPETE-AUDIT-REVEAL-001        (getGameState.ts)
  2. H3  — MP-FIX-COMPETE-AUDIT-DIDSUBMIT-001      (getGameState.ts, after C1)
  3. C3-pre — add isGameParticipant helper         (sessionCore.ts)
  4. C3a/b/c/d — four GET route handlers           (4 files, sequential)
  5. H1a — new /api/geocode/reverse route          (new file)
  6. H1b — switch browser call to proxy            (page.tsx)
  7. M2  — fix stale comment                        (partykit/server.ts)
  8. L2  — remove logRoundEvent                     (eventStore.ts)

BLOCKED-PENDING-CTO-DECISION:
  9.  C2  — clamp seconds value (also resolves L1 for PRESSURE_CLAMP_SECONDS)
  10. H2  — auto-advance value (also resolves L1 for RESULTS_COUNTDOWN_SECONDS
            AND may invalidate L1's "orphan" claim for that constant)
  11. M1  — event naming direction (PRESSURE_APPLIED vs TIMER_CLAMPED)
  12. L1  — delete or wire-up orphan constants (depends on 9 + 10)
  13. M3  — retry hardening (may be deferred to M3-B doc-only by CTO)

=====================================================================
## CROSS-CUTTING RISK NOTES
=====================================================================
- C1 and H3 both edit src/server/getGameState.ts (different functions).
  Sequence C1 → H3 to satisfy one-file-per-task and avoid conflicts.
- C3-pre and H3 both edit src/server/sessionCore.ts (different
  functions: isGameParticipant add vs didSubmit line). Sequence
  H3 → C3-pre to avoid conflicts.
- L1's deletion branch is ONLY valid if C2/H2 rulings choose the
  "code is canonical" option. If "spec is canonical" is chosen, L1
  becomes a wire-up task absorbed into C2/H2 and the standalone
  L1 task is cancelled.
- M3 is hardening, not a bug fix; safe to defer. Marked as such.
- No item in this plan introduces a second source of truth or
  memory-only state. C1 reads the existing `events` array; C3-pre
  reads DB; H1 proxies; H3 reads existing query columns; M3 retries
  the same DB read.

REF: GUESS-HISTORY | MP-PLAN-COMPETE-AUDIT-FIX-001
