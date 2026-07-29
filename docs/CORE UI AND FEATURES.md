THE CORE FEATURES - PRACTICE MODE (AKA SOLO MODE)

1. Game Initialization (usePracticeGameStarter.ts:91-241)
Starting the Game
When a player clicks "Start Practice" on the Home Page:

Settings Applied:
Timer: Optional. From 5 sec to 5 min. Default = None.
Year range: Customizable (default -100 to current year)
Hints allowed per round: As many as user desires as long as total hint penalties used is not superior to 100%
Preflight Check (gameStartPreflight.ts):
Verifies Supabase REST connectivity
Checks Firebase Storage for image delivery
Blocks start if critical services are down
Image Selection (useGamePreparation.ts):
Fetches 5 random historical events
Applies year range filters
Preloads image for round 1 for smooth gameplay
Records played images to avoid repeats (= must not reuse the last 500 events played)
State Initialization:
typescript
setGameId(uuidv4());           // Unique game ID
setRoomId('practice_xxxx');    // Virtual practice room
setImages(preparedImages);     // Store 1 selected image
setRoundResults([]);            // Empty results array
initializeSoloEngine(5);        // Initialize game engine
Navigation: Redirects to /practice/game/room/{roomId}/round/1
2. Game Engine State Machine (gameEngine.ts:41-99)
The solo game follows a strict state lifecycle.
Playing	START_GAME	Round 1 begins
RoundComplete	COMPLETE_ROUND	Guess submitted, showing results
GameComplete	ADVANCE (after last round)	All 5 rounds done
3. Round Gameplay (GameRoundPage.tsx)
Round Display (/practice/game/room/{roomId}/round/{n})
Image for round N+1 is preloaded
UI Components:
Image View: Historical photo with skeleton placeholder while loading
Map: Interactive Leaflet map for location guessing
Year Slider: Draggable slider to select year
Timer: Countdown display (if enabled)
Hint Button: Opens hint purchase modal
Player Actions:
Location Guess:
Click on world map to place pin
Can search location via input
Can reposition until submission
Year Guess:
Drag slider to select year or inputs year
Visual feedback shows selected year
Hint Purchase (optional):
Opens Hint Modal with 12 available hints
Some hints have dependencies (e.g., must buy "Remote Landmark" before "Distance to Remote Landmark")
Each hint costs accuracy points (and thus XP)
Hints are deducted after round completion (debt system)
Submission:
Click "Submit" button
Or auto-submit on timer expiry
4. Submission & Scoring (useGameRoundSubmission.ts:153-508)
Validation:
Both location AND year must be selected (unless timed out)
Game session must be committed
Scoring Calculation:
Source of truth: docs/backend/scoring_spec.md — see that file if this section and the code ever disagree.

Location Score
Exponential decay (NOT linear):

locationAccuracy = floor(clamp(100 * exp(-distanceKm / DISTANCE_DECAY_KM), 0, 100))

- 0 km → 100%
- ~1500 km → ~37%
- ~20000 km (antipodal) → 0%

locationScore = locationAccuracy

Time Score
yearDiff = abs(guess_year - actual_year)

Era scaling: older events are harder to guess the year for, so the effective
year difference is divided by eraScale (>= 1). referenceYear is frozen at
session creation (sessions.scoring_reference_year) to guarantee recomputability
from DB — never use wall-clock time.

eraScale = sqrt(max(ERA_SCALE_FLOOR, referenceYear - eventYear) / ERA_SCALE_FLOOR)

effectiveDiff = yearDiff / eraScale

yearAccuracy = floor(clamp(100 * exp(-effectiveDiff / YEAR_DECAY), 0, 100))

- exact match → 100%
- 1 year off on recent event (eraScale=1) → 97%
- 100 years off on 1969 event (eraScale≈1.06) → 9%
- 100 years off on 1500 event (eraScale≈3.24) → 46% (forgiveness for old event)

timeScore = yearAccuracy

