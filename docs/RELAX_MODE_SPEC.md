# COMPETE RELAX (ASYNC) — FULL MODE SPECIFICATION
**Project:** Guess-History
**Document:** RELAX_MODE_SPEC.md
**Status:** AUTHORITATIVE — sole source of truth for Relax mode
**Date:** 2026-07-29
**Author:** CTO ruling, confirmed directly by Lolo (product owner) after live prod testing exposed regressions

**Why this document exists:** Relax's *round-by-round gameplay* (fully independent per-player pacing) was correctly specified elsewhere, but the *lobby/start* phase was incorrectly modeled as shared/identical with Rush's synchronous group-start model. That was never correct for Relax and produced live regressions on prod ("waiting for others" stuck states, and — most severely — one player's submission forcing another player to the results screen). This document is the single source of truth for Relax going forward, standalone, not dependent on or cross-referencing any other spec doc for its Relax content.

**CRITICAL CONSTRAINT — NO REGRESSION TO RUSH OR PRACTICE:** Every fix derived from this document must touch Relax-specific code paths only. Rush and Practice both work correctly on prod today. Any change must be verified to leave Rush's group-sync lobby/round flow and Practice's solo flow completely untouched. If Relax shares a component, hook, or state path with Rush or Practice, the fix must branch on mode — never modify the shared path's default/Rush/Practice behavior. This is a hard gate on every task derived from this spec, not a general reminder.

---

## 1. Core Principle

Relax is asynchronous **from the moment a player is invited through to the moment they finish their 5th round.** There is no phase of Relax — not lobby, not gameplay — where one player's state, readiness, or actions gate another player's ability to proceed. Every player moves through the entire experience at their own pace, independently, full stop.

Rush is a synchronous, shared-clock, play-together mode. Relax is not a slower version of Rush — it is a structurally different mode that happens to share round mechanics (scoring, hints, event pool) and a session record. Do not port Rush's group-coordination concepts (group ready-gate, group start, "waiting for others", shared round-advance) into Relax under any circumstance.

---

## 2. Roster & Invites

### 2.1 Invite-time visibility (CONFIRMED WORKING — not in scope right now)

- A player appears on the roster **the instant they are invited** — not when they click a link, not when they open the app, not when they "confirm." This behavior is already correctly implemented and working.
- Known issue, deferred: there is currently a lag before the invited player's row appears. This is a real bug but is explicitly OUT OF SCOPE for now — do not include it in any fix task derived from this document. It will be addressed separately, later.
- Roster row states, in order of progression (for reference, unaffected by the deferred lag issue):
  1. **Invited** — shown immediately upon invite being sent. Distinct visual state (e.g. pending/greyed/pill marker).
  2. **Joined** — shown once the invited player actually opens/enters the session. Same row updates in place; it does not disappear and reappear as a new row.
  3. **Ready** — shown once that player marks themselves ready (see §3).
  4. **Playing** — shown once that player has started their own round sequence.
  5. **Finished** — shown once that player has completed all 5 rounds.
- The roster is visible to all invited/joined players at all times, including during gameplay (see §5 leaderboard visibility, which is a superset of this).
- Invite paths (code, link, friends-list direct invite, and any others already implemented) are unaffected by this spec — invite mechanics themselves are out of scope for this document. Only the resulting roster-visibility behavior is specified here.

### 2.2 What the roster is NOT

- The roster is a **social/status view only.** It is never a gate. Its contents (who's invited, joined, ready, playing, finished) must have zero effect on whether any individual player can proceed through their own session.

---

## 3. Lobby & Start — Individual, Not Group (CORRECTED — this was the second and third regressions)

### 3.1 No group ready-gate

- There is **no concept of "all players ready" in Relax.** Rush's rule ("Start Game enabled only when all players are marked ready") does **not** apply to Relax. Discard it entirely for this mode.
- Each player readies up **for themselves only.** Their ready state is informational to others via the roster (§2) but does not unlock or block anything for anyone else.

### 3.2 No group start

- There is no host-triggered "Start Game" moment that begins the session for everyone in Relax.
- Each player individually triggers the start of their own round sequence, whenever they personally are ready, regardless of what any other invited/joined player has done.
- The host still configures session-level settings (round timer on/off + duration, session deadline, year range — see §4) before any player starts, since these are shared session parameters written once. But configuring settings is not the same as "starting the game" for everyone — once settings are set, each player starts independently.
- Corollary: it is entirely normal and expected for one player to be on round 4 while another has not yet joined, and for a third to have finished all 5 rounds. This is not an edge case — it is the mode's normal operating condition at any moment in a session's lifetime.

### 3.3 "Waiting for others" is banned in Relax, full stop

- This string/state/UI condition must **never** appear anywhere in the Relax experience — not in the lobby, not in gameplay, not on the results screen, not anywhere.
- If any Relax code path can produce a "waiting for others" condition, that is a bug by definition, regardless of the circumstance that triggers it.

---

## 4. Session Configuration (unchanged from GAME_MODES_SPEC.md §5.3 — reconfirmed, not in dispute)

Set once by the host before players individually start. Other players cannot modify.

| Parameter | Relax value |
|---|---|
| Rounds | Always 5. No host selector. |
| Round Timer | Optional toggle, host may leave OFF (default). If ON: slider 10s–5min. |
| Session Deadline | Slider: 1–14 days. Default 3 days. |
| Year Range | Preset ranges or custom, host-set. |
| Player limit | 2–8. |

- **Round Timer (if enabled):** bounds only that individual player's own GUESS_PHASE. Auto-submits only that player on expiry. Zero effect on any other player. Pressure clamp (Rush's 30s first-submission clamp) does **not** apply to Relax under any condition.
- **Session Deadline:** anchored per the session's actual start point (not a single group "start game" event, since there isn't one — see §7 for the open question this raises). Governs the outer bound of each player's own window to complete their 5 rounds.
- **Event pool / deduplication:** unchanged — last 500 events excluded, referenced against the host. Not in dispute.

