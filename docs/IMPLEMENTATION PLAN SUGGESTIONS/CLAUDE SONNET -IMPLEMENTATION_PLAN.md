# CORE_GAME — Implementation Plan
**Stack:** React 18 + TypeScript · Supabase (Postgres + Auth) · Vite  
**Priorities:** Phased milestones · Full spec coverage · Mobile-first · Scoring precision

---

## PART 1 — ARCHITECTURE OVERVIEW

### Tech Stack (Locked)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React 18 + TypeScript | Strict typing for state machine & scoring engine |
| Build tool | Vite | Fast HMR, optimal bundle splitting |
| Styling | Tailwind CSS v4 + CSS variables | Theme tokens, mobile-first utilities |
| State | Zustand | Lightweight, slice-based, no boilerplate |
| Map | Leaflet + react-leaflet | Open-source, tile-swappable, touch-native |
| Backend | Supabase | Postgres + Auth + Row-Level Security |
| i18n | react-i18next | Independent UI + content language |
| Testing | Vitest + React Testing Library | Unit-test scoring engine in isolation |
| Routing | React Router v6 | SPA navigation |

---

## PART 2 — FOLDER STRUCTURE

```
src/
├── engine/                    # Pure logic — NO React, NO imports from UI
│   ├── scoring.ts             # EVALUATE_ANSWER(), accuracy, XP — fully unit-tested
│   ├── hints.ts               # Hint dependency graph + penalty calculation
│   ├── events.ts              # FETCH_EVENT(), repeat-protection buffer
│   └── constants.ts           # MAX_ROUNDS, HINT_TOTAL, TIMER limits, etc.
│
├── state/                     # Zustand stores — strict lifecycle enforcement
│   ├── gameStore.ts           # GameState, lifecycle phase, round data
│   ├── sessionStore.ts        # Aggregated session scores + completion
│   ├── settingsStore.ts       # Timer, hints, year filter, theme, language
│   └── uiStore.ts             # Cinematic phase, lock state, panel visibility
│
├── screens/                   # Top-level page components (one per lifecycle phase)
│   ├── HomeScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── PreflightScreen.tsx    # Blocking startup checks
│   ├── CinematicScreen.tsx    # Auto-pan reveal
│   ├── GuessScreen.tsx        # Year slider + map placement
│   ├── ResultScreen.tsx       # Per-round outcome
│   └── SummaryScreen.tsx      # SESSION_COMPLETE display
│
├── components/
│   ├── map/
│   │   ├── GameMap.tsx        # Leaflet wrapper, click-to-place only
│   │   ├── MarkerLayer.tsx    # Player marker + correct-answer marker
│   │   └── AutoPan.tsx        # Cinematic camera controller
│   ├── year/
│   │   ├── YearSlider.tsx     # No default value, explicit action required
│   │   └── YearDisplay.tsx
│   ├── hints/
│   │   ├── HintPanel.tsx      # Dependency-aware unlock UI
│   │   └── HintCard.tsx
│   ├── timer/
│   │   └── RoundTimer.tsx     # Lives OUTSIDE input surface per spec §12
│   ├── scoring/
│   │   ├── AccuracyBar.tsx    # Accuracy % display — never mixed with XP
│   │   └── XPDisplay.tsx      # XP display — never mixed with Accuracy
│   └── ui/
│       ├── ThemeProvider.tsx
│       └── LangProvider.tsx
│
├── hooks/
│   ├── useLifecycle.ts        # Enforces valid phase transitions
│   ├── useRoundTimer.ts       # Non-pausable countdown
│   ├── useAssetPreload.ts     # Pre-fetches next round image
│   └── useInputLock.ts        # Global interaction lock during transitions
│
├── lib/
│   ├── supabase.ts            # Supabase client singleton
│   ├── persistence.ts         # Atomic round writes + session save
│   └── recovery.ts            # localStorage session recovery
│
├── types/
│   ├── game.ts                # GameState, RoundState, PlayerState
│   ├── events.ts              # HistoricalEvent shape
│   ├── scoring.ts             # ScoringResult, HintPenalty
│   └── lifecycle.ts           # Lifecycle phase enum (8 phases)
│
└── i18n/
    ├── ui/                    # UI language strings (en, fr, th, …)
    └── content/               # Event content fetched per language from Supabase
```

