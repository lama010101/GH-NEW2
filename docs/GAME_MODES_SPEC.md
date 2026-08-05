# GAME MODES SPECIFICATION
**Project:** Guess-History  
**Document:** GAME_MODES_SPEC.md  
**Version:** 1.5  
**Status:** AUTHORITATIVE  
**Date:** 2026-07-21

**Changes from v1.4:**
- Compete Relax (async) round-completion model changed from **batch/Option B** to **fully independent per-player pacing/Option A**: each player plays all 5 rounds at their own speed, never waiting on any other player.
- Compete Relax rounds are now **locked to always 5**, with no host rounds selector.
- Compete Relax gains an **optional host-enabled per-round timer** that auto-submits only the expiring player (no other effect on the session).
- §1.6, §5.2, §5.3, §5.8, §6 updated accordingly. No other behavioral changes.

**Changes from v1.3:**
- Compete Relax (async) gains an **optional Round Timer** (host-configurable in lobby, reuses Rush slider 10s–5min, default 2min / OFF). Bounds each player's GUESS_PHASE independently while the session deadline still bounds the whole session.
- Compete Relax session deadline range extended from 1–7 days to **1–14 days** (default 3 days).
- §5.2, §5.3, §5.8, §6 updated accordingly. No other behavioral changes.

**Changes from v1.2:**
- Compete sub-modes renamed: Blitz → **Rush** (sync), Daily/Async → **Relax** (async)
- Round result screen documented from confirmed legacy UI (reused across all modes)
- Level Up accuracy ring threshold: defined as a speedometer-style notch, not a separate component
- No other behavioral changes

---

## 0. Document Authority

This document is the single source of truth for the behavioral, structural, and UX specification of all four game modes: **Practice**, **Daily**, **Level Up**, and **Compete**.

Binding references:
- `docs/GUESS_HISTORY_MASTER_SPEC.md` — architecture, scoring, phase FSM
- `docs/CORE_UI_AND_FEATURES.md` — round gameplay UI
- `docs/BADGE_SYSTEM.md` — badge evaluation
- `docs/STATS_SYSTEM.md` — stat persistence
- `docs/DATABASE_SCHEMA_STATE.md` — canonical table definitions
- `docs/HOME_PAGE_SPEC.md` — mode entry points

Any conflict between this document and those references: stop and report. Do not resolve silently.

---

## 1. Universal Round Structure

All four modes share the same per-round gameplay loop. Differences between modes are in session configuration, progression rules, and multiplayer mechanics — not in how a round is played.

### 1.1 Per-Round Phases

Every round in every mode passes through these phases in strict order:

```
IMAGE_PHASE → GUESS_PHASE → RESULT_PHASE
```

**IMAGE_PHASE:** Fullscreen cinematic display of the historical photo. Auto-pans left to right over 5 seconds. Player can interrupt at any time to proceed to GUESS_PHASE. No game state changes during this phase.

**GUESS_PHASE:** Player places a pin on the world map and selects a year using the slider. Both inputs are required before Submit is enabled. Timer (if configured) counts down. Player may purchase hints at accuracy cost. Submitting or timer expiry ends this phase.

**RESULT_PHASE:** Documented in Section 1.2.

### 1.2 Round Result Screen (RESULT_PHASE)

The round result screen is **identical across all modes** and **reuses the confirmed legacy UI**. The layout is a vertically scrollable screen with the following elements in order:

**Top bar:**
- "Round X / 5" label with a segmented progress indicator (completed rounds filled orange, current round partially filled, remaining rounds dim)
- "Next Round" button (orange, top right) — enabled only after all result cards have loaded. Tapping advances to the next round.

**1. Accuracy card:**
- Label: "ACCURACY" (small caps, muted)
- Circular ring progress indicator — orange fill from 0 to the player's final accuracy %, animated on load
- Accuracy value shown as an integer inside the ring (e.g. "28")
- Ring background: dark unfilled arc

**Level Up only — threshold notch:**
In Level Up mode, a single notch (tick mark) is drawn on the accuracy ring at the position corresponding to the level's minimum pass threshold. This functions like a speedometer redline. If the orange fill reaches or passes the notch, the player has passed this round's contribution to the threshold. The notch is white or light grey, clearly visible against both the filled and unfilled arc. No other UI element is added to this card for Level Up.

**2. XP card:**
- Label: "EXPERIENCE" (small caps, muted)
- XP value displayed as a large number followed by "XP" in orange (e.g. "57 XP")
- If hints were used: a secondary line shows the raw XP, the deduction, and the final XP (e.g. "Raw: 120 XP − 40 XP hints = 80 XP")

