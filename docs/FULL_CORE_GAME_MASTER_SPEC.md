# FULL CORE_GAME — MASTER SPEC 

For reference.

## 0. SYSTEM PURPOSE & GLOBAL PRINCIPLES

### 0.1 Purpose

The core game is based on Practice Mode which is a **deterministic, single-player training environment** designed to evaluate user ability to:

- Identify **WHEN** an event occurred (year)
- Identify **WHERE** an event occurred (geolocation)

The system produces **two independent scoring dimensions**:

- **Accuracy (%) → Primary KPI** — measures skill, continuous, reducible by hint penalty
- **XP (points) → Secondary reward system** — measures reward, discrete, reducible by hint penalty

These dimensions are **NOT interchangeable** and must remain **strictly separated** at all system levels (state, engine, UI, persistence). They must never be merged, averaged together globally, or converted into one another.

### 0.2 Viewport

The app uses 100% width and height. Responsive layouts are allowed. Scroll behavior is explicitly controlled per screen (see Section 6).

### 0.3 Input Modes

- Desktop: mouse
- Mobile: touch
- Behavior must be **identical** across both devices.

### 0.4 Interaction Locking

During transitions or result evaluation → **ALL inputs are disabled**. No state mutation is permitted during these windows.

### 0.5 Color System

- Primary color: **ORANGE** — used for CTA buttons, focus states, and progress indicators.
- Must be **theme-configurable** (Light / Dark modes).
- No logic may be tied to the theme.

### 0.6 Themes (MANDATORY)

- LIGHT and DARK modes must both be supported.
- Primary color is different for each mode
- Themes affect: background, text, card surfaces, map tile style (if supported).
- No game logic is coupled to theme state.

### 0.7 Localization (MANDATORY)

- UI language and Content language are **independently** selected by the user.
- UI text = frontend-controlled strings.
- Content (event descriptions, metadata) = fetched per language from backend.
- **NO silent fallback mixing** (e.g., do not silently show English content when French is selected).

### 0.8 Constants

```
MAX_ROUNDS = 5
REPEAT_PROTECTION_BUFFER = 500  // last N events excluded from selection
AUTOPAN_DURATION_SEC = 5
TIMER_MIN_SEC = 5
TIMER_MAX_SEC = 300
HINT_TOTAL = 12
MAX_HINT_PENALTY = 1.0  // = 100%, capped
```

Mapped to:
- STATE_MODEL: GameState runtime objects
- STATE_LIFECYCLE: INIT, PREFLIGHT_CHECK, ROUND_START, ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE, SESSION_COMPLETE
- SYSTEM_RULES: MAX_ROUNDS, FETCH_EVENT(), EVALUATE_ANSWER(answer, event), NOW(), AVERAGE(values), SYSTEM_FUNCTION_CHECK(name), ALL_TRUE(values)

---

## 1. SYSTEM ARCHITECTURE
Gameplay is described at the product level, while execution, state, and functions live in the core docs.

Mapped to:
- STATE_MODEL: runtime objects only
- STATE_LIFECYCLE: reusable lifecycle phases
- SYSTEM_RULES: shared constants and pure functions

## 2. STATE SEGMENTATION
Player-facing behavior is separated into initialization, per-round play, results, and session summary.

Mapped to:
- STATE_MODEL: runtime objects only
- STATE_LIFECYCLE: initialization, round flow, completion
- SYSTEM_RULES: game-wide constants and pure functions

## 3. GAME CONFIGURATION & SETTINGS

Gameplay settings may change timer visibility, auto-pan, hints, and year filtering, but they do not change the core execution contract.

Mapped to:
- STATE_MODEL: session, round, player, ui
- STATE_LIFECYCLE: INIT, PREFLIGHT_CHECK, ROUND_START, ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE, SESSION_COMPLETE
- SYSTEM_RULES: MAX_ROUNDS, FETCH_EVENT(), EVALUATE_ANSWER(answer, event)

---

## 4. GAME INITIALIZATION

### 4.1 Preflight Checks (BLOCKING — Game Cannot Start Until All Pass)

The game cannot start until connectivity, storage, and event availability checks pass.

If any check fails, startup is blocked and the player sees an error.

### 4.2 Event Selection

- Exactly **5 events** selected per game
- Filters applied:
  - Year range defined by the game setup
  - **Repeat protection:** Exclude recently played events
  - No duplicates within the same game

### 4.3 Asset Preloading

- The game prepares the next playable round asset before the user reaches it.
- If loading fails, the system retries until the asset becomes available.

### 4.4 State Initialization

After startup checks pass and events are selected, the game begins with deterministic round content already prepared.

Mapped to:
- STATE_MODEL: session, round, player, ui
- STATE_LIFECYCLE: INIT, PREFLIGHT_CHECK, READY, ROUND_START
- SYSTEM_RULES: MAX_ROUNDS, FETCH_EVENT(), NOW()

---

## 5. ROUND FLOW

### 5.1 Round Behavior

Each round moves from reveal to input, then submission, evaluation, result display, and manual progression to the next round.

### 5.2 Timer Behavior

- The timer runs through the full round.
- The timer does not pause or reset mid-round.
- If the timer expires, the round completes automatically.

### 5.3 Cinematic Behavior

- Each round begins with a cinematic reveal.
- The reveal supports manual interruption and panning.
- The reveal does not allow game-state changes.

Mapped to:
- STATE_MODEL: round, session, ui
- STATE_LIFECYCLE: ROUND_START, ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE
- SYSTEM_RULES: NOW(), FETCH_EVENT(), EVALUATE_ANSWER(answer, event)

---