---

## PART 3 — STATE MACHINE

### Lifecycle Phases (Strict Order)

```
INIT
  └─► PREFLIGHT_CHECK   (blocking — all 3 checks must pass)
        └─► ROUND_START      (cinematic begins, inputs locked)
              └─► ROUND_ACTIVE    (year slider + map live, hints available)
                    └─► ROUND_LOCK    (submission fired, all inputs disabled)
                          └─► ROUND_EVALUATE  (scoring engine runs, pure logic)
                                └─► ROUND_COMPLETE  (result shown, round saved)
                                      ├─► ROUND_START  (if rounds_remaining > 0)
                                      └─► SESSION_COMPLETE  (if rounds_remaining = 0)
```

### Transition Rules

- No phase can be skipped.
- No phase can be re-entered once left (except `ROUND_START` for successive rounds).
- `ROUND_LOCK` → `ROUND_EVALUATE` happens automatically (no user action).
- `ROUND_COMPLETE` → next phase **requires explicit user tap/click** (no auto-advance).
- Any phase transition fires `uiStore.lockAllInputs()` during the window.

### GameState Shape (TypeScript)

```typescript
// types/lifecycle.ts
export type LifecyclePhase =
  | 'INIT'
  | 'PREFLIGHT_CHECK'
  | 'ROUND_START'
  | 'ROUND_ACTIVE'
  | 'ROUND_LOCK'
  | 'ROUND_EVALUATE'
  | 'ROUND_COMPLETE'
  | 'SESSION_COMPLETE';

// types/game.ts
export interface GameState {
  phase: LifecyclePhase;
  session: SessionState;
  currentRound: RoundState | null;
  player: PlayerState;
}

export interface SessionState {
  sessionId: string;
  events: HistoricalEvent[];          // 5 pre-selected, fixed at INIT
  roundIndex: number;                 // 0–4
  completedRounds: RoundResult[];
}

export interface RoundState {
  event: HistoricalEvent;
  startedAt: number;                  // Unix ms — from NOW()
  yearGuess: number | null;           // null = not yet placed
  locationGuess: LatLng | null;       // null = not yet placed
  hintsUsed: HintId[];
  timerExpired: boolean;
}

export interface PlayerState {
  // Strictly separated — never combined
  accuracyHistory: number[];          // per-round accuracy %
  xpHistory: number[];                // per-round XP earned
}
```

---

## PART 4 — SCORING ENGINE

The engine lives in `src/engine/scoring.ts`. It is **pure TypeScript** — no React, no Supabase, no side effects. Every function is unit-tested.

### Accuracy Calculation

```typescript
// engine/scoring.ts

export function calculateYearAccuracy(guessedYear: number | null, correctYear: number): number {
  if (guessedYear === null) return 0;
  const delta = Math.abs(guessedYear - correctYear);
  // Example decay curve — tune via config:
  // 0 years off → 100%, 100 years off → 0%
  return Math.max(0, 1 - delta / 100);
}

export function calculateLocationAccuracy(guess: LatLng | null, correct: LatLng): number {
  if (guess === null) return 0;
  const distKm = haversineDistanceKm(guess, correct);
  // Example: 0 km → 100%, 5000 km → 0%
  return Math.max(0, 1 - distKm / 5000);
}

export function calculateRoundAccuracy(yearAcc: number, locAcc: number): number {
  // Equal weight — tune as needed
  return (yearAcc + locAcc) / 2;
}

export function applyHintPenaltyToAccuracy(
  rawAccuracy: number,
  penaltyFraction: number  // from hint engine, 0.0–1.0
): number {
  return Math.max(0, rawAccuracy - penaltyFraction);
}
```

### XP Calculation

```typescript
export function calculateRoundXP(
  rawAccuracy: number,
  hintsUsed: HintId[],
  timerBonus: number        // derived from time remaining
): number {
  const BASE_XP = 1000;
  const hintPenalty = calculateHintXPPenalty(hintsUsed);  // from hints.ts
  const xp = BASE_XP * rawAccuracy * timerBonus - hintPenalty;
  return Math.max(0, Math.round(xp));
}
```