Hint Penalty (proportional + age-discounted)
Definition:
- hints reduce score deterministically
- penalties are RATES (0-100 integer = 0%-100%), NOT flat point subtraction
- applied PROPORTIONALLY to raw accuracy (fair to both strong and weak players)
- WHEN (year) penalties are age-discounted by eraScale (older events → smaller
  effective penalty, since year-guessing is harder)
- WHERE (location) penalties are NOT age-discounted (location difficulty does
  not track event age)

Tier penalty rates (fixed per hint at content creation time):

| Tier | Rate | Typical hint type |
|---|---|---|
| 1 | 10% | Vague — era, broad continent |
| 2 | 20% | Moderate — decade, region |
| 3 | 30% | Strong — country, approximate year |
| 4 | 40% | Near-definitive — city, specific era |
| 5 | 50% | Definitive — exact location or year |

Rates are additive per axis, capped at 100.

penaltyWhenRate  = sum of tier rates for 'when' hints,  capped 100
penaltyWhereRate = sum of tier rates for 'where' hints, capped 100

Final Score
eraScale = sqrt(max(ERA_SCALE_FLOOR, referenceYear - eventYear) / ERA_SCALE_FLOOR)

whenRate  = clamp(penaltyWhenRate  / eraScale, 0, 100) / 100   // age-discounted
whereRate = clamp(penaltyWhereRate, 0, 100) / 100              // no age discount

yearAccuracyFinal     = floor(yearAccuracy     * (1 - whenRate))
locationAccuracyFinal = floor(locationAccuracy * (1 - whereRate))

rawScore = yearAccuracyFinal + locationAccuracyFinal   // 0 → 200

finalScore = rawScore

accuracy = round((yearAccuracyFinal + locationAccuracyFinal) / 2)

Note: proportional application guarantees a hint can never make you worse than 0
(you always keep (1 - rate) of your raw accuracy). This fixes the regressive
punishment of the old flat-subtraction model.
typescript
const MAX_DISTANCE_KM = 20000;
const MAX_YEAR_DIFF = 200;
const DISTANCE_DECAY_KM = 1500;
const YEAR_DECAY = 40;
const ERA_SCALE_FLOOR = 50;

const locationAccuracy = Math.floor(
  clamp(100 * Math.exp(-distanceKm / DISTANCE_DECAY_KM), 0, 100)
);

const yearDiff = Math.abs(guessYear - actualYear);
const eraScale = Math.sqrt(
  Math.max(ERA_SCALE_FLOOR, referenceYear - eventYear) / ERA_SCALE_FLOOR
);
const effectiveDiff = yearDiff / eraScale;
const yearAccuracy = Math.floor(
  clamp(100 * Math.exp(-effectiveDiff / YEAR_DECAY), 0, 100)
);

// penaltyWhenRate / penaltyWhereRate: sum of tier rates per axis, capped 100
const whenRate = clamp(penaltyWhenRate / eraScale, 0, 100) / 100; // age-discounted
const whereRate = clamp(penaltyWhereRate, 0, 100) / 100;          // no age discount