**3. Event photo:**
- Full-width image of the historical event
- Expand-to-fullscreen icon (bottom right corner of image)

**4. Event information panel (below photo):**
- Event title in bold (e.g. "Luxembourg Shines at Eurovision 1969")
- 2–4 sentences of event description (historical context)
- Bottom row: "Confidence: X%" | "Source" (tappable — opens embedded web view) | "Rate" (tappable — opens 1–10 rating modal)

**5. WHERE card:**
- "Where" label in orange with a location pin icon
- Accuracy percentage in a dark pill (e.g. "0 %")
- Distance pill (e.g. "6292 km away")
- "Correct: [City, Country]" in orange
- Leaflet map showing:
  - Player's guess marker (avatar/photo pin with glow, orange halo)
  - Correct location marker (solid green dot)
  - Dashed line connecting the two
  - Small cyan dot at the correct location base
  - Auto-fit camera with 20% padding around both markers
  - +/− zoom controls
  - Expand-to-fullscreen icon (bottom right)

**6. WHEN card:**
- "When" label in orange with a calendar icon
- Accuracy percentage in a dark pill (e.g. "57 %")
- Years-off pill (e.g. "19 years off")
- "Correct: [year]" in orange
- "Your guess: [year]" in white

**7. Badge row (all modes):**
Shown at the bottom of the result screen after the WHEN card.
- 0 to 3 badge indicators displayed horizontally
- Each badge shows dimension (WHERE / WHEN / COMBO), tier (Gold / Silver / Bronze), and accuracy value
- Near-miss indicators shown for dimensions where accuracy was 88–89% and no badge was earned
- See `BADGE_SYSTEM.md` for full evaluation rules

**Navigation:** The "Next Round" button in the top bar is the only way to advance. No auto-advance in solo modes. In Compete Rush, the Rush round-advance timeout (30s) also triggers advance (see Section 5.7). This is distinct from the results-screen auto-advance timeout (host-configurable `resultsAutoAdvanceSec`, default 90s).

### 1.3 Scoring

Computed server-side only. Never recomputed on client.

```
Location score:  0–100 XP  (exponential haversine distance decay)
Year score:      0–100 XP  (exponential year-diff decay, era-scaled)
Hint penalty:    proportional rate per axis (age-discounted for WHEN)
Round total:     0–200 XP after penalty
Round accuracy:  0–100% after penalty
```

Final values written to `round_commits.score` and `round_results.score`. Fully
recomputable from DB (including `sessions.scoring_reference_year`).

### 1.4 Hint System

The hint system is a **strategic tool**. Using hints is a deliberate tradeoff: gain information, sacrifice accuracy. A player who uses hints well can still outscore one who guesses blindly. Overusing expensive hints will be penalised. This tension is intentional.

#### 1.4.1 Structure

12 hints per event, organised in a dependency tree. Some hints require a prerequisite before they are available.

Example: "Remote Landmark" (prerequisite) → "Distance to Remote Landmark" (dependent)

#### 1.4.2 Hint Tiers and Penalties

Assigned at content creation time. Fixed permanently per hint.

Penalties are RATES (0–100 = 0%–100%), applied PROPORTIONALLY to raw accuracy
(not flat point subtraction). This is fair to both strong and weak players and
guarantees a hint can never make you worse than 0.

| Tier | Rate (per-axis) | Typical hint type |
|---|---|---|
| 1 | 10% | Vague — era, broad continent |
| 2 | 20% | Moderate — decade, region |
| 3 | 30% | Strong — country, approximate year |
| 4 | 40% | Near-definitive — city, specific era |
| 5 | 50% | Definitive — exact location or year |

Rates are additive per axis (WHEN / WHERE independently), capped at 100.

XP impact: since `roundXp = yearAccuracyFinal + locationAccuracyFinal`, a tier-N
WHEN hint reduces yearAccuracyFinal by ~(N*10)% of raw year accuracy, which
reduces roundXp by the same amount. The XP penalty is NOT doubled — it affects
only the axis the hint belongs to.

#### 1.4.3 Penalty Application (Proportional + Age-Discounted)

Hints purchased during GUESS_PHASE. Penalty applied at round end. The XP card
in RESULT_PHASE shows raw XP, hint deduction, and final XP as separate line
items when hints were used.

WHEN (year) penalties are age-discounted by eraScale: older events are harder
to guess the year for, so the same hint costs less. WHERE (location) penalties
are NOT age-discounted (location difficulty does not track event age).