### Key Invariants (enforced by types)

- `accuracyHistory` and `xpHistory` are **separate arrays** — never merged or averaged together into a single value.
- Session accuracy = `AVERAGE(accuracyHistory)` — computed only at SESSION_COMPLETE.
- Session XP = `SUM(xpHistory)` — computed only at SESSION_COMPLETE.
- Hint penalty is applied **independently** to each dimension.

---

## PART 5 — HINT SYSTEM

```typescript
// engine/hints.ts

export const HINT_TOTAL = 12;
export const MAX_HINT_PENALTY = 1.0;

// Dependency graph — some hints require a prerequisite
export const HINT_DEPENDENCIES: Record<HintId, HintId | null> = {
  'region':       null,
  'country':      'region',
  'city':         'country',
  'decade':       null,
  'half-century': 'decade',
  'exact-year':   'half-century',
  // ... remaining 6 hints
};

export function isHintUnlocked(hintId: HintId, usedHints: HintId[]): boolean {
  const dep = HINT_DEPENDENCIES[hintId];
  if (dep === null) return true;
  return usedHints.includes(dep);
}

export function calculateTotalHintPenalty(usedHints: HintId[]): number {
  const total = usedHints.reduce((sum, h) => sum + HINT_PENALTY_VALUES[h], 0);
  return Math.min(total, MAX_HINT_PENALTY);  // capped at 100%
}
```

---

## PART 6 — DATABASE SCHEMA (Supabase)

### Tables

```sql
-- Historical events (content)
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        INT NOT NULL,
  lat         FLOAT NOT NULL,
  lng         FLOAT NOT NULL,
  image_url   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Localized event content (independent language selection)
CREATE TABLE event_translations (
  event_id    UUID REFERENCES events(id),
  lang        TEXT NOT NULL,           -- 'en', 'fr', 'th', etc.
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (event_id, lang)
);

-- Game sessions
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  avg_accuracy    FLOAT,               -- NULL until SESSION_COMPLETE
  total_xp        INT,                 -- NULL until SESSION_COMPLETE
  event_ids       UUID[] NOT NULL      -- the 5 selected events, fixed at INIT
);

-- Per-round results (atomic writes after ROUND_EVALUATE)
CREATE TABLE round_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES sessions(id),
  event_id        UUID REFERENCES events(id),
  round_index     INT NOT NULL,        -- 0–4
  year_guess      INT,                 -- NULL if unanswered
  lat_guess       FLOAT,
  lng_guess       FLOAT,
  accuracy_pct    FLOAT NOT NULL,
  xp_earned       INT NOT NULL,
  hints_used      TEXT[] NOT NULL,
  time_taken_sec  INT NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL
);

-- Repeat-protection buffer (last 500 events per user)
CREATE TABLE play_history (
  user_id     UUID REFERENCES auth.users(id),
  event_id    UUID REFERENCES events(id),
  played_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- Index for fast repeat-protection lookups
CREATE INDEX idx_play_history_user_recent
  ON play_history(user_id, played_at DESC);
```

### Row-Level Security

```sql
-- Users can only read/write their own data
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own sessions" ON sessions
  USING (auth.uid() = user_id);

ALTER TABLE round_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own rounds" ON round_results
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

ALTER TABLE play_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own history" ON play_history
  USING (auth.uid() = user_id);
```

---

## PART 7 — PERSISTENCE LAYER

### Atomic Round Write

```typescript
// lib/persistence.ts

export async function saveRoundResult(result: RoundResult): Promise<void> {
  // Single atomic insert — no partial writes
  const { error } = await supabase
    .from('round_results')
    .insert({
      session_id:     result.sessionId,
      event_id:       result.eventId,
      round_index:    result.roundIndex,
      year_guess:     result.yearGuess,
      lat_guess:      result.locationGuess?.lat ?? null,
      lng_guess:      result.locationGuess?.lng ?? null,
      accuracy_pct:   result.accuracy,
      xp_earned:      result.xp,
      hints_used:     result.hintsUsed,
      time_taken_sec: result.timeTakenSec,
      submitted_at:   new Date().toISOString(),
    });
  if (error) throw error;
}

export async function saveSessionSummary(session: SessionSummary): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({
      completed_at: new Date().toISOString(),
      avg_accuracy: session.avgAccuracy,
      total_xp:     session.totalXP,
    })
    .eq('id', session.sessionId);
  if (error) throw error;
}
```