const yearAccuracyFinal = Math.floor(yearAccuracy * (1 - whenRate));
const locationAccuracyFinal = Math.floor(locationAccuracy * (1 - whereRate));
const rawScore = yearAccuracyFinal + locationAccuracyFinal;        // 0-200
const accuracy = Math.round((yearAccuracyFinal + locationAccuracyFinal) / 2);
const finalXP = yearAccuracyFinal + locationAccuracyFinal;
Result Data Stored:
typescript
{
  roundIndex: 2,
  event: { /* EventRecord: id, title, year, location, ... */ },
  guess: { year: 1954, location: { lat: 48.8566, lng: 2.3522 } },
  distanceKm: 245.3,
  yearDiff: 7,
  yearAccuracy: 85,
  locationAccuracy: 92,
  comboAccuracy: 85,
  roundAccuracy: 89,
  roundXp: 177,
  badges: [{ dimension: 'combo', tier: 'silver', accuracy: 85 }],
  didTimeout: false
}
Navigation to Results:
Solo mode immediately navigates to /practice/game/room/{roomId}/round/{n}/results
5. Round Results (RoundResultsPage.tsx)
Results Display:
Image Feedback:
Historical photo shown again
Button to open 1-10 rating modal
Button to open source (embedded webpage)
AI Confidence score in %
Score Breakdown:
Location: Distance from actual + XP earned (0-100)
Time: Year difference + XP earned (0-100)
Hint Penalties: Shows XP/accuracy deducted
Final Score: Combined after penalties
Map Visualization:
Shows guess pin vs actual location
Line connecting the two points
Distance label
Progress Indicators:
Round X of 5
Cumulative game score
Navigation Options:
Next Round: Advances to round n+1
Final Results: If round 5, goes to final results page
6. Final Results (FinalResultsPage.tsx)
Game Summary (/practice/final-results or /practice/level-up/final-results):
Scoreboard:
Round-by-round breakdown
Per-round: Location XP, Time XP, Hint penalties, Final score
Game Total: Sum of all 5 rounds (0-1000 XP possible)
Achievements:
Badges earned during game
Accuracy milestones
Perfect rounds
Statistics:
Average accuracy
Total hints used
Best/worst rounds
Actions:
Play Again: Start new practice game
Home: Return to main menu
Share: Share score (if authenticated)
7. Data Persistence
Supabase Tables:
Table	Purpose
round_results	Stores each round's guess, score, XP breakdown
game_sessions	Tracks game metadata (start time, mode, seed)
round_hints	Records purchased hints per round
profiles	User stats, total XP, games played
played_images	Tracks which images user has seen
Local Storage:
Session progress for recovery
Round state for refresh resilience
Complete Flow Summary
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Home Page      │────▶│  Practice Start  │────▶│  Game Engine    │
│  (Click Play)   │     │  (Load 5 Images) │     │  (INIT/READY)   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                         │
        ┌────────────────────────────────────────────────┐
        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Round 1-5      │────▶│  Submit Guess    │────▶│  Calculate      │
│  (GameRoundPage)│     │  (Location+Year) │     │  Score/Distance │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
        ▲                                                   │
        └───────────────────────────────────────────────────┘
                           │
                           ▼
        ┌─────────────────┐     ┌──────────────────┐
        │  Round Results  │◀────│  Show Results      │
        │  (Breakdown)    │     │  (XP/Accuracy)   │
        └────────┬────────┘     └──────────────────┘
                 │
        ┌────────┴────────┐
        │  Round < 5 ?     │
        │  YES: Next Round  │
        │  NO: Final Results│
        └──────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Final Results  │
                  │  (Total Score)  │
                  └─────────────────┘



0. GLOBAL PRINCIPLES
0.1 Source of Truth

The rest of the document fully defines UI + UX behavior.

If implementation differs:
→ implementation is wrong

0.2 Viewport
App uses 100% width and height
Responsive layouts allowed
Scroll behavior is explicitly controlled per screen (see below)
0.3 Input Modes
Desktop: mouse
Mobile: touch

Behavior must be identical across devices.

0.4 Interaction Locking

During:

transitions
result evaluation

→ ALL inputs disabled
→ NO state mutation allowed

0.5 Color System
Primary color: ORANGE (default)
Used for:
CTA buttons
focus states
progress indicators

Must be theme-configurable.

0.6 Themes (MANDATORY)
LIGHT
DARK

Affects:

background
text
cards
map (if supported)

Constraint:
→ NO logic tied to theme

0.7 Localization (MANDATORY)

User selects:

UI language
Content language

Rules:

UI text = frontend controlled
Content = fetched per language
❌ NO silent fallback mixing
1. GAME PHASES

Each round:

IMAGE_PHASE (Cinematic)
GUESS_PHASE
RESULT_PHASE
2. IMAGE_PHASE (CINEMATIC)
2.1 Layout
Fullscreen image
No cropping (HARD RULE)