---

## 5. Gameplay — Per-Player Independence (unchanged from prior spec, reconfirmed correct)

- Each player plays all 5 rounds **fully independently**, at their own pace, from their own start point.
- **A player's submission, round-advance, or round-completion must have zero observable effect on any other player's screen, phase, or state — ever, under any circumstance.** This is the rule that broke on prod (host submitting round 1 forced Player B to results) and it must hold with no exceptions.
- On submission: that player's own RESULT_PHASE (§1.2 of GAME_MODES_SPEC.md — visual layout unchanged) is shown to them immediately, and to them alone.
- After viewing their result, the player taps "Next Round" manually. No auto-advance under any circumstance in Relax — not on a timer, not because another player did something, not ever.
- **Notifications:** in-app + push sent to *other* session players only when a player completes their **final (5th)** round. Per-round submissions never notify anyone.
- **Leaderboards** (round-level and final): always visible to all roster members at all times. Every player's row is always shown:
  - No score yet reached/submitted that round → shown as pending.
  - Submitted → shown with score.
  - Never gated on group/round completion by anyone else.
- **Deadline handling:** if the session deadline passes while a given player still has unsubmitted rounds, that player's remaining rounds score zero. This affects only that player — every other player continues completely unaffected, independently, on their own remaining rounds/timeline.

---

## 6. Session Deadline Anchor (RESOLVED — Option A)

Deadline is anchored **globally, at session creation, the moment the first player starts the game.** `session_deadline = firstPlayerStartedAt + X days`, and this single deadline applies identically to every player in the session regardless of when they personally join or start. A late joiner does not get a fresh individual window — they inherit whatever time remains on the global clock.

This is a ruling, not an open question. Build against this.

---

## 7. What Must Never Happen in Relax (consolidated ban list)

- Any "waiting for others" state, anywhere, at any phase (§3.3).
- A group ready-gate blocking an individual player who is ready (§3.1).
- A group "Start" event required before an individual can begin (§3.2).
- One player's submission, advance, or completion causing another player's screen/phase to change (§5).
- Auto-advance of any kind, for any reason (§5).
- Applying Rush's pressure clamp (30s first-submission clamp) (§4).
- Gating the leaderboard display on other players' completion (§5).
- **Any regression to Rush or Practice mode, however introduced** (see the constraint at the top of this document). This includes accidental side effects from touching shared components, shared hooks, shared state paths, or shared DB read/write logic.

---

## 8. Status of Investigation Into the Prod Regressions

Not yet done — noted here so it isn't lost. Before any fix is built, the actual root cause needs to be established against the real code, not assumed from this spec alone:

- Whether the round-submission cross-player leak (host submitting round 1 forcing Player B to results) is a reintroduction of the issue closed by MP-BUILD-RELAX-BROADCAST-LEAK-002, or a new/different code path.
- Whether the lobby ready/start UI is shared component code with Rush (likely, given the symptom) and needs to branch on mode, or was always Relax-specific and just built wrong.
- For every file/component/hook touched by any eventual fix: whether it is also used by Rush and/or Practice, and if so, exactly how the fix avoids changing their behavior.

This document defines what "correct" means for Relax. It does not itself diagnose why prod currently does something else, and it does not authorize touching any file without first confirming that file's blast radius against Rush and Practice.