### Session Recovery (localStorage)

```typescript
// lib/recovery.ts
const RECOVERY_KEY = 'core_game_recovery';

export function saveRecoverySnapshot(state: GameState): void {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({
    sessionId: state.session.sessionId,
    roundIndex: state.session.roundIndex,
    completedRounds: state.session.completedRounds,
    snapshot_at: Date.now(),
  }));
}

export function loadRecoverySnapshot(): RecoverySnapshot | null {
  const raw = localStorage.getItem(RECOVERY_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearRecoverySnapshot(): void {
  localStorage.removeItem(RECOVERY_KEY);
}
```

---

## PART 8 — MAP COMPONENT RULES

Derived from spec §12 hard constraints:

| Rule | Implementation |
|---|---|
| Click/tap only — no drag | Disable `draggable` on marker; use `MapContainer onClick` |
| No default marker position | `locationGuess` state initializes as `null`; marker not rendered until set |
| No default year | `yearGuess` state initializes as `null`; submit blocked until set |
| Cinematic auto-pan | `useMap().flyTo()` over `AUTOPAN_DURATION_SEC = 5` seconds |
| Marker placed, not dragged | On map click → set `locationGuess`, render marker at that point |
| Light/Dark tile styles | Swap tile URL based on `theme` setting (e.g. CartoDB light vs dark) |

```typescript
// components/map/GameMap.tsx (skeleton)
function GameMap({ onLocationSelect, isLocked }: GameMapProps) {
  const map = useMap();

  const handleMapClick = useCallback((e: LeafletMouseEvent) => {
    if (isLocked) return;                    // ROUND_LOCK enforced here
    onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
  }, [isLocked, onLocationSelect]);

  useMapEvents({ click: handleMapClick });
  return null;
}
```

---

## PART 9 — PHASED MILESTONES

---

### PHASE 1 — FOUNDATION (Weeks 1–2)
*Goal: runnable skeleton with correct architecture boundaries*

**Deliverables:**
- [ ] Vite + React 18 + TypeScript project scaffold
- [ ] Zustand stores: `gameStore`, `sessionStore`, `settingsStore`, `uiStore`
- [ ] `LifecyclePhase` enum and `useLifecycle` hook with valid transition guard
- [ ] `src/engine/` directory with stub functions + 100% unit test coverage on stubs
- [ ] Supabase project: schema applied, RLS enabled, seed data (10 test events)
- [ ] Supabase Auth: email/password working
- [ ] Tailwind CSS v4 + CSS variable token system (orange primary, light/dark)
- [ ] `ThemeProvider` and `LangProvider` wired at root
- [ ] Route skeleton: `/`, `/play`, `/settings`, `/summary`
- [ ] CI: Vitest running on every push

**Exit criteria:** App boots, auth works, lifecycle transitions log correctly, all engine unit tests green.

---

### PHASE 2 — SCORING ENGINE (Week 3)
*Goal: complete, tested, correct scoring logic before any UI depends on it*

**Deliverables:**
- [ ] `engine/scoring.ts` — full implementation of all scoring functions
- [ ] `engine/hints.ts` — full dependency graph, penalty calculation, cap enforcement
- [ ] `engine/events.ts` — `FETCH_EVENT()` with year-range filter + repeat-protection buffer (500)
- [ ] `engine/constants.ts` — all spec constants locked
- [ ] Unit tests covering:
  - Perfect guess → 100% accuracy
  - No guess → 0% accuracy
  - Hint penalty capped at MAX_HINT_PENALTY = 1.0
  - Accuracy and XP computed independently (no cross-contamination)
  - Year delta decay curve correctness
  - Haversine distance correctness (known city pairs)
  - Repeat protection: events in last 500 excluded

**Exit criteria:** Scoring engine is 100% tested and frozen. No UI merged until this phase is green.

---