Scaling:

Fit width OR height
Overflow allowed
User can pan
2.2 Visible UI

Only:

timer (optional)
zoom controls
exit fullscreen button (bottom center, pulsing)
2.3 Behavior
Auto-pan LEFT → RIGHT
Duration: 5s
Linear speed
2.4 Interaction

Allowed:

interrupt cinematic
manual pan

Forbidden:

any input affecting game state

Event:

INTERRUPT_CINEMATIC
3. GUESS_PHASE
3.1 Layout
Desktop
LEFT  → Image
RIGHT → Cards (Map + Year)
BOTTOM RIGHT → Action Row
Mobile
[Image]
[Map Card]
[Year Card]
[Sticky Action Bar]
3.2 Scroll Rules

Allowed:

mobile Guess screen
Result screen
Final screen

Forbidden:

Cinematic phase
4. MAP SYSTEM
4.1 Initial State
Center: lat 20, lng 0
Zoom: world (~1)
4.2 Interaction

Allowed:

pan
zoom
search (repositions map only)
4.3 Marker Rules
Single marker only
Click/tap = place
Re-click = move
NOT draggable via drag

States:

Before:

no marker

After:

visible
represents user guess
5. YEAR INPUT (FIXED)
5.1 Component
Slider (horizontal)
Multi-scale:
CENTURY (default)
DECADE
YEAR

Switch via UI toggle or gesture.

5.2 Range
Defined externally (game config)
Step = 1 year
5.3 Default Value (CRITICAL FIX)

❌ Previous conflict removed

→ NO default value

Implication:

user must actively choose year
5.4 Display
Integer only
shown above slider
6. ACTION ROW
[Hints] [Settings] [Submit]

Rules:

Submit = primary (orange)
Others = secondary
Always visible
6.1 Submit Button Logic

Enabled ONLY if:

marker placed
year selected

Disabled:

dimmed
not clickable

On click:
→ RESULT_PHASE

Debounce required.

7. RESULT_PHASE
7.1 Layout

Scrollable vertical cards (NOT fullscreen-only map)

7.2 Card 1 — OVERALL
Circular progress
Animated increase (NOT static)

Haptics:

1% increment → 10ms pulse
7.3 Card 2 — WHERE
Map with:
guess marker
correct marker
line

Displays:

distance (km, rounded)
accuracy %
XP

Camera:

auto-fit bounds
20% padding
7.4 Card 3 — WHEN
Timeline comparison

Displays:

year difference (absolute)
accuracy
XP
7.5 Color Logic

Constraint:

Must reflect progression
Must be consistent

Implementation defined later.

8. TRANSITION

Button:

Next Round

Behavior:

manual only
no auto-advance
9. FINAL SCREEN
9.1 Layout

Scrollable card-based structure

9.2 Header
Total XP
Average Accuracy
WHERE aggregate
WHEN aggregate
9.3 Round Breakdown

Per round:

Image
Description
Guess vs correct (year + location)
Distance
Accuracy
XP
9.4 CTA
Play Again

→ triggers INIT

10. UI STATE
UIState = {
  yearSliderValue: number | null
  mapCursor: { lat: number; lng: number } | null

  mapSearchQuery: string

  yearScale: "YEAR" | "DECADE" | "CENTURY"

  modals: {
    hints: boolean
    settings: boolean
  }

  coachmarksEnabled: boolean

  isFullscreenImage: boolean

  theme: "LIGHT" | "DARK"

  languageUI: string
  languageContent: string
}
11. ANIMATION RULES

Allowed:

cinematic pan
map fit (300ms ease-out)
result progress animation

Everything else:
→ forbidden

12. EDGE CASES
No marker → cannot submit
Rapid clicks → debounced
Invalid round data:
→ skip
→ log
→ continue
13. FORBIDDEN
timers in GUESS_PHASE
randomness in UI
auto-submission
dynamic difficulty
hidden logic

Violation = system inconsistency