```
eraScale        = sqrt(max(50, referenceYear − eventYear) / 50)
whenRate        = clamp(penaltyWhenRate / eraScale, 0, 100) / 100   // age-discounted
whereRate       = penaltyWhereRate / 100                            // no age discount
yearAccFinal    = floor(yearAccuracy     × (1 − whenRate))
locAccFinal     = floor(locationAccuracy × (1 − whereRate))
final_accuracy  = round((yearAccFinal + locAccFinal) / 2)
final_xp        = yearAccFinal + locAccFinal
```

`referenceYear` is frozen at session creation (`sessions.scoring_reference_year`)
to guarantee recomputability from DB. See `docs/backend/scoring_spec.md`.

#### 1.4.4 Hints in All Modes

Available in all four modes. In Daily and Compete, hints are individual — one player's choices do not affect others. In Level Up, hint penalties count against the pass threshold. Intentional.

### 1.5 Badge and Achievement System

Evaluated server-side at the end of every RESULT_PHASE in every mode. Never persisted as standalone records. Counts aggregated into stats at game end. See `BADGE_SYSTEM.md` for full rules.

**Three dimensions per round:**
| Dimension | Based on |
|---|---|
| WHEN | Year accuracy |
| WHERE | Location accuracy |
| COMBO | `min(year_accuracy, location_accuracy)` |

**Tiers:**
| Tier | Accuracy Required |
|---|---|
| Gold | 100% |
| Silver | 95–99% |
| Bronze | 90–94% |

**Near-miss:** Accuracy 88–89% with no badge → near-miss indicator shown on that dimension. Not a badge.

**Display:** Badge row shown at the bottom of RESULT_PHASE. Order: WHERE, WHEN, COMBO. Dominant badge (highest tier; COMBO wins ties) visually emphasised. Dominant badge is UI-only — not part of server output.

### 1.6 Round Advance Rules

**Solo modes (Practice, Daily, Level Up):**
- Player submits → RESULT_PHASE → player taps "Next Round" → next round begins
- No auto-advance. Manual only.
- Timer expiry → auto-submit → RESULT_PHASE → player taps "Next Round"

**Compete Rush (sync):**
- Round ends when all players have submitted OR timer expires
- RESULT_PHASE shown to all players simultaneously
- Round advances when ALL players have tapped "Next Round" OR the results-screen auto-advance timeout expires (host-configurable `resultsAutoAdvanceSec`, default 90s) — whichever comes first
- When a player submits, in-app broadcast sent to all connected players: "Player X has submitted" (score not revealed)