### PHASE 3 — GAME LOOP CORE (Weeks 4–5)
*Goal: complete playable round with all hard constraints enforced*

**Deliverables:**

**Preflight (`INIT` → `PREFLIGHT_CHECK`):**
- [ ] Connectivity check
- [ ] Supabase storage check
- [ ] Event availability check (≥5 events match current filters)
- [ ] Blocking error screen if any check fails

**Round flow:**
- [ ] `CinematicScreen` — image reveal + `AutoPan` over 5s, manually interruptible
- [ ] `GuessScreen` — map + year slider, both required for submission
- [ ] `YearSlider` — no default value, thumb only appears after first interaction
- [ ] `GameMap` — click-to-place marker (no drag), tile style matches theme
- [ ] `RoundTimer` — non-pausable, lives outside input surface, triggers auto-submit on zero
- [ ] Submission pipeline — single path, inputs locked on fire, no re-fire possible
- [ ] `ResultScreen` — accuracy % and XP displayed separately, never merged
- [ ] Manual advance button — no auto-advance to next round

**Asset preloading:**
- [ ] `useAssetPreload` fetches next round image during current round
- [ ] Retry loop if preload fails

**Persistence:**
- [ ] `saveRoundResult()` fires after every `ROUND_EVALUATE`
- [ ] `saveRecoverySnapshot()` fires after every `ROUND_COMPLETE`

**Exit criteria:** Full 5-round game completable. All §12 hard constraints demonstrably enforced. Zero auto-advance, zero default values.

---

### PHASE 4 — HINT SYSTEM (Week 6)
*Goal: complete hint UI with dependency enforcement and penalty display*

**Deliverables:**
- [ ] `HintPanel` — 12 hints displayed with locked/unlocked/used states
- [ ] Dependency chain enforced in UI (locked hints not tappable)
- [ ] Penalty preview shown before confirming hint use
- [ ] Real-time penalty deduction reflected in accuracy + XP displays
- [ ] Hints disabled during `ROUND_LOCK` and `ROUND_EVALUATE`
- [ ] Hint state included in round result persistence

**Exit criteria:** All 12 hints work, dependency chains enforced, penalty applied correctly to both dimensions independently.

---

### PHASE 5 — SETTINGS & CONFIGURATION (Week 7)
*Goal: all game config options working without coupling to core logic*

**Deliverables:**
- [ ] Timer visibility toggle (show/hide, does not pause timer)
- [ ] Timer duration setting (5–300 seconds)
- [ ] Auto-pan toggle
- [ ] Year range filter (affects event selection only)
- [ ] Hints enable/disable
- [ ] UI language selector (independent of content language)
- [ ] Content language selector (independent of UI language)
- [ ] Light/Dark theme toggle (no logic coupling)

**Exit criteria:** Every setting changes only its declared behavior. No setting affects scoring logic.

---

### PHASE 6 — SESSION SUMMARY & PERSISTENCE (Week 8)
*Goal: complete session completion flow and stats persistence*

**Deliverables:**
- [ ] `SummaryScreen` — all 5 rounds shown, avg accuracy and total XP displayed separately
- [ ] `saveSessionSummary()` fires atomically at SESSION_COMPLETE
- [ ] Play history updated (repeat protection buffer maintained)
- [ ] Session recovery flow — detect incomplete session on boot, offer resume or abandon
- [ ] `clearRecoverySnapshot()` on clean completion

**Exit criteria:** Full session saves correctly. Recovery flow works after forced close.

---

### PHASE 7 — MOBILE POLISH & ACCESSIBILITY (Week 9)
*Goal: pixel-perfect mobile experience, touch parity with desktop*

**Deliverables:**
- [ ] All screens tested on 375px, 390px, 430px (iPhone SE → Pro Max)
- [ ] Map touch behavior identical to mouse (tap-to-place, pinch-to-zoom)
- [ ] Year slider touch-friendly (minimum 44px tap target)
- [ ] Hint panel scrollable on small screens
- [ ] Cinematic reveal fills viewport without scroll on mobile
- [ ] Timer visible and non-overlapping on all screen sizes
- [ ] Focus states using orange primary (keyboard accessible)
- [ ] No iOS scroll bounce on game screens