## 6. UI & UX SPECIFICATION (FULL DETAIL)

The player experiences a cinematic reveal, a guess input phase, a result display, and a final summary screen.

- The cinematic view is immersive and allows interruption.
- The guess view supports year selection and location placement.
- The result view shows the outcome of the round.
- The final summary view shows the full run.

Mapped to:
- STATE_MODEL: round, player, ui
- STATE_LIFECYCLE: ROUND_START, ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE, SESSION_COMPLETE
- SYSTEM_RULES: EVALUATE_ANSWER(answer, event)

---

## 7. INPUT & SUBMISSION RULES

### 7.1 Manual Submission

Manual submission requires both a year choice and a location choice.

### 7.2 Timeout Submission (Timer = 0)

When time runs out, the round still completes and any missing input is treated as absent.

### 7.3 Submission Pipeline (Control Layer — Single Path)

The submission path is single and consistent: the chosen inputs are evaluated once, penalties are applied, and the round result is preserved.

Mapped to:
- STATE_MODEL: round, player, ui
- STATE_LIFECYCLE: ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE
- SYSTEM_RULES: EVALUATE_ANSWER(answer, event), NOW()

---

## 8. HINT SYSTEM

### 8.1 Structure

### 8.2 Dependency System

Some hints depend on others and cannot be used until the prerequisite hint has been used.

### 8.3 Penalty Calculation

Hint usage reduces reward and cannot reduce reward below zero.

Mapped to:
- STATE_MODEL: player, round
- STATE_LIFECYCLE: ROUND_ACTIVE, ROUND_LOCK, ROUND_EVALUATE, ROUND_COMPLETE
- SYSTEM_RULES: EVALUATE_ANSWER(answer, event)

---

## 9. EVALUATION ENGINE (PURE LOGIC — NO STATE)

Scoring behavior is defined in `SYSTEM_RULES.md`.

The game evaluates the player’s year guess and location guess against the event and converts the result into accuracy and XP.

Mapped to:
- STATE_MODEL: round, player
- STATE_LIFECYCLE: ROUND_EVALUATE
- SYSTEM_RULES: EVALUATE_ANSWER(answer, event), ABS(x), DISTANCE_KM(...)

---

## 10. RESULTS AGGREGATION

After the final round, the game shows cumulative rewards and summary accuracy derived from the completed rounds.

Mapped to:
- STATE_MODEL: session, player
- STATE_LIFECYCLE: ROUND_COMPLETE, SESSION_COMPLETE
- SYSTEM_RULES: AVERAGE(values)

---

## 11. PERSISTENCE LAYER

Persistence requirements are defined in `DATABASE_SCHEMA.md`.

The game stores round outcomes, session summaries, and repeat-protection history consistently with the core database contract.

### 11.2 Local Storage

Session recovery data may be stored locally so a game can resume after an unexpected close.

### 11.3 Persistence Timing

Round results are saved after each evaluation, and session summaries are saved after completion. Writes remain atomic per round.

### 11.4 Stats Module (Separate)

Analytics may be derived from stored results for reporting purposes.

Mapped to:
- STATE_MODEL: session, round, player
- STATE_LIFECYCLE: ROUND_COMPLETE, SESSION_COMPLETE
- SYSTEM_RULES: AVERAGE(values)

---

## 12. HARD CONSTRAINTS (NON-NEGOTIABLE)

### Gameplay Constraints

| Rule | Detail |
|---|---|
| NO auto-submit | Except when time runs out |
| NO auto-advance rounds | User must advance between rounds manually |
| NO timer pause | The timer continues through the entire round |
| NO partial submission | Manual submission requires both inputs |
| NO round start without ready assets | The next round must be ready before it begins |
| NO randomness after initialization | Behavior remains deterministic after setup |

### UI Constraints

| Rule | Detail |
|---|---|
| NO image cropping | Images must fit without cropping. Overflow allowed. |
| NO hidden defaults | Year slider has no default value. Marker has no default position. |
| NO implicit inputs | Every input requires explicit user action. |
| NO draggable markers | Map markers are placed by click/tap only. |
| NO timers in input UI | Timer display/logic is controlled outside the input surface. |

### System Constraints

| Rule | Detail |
|---|---|
| NO state mutation outside core docs | All state changes remain in the core contract. |
| NO coupling between XP and Accuracy | They are computed independently and never interconverted. |
| NO parallel scoring systems | One engine, one pipeline, one source of truth. |
| NO undocumented behavior | Anything not described is invalid. |

Mapped to:
- STATE_MODEL: all runtime objects
- STATE_LIFECYCLE: all lifecycle phases
- SYSTEM_RULES: all functions and constants

---

## 13. EXPLICIT NON-FEATURES

The following are deliberately **out of scope** for V8 and must not be implemented:

- Multi-device sync
- Server-authoritative gameplay (client is authoritative in Practice Mode)
- Partial/incremental submissions
- Background evaluation
- Dynamic difficulty adjustment
- Pausing the game
- Skipping rounds without submitting

Mapped to:
- STATE_MODEL: runtime objects only
- STATE_LIFECYCLE: no extra phases
- SYSTEM_RULES: no additional functions

---

## 14. SCALABILITY HOOKS

The system is designed to support future modes **without modifying** the core execution contract:

- **Multiplayer mode** — same core rules, different product packaging
- **Level Up mode** — alternate settings and progression pacing
- **Daily challenges** — same loop, date-based variation

No current implementation work is required for these hooks; the architecture must simply not foreclose them.

Mapped to:
- STATE_MODEL: runtime objects only
- STATE_LIFECYCLE: reusable lifecycle phases
- SYSTEM_RULES: shared constants and pure functions