**Compete Relax (async):**
- Session deadline governs overall expiry (1–14 days, host-configurable; anchored when the first player starts their own round sequence — see §5.3). Host may additionally enable an optional per-round timer (see §5.3); if enabled, timer expiry auto-submits for that player only per §1.7 — it has no effect on any other player.
- Each player plays all 5 rounds fully independently, at their own pace. A player never waits on any other player, at any round.
- On submission: submitting player's RESULT_PHASE shown immediately, for that player only.
- In-app broadcast + push notification sent to all other session players ONLY when a player completes their final (5th) round. Per-round submissions by other players do NOT trigger a notification.
- After viewing result, player taps "Next Round" manually — no auto-advance, ever, in Relax.
- Scores and ranks are HIDDEN during an in-progress round — Relax shows NO visible in-round partial leaderboard. Per-round and final rankings are revealed only at round-complete and session-complete.
- The final leaderboard (and any per-round ranking) ranks players by accuracy% only, never by XP/total score. Total score may be used solely as a deterministic tiebreaker when two players have exactly equal accuracy%.
- Players may leave and resume at any time via Home → Challenges → "YOUR TURN" tab (in-progress) or "COMPLETED" tab (once they've finished all 5 rounds).
- If the session deadline passes with unsubmitted rounds for a given player, those rounds score zero for that player only — it has no effect on other players' progress.

### 1.7 Shared UI Rules

- No default year on the slider. Player must actively select.
- Map starts centered at lat 20, lng 0, world zoom.
- Single marker only. Click/tap places, re-click/tap moves. Not draggable.
- Submit button disabled until both marker placed and year selected.
- All inputs locked during transitions and result evaluation.
- Image is never cropped. Fit-to-contain always.
- Timer expiry auto-submits with whatever is placed. Unplaced inputs score zero.

---

## 2. Mode: Practice

### 2.1 Purpose

Low-stakes solo play. No progression gates, no leaderboard, no competitive pressure. Entry mode for new players, warm-up mode for experienced ones.

### 2.2 Configuration

Set on the home page. Persisted to localStorage, restored on next visit.

| Parameter | Options | Default |
|---|---|---|
| Round Timer | Off, or slider: 10s to 5min | Off |
| Year Range | Any start/end within −100 to current year | Full range |

Rounds always 5. Timer slider is non-linear: 10s, 15s, 20s, 30s, 45s, 60s, 90s, 2min, 3min, 5min. Selected value shown as formatted label (e.g. "1:30").

### 2.3 Session Initialization

1. Player taps "Start Practice".
2. **Preflight check:** verifies Supabase REST and image delivery. Blocks start on failure.
3. Server fetches 5 random events matching configured year range, excluding last 500 events played by this player. Server-generated seed stored in `sessions`.
4. Round 1 image preloaded before navigation.
5. `sessions` row created with `mode = 'practice'`.
6. Player navigated to `/practice/game/room/{roomId}/round/1`.

### 2.4 Gameplay Flow

```
Home → Preflight → Load events
     → Round 1 → Result → Round 2 → Result → Round 3 → Result
     → Round 4 → Result → Round 5 → Result → Final Screen
```

Session recoverable from localStorage on refresh. Abandoned if localStorage cleared.

### 2.5 Final Screen

**Header:** Total XP (max 1000), average accuracy %, WHERE aggregate, WHEN aggregate.

**Round breakdown:** One card per round — photo thumbnail, event description, guessed vs correct year + location, distance km, accuracy %, XP, badges earned.

**Actions:** Play Again (same settings, new events), Home.

**Stat update:** Stats and badge aggregates written once at game end.

### 2.6 Rules and Constraints

- No minimum accuracy requirement.
- 500-event deduplication window enforced server-side.
- Direct API calls. No PartyKit, no WebSocket.

---

## 3. Mode: Daily

### 3.1 Purpose

A single shared challenge, identical for all players worldwide, refreshing every 24 hours at midnight UTC. Daily habit loop, organic social comparison, primary driver of daily active usage.

### 3.2 Configuration

No player configuration. All parameters fixed server-side.

| Parameter | Value |
|---|---|
| Rounds | 5 |
| Timer | 90 seconds per round (mandatory) |
| Year range | Full range (−100 to current year) |
| Events | Same 5 events for all players worldwide |
| Hints | Available — standard tiered penalty applies |
| Seed | `hash(ISO_date_UTC)` e.g. `hash("2026-04-28")` |

Daily seed computed once at midnight UTC. Permanent for that date.

### 3.3 One Attempt Per Day

Exactly one attempt per player per day. Session locked complete after round 5. All subsequent visits show the result view. No replay. Abandoned sessions resume from where they left off — no fresh attempt.

### 3.4 Session Initialization

1. Player taps "Play Today's Challenge".
2. Server checks for completed `daily_sessions` record for today + this player.
   - Found → navigate to daily result view (read-only).
   - Not found → proceed.
3. Server loads today's 5 events from the midnight-generated daily seed cache.
4. `sessions` row created with `mode = 'daily'` and today's seed.
5. Player navigated to `/daily/game/{sessionId}/round/1`.

### 3.5 Daily Final Screen

Same as Practice final screen, with additions:

**Global comparison panel:**
- Player's rank among today's completions (e.g. "142nd out of 1,847 players")
- Global average accuracy for today
- Score distribution histogram

**Streak indicator:** Consecutive days completed. Breaks only if the player never opens the challenge before midnight UTC. Starting and failing preserves the streak.

**Social sharing:** One-tap spoiler-free share card — per-round accuracy as colored blocks, Wordle-style. No event names, years, or locations in the share output.

### 3.6 Rules and Constraints

- Timer mandatory, fixed at 90s.
- Hints allowed, standard tiered penalty.
- Auto-submit on timer expiry.
- Direct API calls, not the multiplayer stack.
- Stats and streak updated at game end.

---

## 4. Mode: Level Up

### 4.1 Purpose

The mastery and long-term retention system for solo players. 100 levels of increasing difficulty, genuine forward progress, and a design principle that continued play makes the player more knowledgeable about history — not just better at a game mechanic.

### 4.2 Progression Model

100 levels. Each level is one game of 5 rounds. Advancing requires meeting the minimum accuracy threshold. Falling short keeps the player at the same level. **No level degradation under any circumstance.** Unlimited attempts per level. Each attempt uses a fresh seed and fresh events.

### 4.3 Replaying Passed Levels

A player may replay any previously passed level at any time, from the "Level History" view on their profile.

- Replay uses the same difficulty parameters as the original level
- Replay results contribute to stats and XP as normal games
- Replay cannot demote the player — their highest passed level is always preserved
- Purpose: practice, score improvement, revisiting historical eras

### 4.4 Difficulty Parameters

All parameters computed server-side from the level number. Never hardcoded.

| Parameter | Formula | Level 1 | Level 50 | Level 99 | Level 100 |
|---|---|---|---|---|---|
| Year range width | `200 + (level × 18)` yrs, ending at current year | 218 yrs (1807–2025) | 1100 yrs (925–2025) | 1982 yrs | 2000 yrs (25–2025) |
| Timer (seconds) | `300 − (level × 2)`, floor 15s | 298s ≈ 5:00 | 200s ≈ 3:20 | 102s ≈ 1:42 | **15s (hardcoded)** |
| Min accuracy to pass | `50 + (level × 0.3)`%, ceiling 80% for L1–99 | 50.3% | 65% | 79.7% | **95% (hardcoded)** |
| Rounds | Always 5 | 5 | 5 | 5 | 5 |

**Level 100 explicit overrides (not formula-derived):**
- Timer: 15 seconds fixed
- Pass threshold: 95% fixed
- This is the hardest configuration in the game. Expert GeoGuessr players operate at 5-second timers; 15 seconds at a 2000-year range is a genuine elite challenge.

**Event pool guarantee:** Every year range produced by the formula must contain a minimum of 100 distinct events in the database. Content requirement — not a code requirement.

**Deduplication:** None applied in Level Up. Pool is narrow at high levels. Each attempt draws freely from the available pool for that level's year range.

### 4.5 Level Up RESULT_PHASE — Threshold Notch

The round result screen is identical to all other modes (see Section 1.2) with one modification to the Accuracy card:

**Threshold notch on the accuracy ring:**
- A single tick mark is drawn on the circular accuracy ring at the angular position corresponding to the level's minimum pass threshold
- Appearance: speedometer-style — a short radial line or notch in white/light grey, clearly visible against both filled and unfilled arc
- If the orange fill arc reaches or passes the notch: the notch turns green (pass state for this round)
- If below: notch remains white/grey (not yet passing)
- The notch is static per level — it does not move between rounds
- No other modification to the result screen for Level Up

This gives the player an immediate visual signal on every round whether their accuracy is on track to pass the level, without requiring them to do mental arithmetic against the threshold.

### 4.6 Level Outcome Panel (After Round 5)

Appended to the standard final screen after the round breakdown section.

**Pass (accuracy ≥ threshold):**
- Pass indicator with accuracy vs threshold (e.g. "71% — threshold 65% ✓")
- Next level parameters: year range, timer, pass threshold
- CTA: "Start Level X+1"
- Secondary: "Replay Level X" (for score improvement)
- Tertiary: "Home"

**Fail (accuracy < threshold):**
- Fail indicator with accuracy vs threshold (e.g. "58% — threshold 65%")
- Best accuracy on this level to date
- Contextual note:
  - < 5% gap: "You were X points short."
  - 5–15% gap: "Your best on this level is improving."
  - > 15% gap: "Try reading the image for era and geography clues before placing your pin."
- CTA: "Try Level X Again"
- Secondary: "Home"

**Milestone levels (10, 25, 50, 75, 100):** A brief milestone recap screen shown before the pass/fail panel. Not a gate.

**Level 100 pass:**
- Distinct screen from all other pass screens
- Journey summary: levels completed, total XP across all Level Up sessions
- Prestige option: reset to Level 1, keep all stats and XP, prestige marker on profile
- CTAs: "Begin Prestige Run" or "Stay at Level 100"

### 4.7 Badge System in Level Up

Badges awarded per round exactly as in all other modes (see Section 1.5). No Level Up-specific modifications to badge rules.

### 4.8 History Collection

Every event encountered in any mode is recorded in the player's History Collection (profile-accessible). Written at round end — not game end — so abandoned sessions do not forfeit events already seen.

The collection shows:
- Total events encountered
- Breakdown by era (Ancient pre-500, Medieval 500–1400, Early Modern 1400–1800, Modern 1800–1950, Contemporary 1950–present)
- Breakdown by region
- Player ratings (1–10 per event, entered via the Rate button on the result screen)

No effect on scoring or progression. A tangible record of accumulated historical knowledge.

### 4.9 Session Initialization

1. Player taps "Start Level X" (or "Replay Level X").
2. Server computes level parameters from formula (Level 100 uses hardcoded overrides).
3. Server generates a new seed for this attempt.
4. Preflight check runs.
5. Server fetches 5 events from the level's year range pool. No deduplication window.
6. `sessions` row created with `mode = 'levelup'`, level number, attempt seed, `is_replay` flag.
7. Player navigated to `/levelup/game/{sessionId}/round/1`.

### 4.10 Gameplay Flow

```
Home → Preflight → Load events
     → Round 1 → Result (standard screen + threshold notch)
     → Round 2 → Result → Round 3 → Result → Round 4 → Result → Round 5 → Result
     → Final Screen → Level Outcome panel
```

### 4.11 Rules and Constraints

- Pass threshold = average accuracy across all 5 rounds after hint penalties.
- Hints allowed. Penalty counts against the pass threshold.
- Cannot skip levels. Level N+1 locked until Level N passed.
- Future level parameters viewable (read-only) via "Preview levels" on home page.
- No level degradation. Replays cannot demote a player.
- Level Up uses direct API calls, not the multiplayer stack.
- Stats updated at game end. History Collection updated at round end.

---

## 5. Mode: Compete

### 5.1 Purpose

Real-time multiplayer. 2 to 8 players in a shared session, guessing the same events, with live pressure mechanics and a shared leaderboard. The social and competitive core of the game.

### 5.2 Session Sub-Modes

| | Rush | Relax |
|---|---|---|
| **Timing** | Synchronous — all players live simultaneously | Asynchronous — players submit independently |
| **Round timer** | Yes, per-round countdown (10s–5min) | Optional (host-enabled), auto-submits that player only on expiry |
| **Pressure mechanic** | First-submission clamp to 30s | None |
| **Session deadline** | None | 1–14 days |
| **Round advance** | All tap Next OR Rush round-advance timeout (30s) | Each player independently |
| **Submission notify** | In-app broadcast | In-app + push, ONLY on a player's full-session completion (not per-round) |

### 5.3 Configuration

Set by the host in the lobby. Other players cannot modify settings.

| Parameter | Rush options | Relax options | Default |
|---|---|---|---|
| Rounds | 3, 5, or 10 | Always 5, no selector | 5 |
| Round Timer | Slider: 10s to 5min | Optional toggle + slider: 10s to 5min (host may leave off) | 2min (Rush) / OFF (Relax) |
| Session Deadline | N/A | Slider: 1–14 days | 3 days |
| Year Range | Preset ranges or custom | Same | Full range |
| Player limit | 2–8 | 2–8 | 8 |

**Rush timer slider:** Non-linear scale — 10s, 15s, 20s, 30s, 45s, 60s, 90s, 2min, 3min, 5min.

**Relax Round Timer:** Optional per-player countdown. Host may toggle it OFF (default). When enabled, each player's GUESS_PHASE is independently bounded by the per-round countdown; the session deadline still bounds the whole session. Timer expiry auto-submits that player's current inputs (per §1.6 / §7 shared rules) and has zero effect on any other player. Pressure clamp (first-submission → 30s) does NOT apply in Relax — it is Rush-only (see §5.2).

**Relax deadline slider:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 days. Displayed as "X days". The duration is anchored at the moment the first player starts their own round sequence: `session_deadline = firstPlayerStartedAt + X days`. This single global deadline applies identically to every player in the session regardless of when they personally join or start. A late joiner does not get a fresh individual window — they inherit whatever time remains on the global clock.

### 5.4 Event Deduplication

Events deduplicated using the **host** as reference. Server excludes the last 500 events seen by the host. Other players' histories are not consulted — intersecting multiple exclusion sets would risk exhausting the pool in groups of experienced players.

**Fallback:** If the filtered pool has fewer than 5 events for the configured year range, deduplication is relaxed in order of recency — most recently seen events re-included first until 5 events are available.

### 5.5 Lobby Flow

Compete Rush and Compete Relax share the room creation and invite mechanics, but the start gate is completely different.

#### 5.5.1 Rush Lobby Flow

```
Host creates room → Room code generated → Players join by code or link
→ All players in lobby roster → Each player toggles Ready
→ All Ready: host clicks Start (or auto-start if configured)
→ Game begins for everyone at the same time
```

- Start is **group-gated**: the game cannot begin until every player in the roster has toggled Ready.
- The host click (or auto-start) emits a single `START_GAME` / `ROUND_STARTED` event that begins round 1 for all players simultaneously.
- `session_deadline` is not used in Rush.

#### 5.5.2 Relax Lobby Flow

```
Host creates room → Room code generated → Players join by code or link
→ All players appear in the lobby roster
→ Host sets session parameters (round timer on/off, session deadline, year range)
→ Each player, including the host, starts their own 5-round timeline whenever they personally are ready
```

- **There is no group ready-gate and no host "Start Game" moment.** Each player readies up and starts independently. A player's ready state is visible in the roster but does not unlock or block anything for anyone else.
- The host still configures session-level settings before players start, because those parameters are shared once and apply to everyone (round timer, deadline, year range). Configuring settings is not "starting the game" for everyone.
- It is normal and expected for one player to be on round 4 while another has not joined and a third has finished all 5 rounds. This is not an edge case — it is the mode's normal operating condition at any moment.
- **"Waiting for others" must never appear in the Relax lobby or at any later phase.**

**Host controls (both sub-modes):** Sub-mode, all parameters, kick a player. Auto-start is a Rush-only option.

**Room code:** 6-character alphanumeric uppercase (e.g. `HWGONB`). One-tap copy. Shareable as full URL.

**Host migration:** Host disconnects before their own round sequence starts → role passes to the next joined player by `session_players.joined_at`. During their own game the host has no authority over other players' timelines.

### 5.6 Real-Time Architecture

```
Client intent → PartyKit Durable Object → API route → sessionCore (DB write)
             → broadcast STATE_UPDATE to all clients via WebSocket
```

PartyKit DO is the runtime coordinator. PostgreSQL is the source of truth. Client is a stateless renderer. Full architecture in `GUESS_HISTORY_MASTER_SPEC.md` Section 3.

### 5.7 Rush Round Flow

```
LOBBY → STARTING → QUESTION → ANSWER → LOCKED → RESULT → SCOREBOARD
      → NEXT_ROUND (loop) or END
```

**QUESTION:** Cinematic image, 5 seconds. Timer not yet started.

**ANSWER:** Per-round timer starts. Server-authoritative `phaseEndsAt` broadcast. No client timer authority. First-submission clamp: if the first player submits with >30s remaining, time is clamped to 30s and broadcast as `TIMER_CLAMPED` (WS message), persisted as `PRESSURE_APPLIED` in `round_events`. Fires once per round. In-app broadcast sent when any player submits: "Player X has submitted."

**LOCKED:** No further submissions. Timer reached 0 or all submitted.

**RESULT:** Each player sees their own result screen (Section 1.2). Partial leaderboard shown. Results-screen auto-advance timeout (host-configurable `resultsAutoAdvanceSec`, default 90s) or all tap "Next Round" — whichever first. This is a SEPARATE mechanism from the Rush round-advance timeout (30s, Section 5.7) — do not conflate the two.

**SCOREBOARD:** Full round leaderboard. 15-second timeout or all tap "Next".

### 5.8 Relax Round Flow

- Session deadline governs overall expiry (1–14 days, anchored when the first player starts their own round sequence — see §5.3). Host may optionally enable a per-round timer (§5.3); if set, it auto-submits for that player only on expiry and has zero effect on any other player.
- Each player plays all 5 rounds fully independently, at their own pace, from their own start point.
- A player's submission, round-advance, or round-completion must have zero observable effect on any other player's screen, phase, or state.
- On submission: that player's own RESULT_PHASE (§1.2) is shown to them immediately, and to them alone.
- After viewing their result, the player taps "Next Round" manually. No auto-advance under any circumstance in Relax — not on a timer, not because another player did something, not ever.
- Round and final leaderboards are always visible to all session players and always show every player's row:
  - No score yet reached/submitted that round: shown as pending.
  - Submitted: shown with score.
  - Never gated on group/round completion by anyone else.
- In-app + push notification sent to all other session players only when a player completes their final (5th) round. Per-round submissions by other players do NOT trigger a notification.
- Deadline passed with unsubmitted rounds for a given player: that player's remaining rounds score zero. This affects only that player — every other player continues completely unaffected, independently, on their own remaining rounds/timeline.

### 5.8.1 Relax Per-Round Ranking

In Relax, `round_results.rank` for a round is computed **only among players who have completed that round** (submitted, marked absent, or finalized by deadline). The highest `score` for the round receives `rank = 1`; remaining completed players receive `rank = 2, 3, ...` ordered by descending score. Ties are broken by `player_id` ascending to keep ranking deterministic.

Ranking is **retroactive**: every time a new player completes the round, all existing `round_results` rows for that `(game_id, round_index)` are recomputed and updated. A player who previously held `rank = 1` can therefore be displaced by a later, better-scoring submission. Round and final leaderboards always reflect the current ranks.

This per-round ranking rule is **Relax-only**. Rush computes rank once per round after all active players have submitted or the timer expires. Practice, Daily, and Level Up have no per-round ranking.

### 5.9 Badge System in Compete

Badges awarded per round per player, server-side. Each player sees their own badges on their own result screen only — not on the shared leaderboard. Badge aggregates written to each player's stats individually at game end.

### 5.10 End Screen

**Final leaderboard:** All players ranked by accuracy% only. Total score is used solely as a deterministic tiebreaker when two or more players have exactly equal accuracy — it is never itself the ranking metric. No in-round partial leaderboard; scores are hidden until round/session complete; no score shown on avatar badges. Per-round breakdown per player.

**MVP awards:**
- Most accurate overall
- Best year guesser (highest average year accuracy)
- Best location guesser (highest average location accuracy)
- Most consistent (highest average `min(year_accuracy, location_accuracy)`)
- Best round (highest single-round score; ties shown as joint winners)

**Actions:** Play Again (all return to lobby, same settings, re-ready required), Home (individual).

### 5.10.1 Rounds Won

`player_global_stats.rounds_won` counts a round as won **only when the player's `round_results.rank` for that round equals `1`**.

- In **Rush**, rank is computed once per round when all active players have submitted or the round timer expires.
- In **Relax**, rank is retroactively recomputed every time a player completes the round. A round win is therefore only finalized once the session deadline has passed or all players have completed that round, because no further retroactive rank flips are possible after that point.
- **Practice**, **Daily**, and **Level Up** do not contribute to `rounds_won`.

### 5.11 Disconnection and Reconnect

**Grace period:** 5 seconds. Reconnect within 5 seconds cancels the leave. Player receives full `STATE_SNAPSHOT`.

**After grace period:** `session_players.left_at` set. Pending round scores zero. **Game never pauses.** Prevents griefing.

**Reconnect after grace period:** `STATE_SNAPSHOT` sent. Can still submit if ANSWER phase active. Past LOCKED: cannot submit retroactively.

**Player count drops to 1:** Game continues to completion.

### 5.12 Spectator Mode

**Deferred.** Implement only if the WebSocket connection handling already naturally supports a non-submitting observer with zero additional server logic. If any non-trivial server work is required, out of scope for initial release.

### 5.13 Rules and Constraints

- Minimum 2 players to start.
- Maximum 8 players per session.
- All game state server-authoritative.
- Correct answers never sent before RESULT phase.
- Hints allowed — individual per player, standard tiered penalty.
- Stats and badges updated per player at game end.
- Full PartyKit/WebSocket stack.

---

## 6. Cross-Mode Comparison

| Dimension | Practice | Daily | Level Up | Compete Rush | Compete Relax |
|---|---|---|---|---|---|
| Players | 1 | 1 | 1 | 2–8 | 2–8 |
| Rounds | 5 | 5 | 5 | 3, 5, or 10 | Always 5 |
| Timer | Optional 10s–5min | Mandatory 90s | Mandatory (formula) | Mandatory 10s–5min | Optional (host-enabled, per-player) |
| Deadline | None | None | None | None | 1–14 days |
| Year range | Player sets | Full range | Formula-computed | Host sets | Host sets |
| Same events for all | No | Yes (globally) | No | Yes (per session) | Yes (per session) |
| Min accuracy to advance | None | None | 50–80% (L1–99) / 95% (L100) | None | None |
| Hints | Yes, tiered | Yes, tiered | Yes, tiered | Yes, tiered (individual) | Yes, tiered (individual) |
| Leaderboard | None | Global daily | None | Session, sync | Session, async |
| Badges per round | Yes | Yes | Yes + threshold notch | Yes | Yes |
| Streak / progression | None | Daily streak | Level 1–100 | None | None |
| Replay passed levels | N/A | N/A | Yes (no demotion) | N/A | N/A |
| History Collection | Yes | Yes | Yes | Yes | Yes |
| Deduplication | Last 500 (player) | N/A (fixed) | None (pool ≥ 100) | Last 500 (host) | Last 500 (host) |
| Submission broadcast | N/A | N/A | N/A | In-app, every submission | In-app + push, only on final round |
| Round advance | Manual | Manual | Manual | All Next + Rush round-advance timeout (30s) | Individual, independent |
| Group ready-gate | N/A | N/A | N/A | Required (all players ready) | None; ready state is informational |
| Group start | N/A | N/A | N/A | Host / auto-start starts all players | None; each player starts independently |
| Per-round ranking | N/A | N/A | N/A | Computed once per round | Retroactive on each completion |
| Rounds won (player_global_stats.rounds_won) | N/A | N/A | N/A | Counts rank = 1 per round | Counts final rank = 1 per round |
| Level degradation | N/A | N/A | Never | N/A | N/A |
| Stack | Direct API | Direct API | Direct API | PartyKit + WS | PartyKit + WS |

---

## 7. Shared Rules Across All Modes

- Scoring always server-side. No exceptions.
- Stats written at game end only.
- Badges never persisted as standalone records. Aggregated into stats at game end.
- History Collection written at round end — not game end.
- Images never cropped. Fit-to-contain always.
- No default year on the slider. Player must actively select.
- Submit always manual except on timer expiry.
- Timer expiry auto-submits with whatever is placed. Unplaced inputs score zero.
- All inputs lock during transitions and result evaluation.
- Hint penalties additive, floored at 0% accuracy.
- No mode may write to another mode's session records.

---

*Spec version 1.4 — Guess-History Game Modes — authored 2026-04-28, updated 2026-06-28*