**Exit criteria:** QA pass on real iOS + Android devices. Zero layout breaks at any viewport.

---

### PHASE 8 — HARDENING & LAUNCH (Week 10)
*Goal: production-ready, spec-complete, fully tested*

**Deliverables:**
- [ ] Full E2E test: game start → 5 rounds → summary → persistence verified
- [ ] Preflight failure paths tested (offline, no events, storage error)
- [ ] Timer expiry path tested (auto-submit with null inputs)
- [ ] Input lock verified — no state mutation possible during ROUND_LOCK
- [ ] No auto-advance verified via E2E
- [ ] No default values verified (year slider, marker)
- [ ] Scoring invariants verified (Accuracy ≠ XP, never merged)
- [ ] RLS policies verified (users cannot access other users' data)
- [ ] Localization: no silent fallback mixing
- [ ] Performance: Lighthouse ≥ 90 mobile
- [ ] Bundle size audit: no unused Leaflet or i18next chunks

---

## PART 10 — COMPONENT INTERACTION MAP

```
HomeScreen
  └─ starts game → INIT → PREFLIGHT_CHECK
        └─ PreflightScreen (blocks if any check fails)
              └─ ROUND_START → CinematicScreen
                    └─ (reveal complete or interrupted) → ROUND_ACTIVE
                          └─ GuessScreen
                                ├─ YearSlider (null default)
                                ├─ GameMap (click-to-place only)
                                ├─ HintPanel (dependency-locked)
                                └─ RoundTimer (external — not inside GuessScreen)
                                      └─ submit / timer=0 → ROUND_LOCK
                                            └─ ROUND_EVALUATE (scoring engine)
                                                  └─ ROUND_COMPLETE → ResultScreen
                                                        └─ (user taps Next) → repeat or SESSION_COMPLETE
                                                              └─ SummaryScreen
```

---

## PART 11 — CRITICAL CONSTRAINTS CHECKLIST

Reference: spec §12. Each constraint has a single owner in the codebase.

| Constraint | Owner | Enforced By |
|---|---|---|
| No auto-submit (except timer=0) | `useRoundTimer` | Timer callback only path to auto-submit |
| No auto-advance rounds | `ResultScreen` | No `useEffect` that advances phase |
| No timer pause | `useRoundTimer` | Interval never cleared mid-round |
| No partial submission | `GuessScreen` | Submit button disabled until both inputs set |
| No round start without ready assets | `useAssetPreload` | ROUND_START blocked until preload resolves |
| No randomness after INIT | `gameStore` | Events array frozen after selection |
| No image cropping | CSS | `object-fit: contain`, not `cover` |
| No hidden defaults (year) | `YearSlider` | Thumb hidden; `yearGuess` initialized as `null` |
| No hidden defaults (marker) | `GameMap` | Marker not rendered until `locationGuess !== null` |
| No draggable markers | `GameMap` | `draggable={false}` on Leaflet marker |
| No XP ↔ Accuracy coupling | `engine/scoring.ts` | Separate functions, separate arrays, never averaged together globally |
| No parallel scoring systems | `engine/scoring.ts` | Single file, single export per function |
| Inputs locked during transitions | `useInputLock` | Zustand `uiStore.isLocked` checked in all interactive components |

---

## PART 12 — WHAT IS EXPLICITLY OUT OF SCOPE (V1)

Per spec §13 — do not implement, do not architect around:

- Multi-device sync
- Server-authoritative gameplay
- Partial / incremental submissions
- Background evaluation
- Dynamic difficulty adjustment
- Pausing the game
- Skipping rounds without submitting

The Zustand store and Supabase schema are **designed not to foreclose** multiplayer, Level Up mode, or daily challenges — but zero code for those ships in V1.

---

## APPENDIX — SPEC CONSTANT REFERENCE

```typescript
// engine/constants.ts
export const MAX_ROUNDS = 5;
export const REPEAT_PROTECTION_BUFFER = 500;
export const AUTOPAN_DURATION_SEC = 5;
export const TIMER_MIN_SEC = 5;
export const TIMER_MAX_SEC = 300;
export const HINT_TOTAL = 12;
export const MAX_HINT_PENALTY = 1.0;
```
