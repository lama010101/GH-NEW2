# CORE_GAME Implementation Plan

## Overview
This document provides a step-by-step implementation plan for the Practice Mode game based on the Master Spec.

---

## Phase 1: Project Setup & Dependencies

### 1.1 Required Packages
- **React 18** (already installed via Vite)
- **Tailwind CSS** (already installed)
- **Leaflet** or **Mapbox GL JS** - for interactive maps
- **@react-leaflet/core** - React bindings for Leaflet (if using Leaflet)
- **date-fns** - for date/year handling
- **zustand** or **Redux Toolkit** - for state management
- **i18next** - for internationalization

### 1.2 Project Structure
```
src/
├── components/
│   ├── common/           # Reusable UI components
│   ├── game/             # Game-specific components
│   ├── map/              # Map-related components
│   └── ui/               # Theme-aware UI elements
├── hooks/                # Custom React hooks
├── stores/               # State management stores
├── services/             # API calls, persistence
├── utils/                # Pure utility functions
├── types/                # TypeScript type definitions
├── constants/            # Game constants
├── locales/              # Translation files
├── assets/               # Static assets
└── styles/               # Global styles
```

---

## Phase 2: Core Architecture

### 2.1 Type Definitions (`src/types/game.ts`)
```typescript
// State Lifecycle
type GameState = 
  | 'INIT'
  | 'PREFLIGHT_CHECK'
  | 'READY'
  | 'ROUND_START'
  | 'ROUND_ACTIVE'
  | 'ROUND_LOCK'
  | 'ROUND_EVALUATE'
  | 'ROUND_COMPLETE'
  | 'SESSION_COMPLETE';

// Event Model
interface GameEvent {
  id: string;
  title: string;
  description: string;
  year: number;
  latitude: number;
  longitude: number;
  imageUrl: string;
  metadata: Record<string, any>;
}

// Player State
interface PlayerState {
  hintsUsed: string[];
  hintPenalty: number;
  totalXP: number;
  roundResults: RoundResult[];
}

// Round State
interface RoundState {
  roundNumber: number;
  event: GameEvent | null;
  selectedYear: number | null;
  selectedLocation: { lat: number; lng: number } | null;
  timer: number;
  isCinematic: boolean;
  result: RoundResult | null;
}

// Session State
interface SessionState {
  id: string;
  maxRounds: number;
  yearRange: { min: number; max: number };
  settings: GameSettings;
}

// Round Result
interface RoundResult {
  roundNumber: number;
  eventId: string;
  yearAccuracy: number;
  locationAccuracy: number;
  overallAccuracy: number;
  xpEarned: number;
  hintPenaltyApplied: number;
  timeTaken: number;
}

// Game Settings
interface GameSettings {
  timerEnabled: boolean;
  autoPanEnabled: boolean;
  hintsEnabled: boolean;
  minYear: number;
  maxYear: number;
}
```

### 2.2 Constants (`src/constants/game.ts`)
```typescript
export const GAME_CONSTANTS = {
  MAX_ROUNDS: 5,
  REPEAT_PROTECTION_BUFFER: 500,
  AUTOPAN_DURATION_SEC: 5,
  TIMER_MIN_SEC: 5,
  TIMER_MAX_SEC: 300,
  HINT_TOTAL: 12,
  MAX_HINT_PENALTY: 1.0,
} as const;
```

---

## Phase 3: State Management

### 3.1 Game Store (`src/stores/gameStore.ts`)
Use Zustand for global state management:

```typescript
interface GameStore {
  // State
  gameState: GameState;
  session: SessionState | null;
  round: RoundState;
  player: PlayerState;
  ui: UIState;
  theme: 'light' | 'dark';
  uiLanguage: string;
  contentLanguage: string;
  
  // Actions
  initializeGame: (settings: GameSettings) => Promise<void>;
  startRound: (roundNumber: number) => void;
  submitAnswer: () => void;
  useHint: (hintId: string) => void;
  selectYear: (year: number) => void;
  selectLocation: (coords: { lat: number; lng: number }) => void;
  nextRound: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setLanguages: (uiLang: string, contentLang: string) => void;
}
```

### 3.2 State Lifecycle Management
Create a state machine to enforce valid transitions:
- `INIT` → `PREFLIGHT_CHECK` → `READY` → `ROUND_START`
- `ROUND_START` → `ROUND_ACTIVE` → `ROUND_LOCK` → `ROUND_EVALUATE` → `ROUND_COMPLETE`
- `ROUND_COMPLETE` → `ROUND_START` (next round) OR `SESSION_COMPLETE`

---

## Phase 4: Core Services

### 4.1 Event Service (`src/services/eventService.ts`)
```typescript
interface EventService {
  fetchEvents: (params: {
    yearRange: { min: number; max: number };
    excludeIds: string[];
    limit: number;
    language: string;
  }) => Promise<GameEvent[]>;
  
  getEvent: (id: string, language: string) => Promise<GameEvent>;
  
  getRecentlyPlayed: (count: number) => Promise<string[]>;
}
```

### 4.2 Evaluation Engine (`src/services/evaluationEngine.ts`)
Pure functions for scoring (no state):

```typescript
interface EvaluationEngine {
  evaluateYear: (guess: number, actual: number): number; // returns accuracy 0-1
  evaluateLocation: (guess: {lat, lng}, actual: {lat, lng}): number; // returns accuracy 0-1
  calculateDistanceKm: (a: {lat, lng}, b: {lat, lng}): number;
  calculateXP: (accuracy: number, baseXP: number, hintPenalty: number): number;
  applyHintPenalty: (hintsUsed: string[]): number;
}
```

### 4.3 Persistence Service (`src/services/persistenceService.ts`)
```typescript
interface PersistenceService {
  saveRoundResult: (result: RoundResult) => Promise<void>;
  saveSessionSummary: (session: SessionState, results: RoundResult[]) => Promise<void>;
  getRepeatProtectionHistory: (count: number) => Promise<string[]>;
  saveSessionRecoveryData: (data: any) => Promise<void>;
  getSessionRecoveryData: () => Promise<any | null>;
}
```

---

## Phase 5: UI Components

### 5.1 Screen Components

#### 5.1.1 Settings Screen (`src/components/game/SettingsScreen.tsx`)
- Timer visibility toggle
- Auto-pan toggle
- Hints toggle
- Year range slider (min/max)
- Language selectors (UI language, Content language)
- Theme toggle
- "Start Game" CTA button

#### 5.1.2 Preflight Screen (`src/components/game/PreflightScreen.tsx`)
- Loading indicators for:
  - Connectivity check
  - Storage check
  - Event availability check
- Error states with retry

#### 5.1.3 Round Screen (`src/components/game/RoundScreen.tsx`)
Composite component with phases:

**Cinematic Phase:**
- Full-screen image display
- Auto-pan animation (if enabled)
- Manual pan/drag allowed
- "Skip" button to proceed to input

**Input Phase:**
- Year slider (no default value)
- Interactive map (click to place marker, no dragging)
- Hint panel (if hints enabled)
- Submit button (disabled until both inputs provided)
- Timer display (outside input surface)

**Result Phase:**
- Round result display
- Accuracy breakdown (year, location)
- XP earned
- Hint penalty applied
- "Next Round" button

#### 5.1.4 Session Complete Screen (`src/components/game/SessionCompleteScreen.tsx`)
- Final accuracy (average of all rounds)
- Total XP earned
- Round-by-round breakdown
- Performance summary
- "Play Again" button

### 5.2 Common Components

#### 5.2.1 Timer Component (`src/components/common/Timer.tsx`)
- Displays remaining time
- Visual urgency indicators (color changes)
- Theme-aware styling

#### 5.2.2 Year Slider (`src/components/common/YearSlider.tsx`)
- Range input with year labels
- No default value
- Clear visual indicator when selected

#### 5.2.3 Map Component (`src/components/map/InteractiveMap.tsx`)
- Leaflet/Mapbox integration
- Click-to-place marker
- No draggable markers
- Theme-aware tile styles
- Auto-pan functionality

#### 5.2.4 Hint Panel (`src/components/game/HintPanel.tsx`)
- Displays available hints
- Shows dependencies
- Tracks used hints
- Shows penalty impact

#### 5.2.5 Theme Provider (`src/components/ui/ThemeProvider.tsx`)
- Light/Dark mode switching
- Primary color configuration
- CSS variable management

---

## Phase 6: Game Logic Implementation

### 6.1 Initialization Flow
1. User configures settings
2. Run preflight checks (blocking)
   - Check network connectivity
   - Check localStorage availability
   - Fetch event pool to ensure availability
3. Select 5 events:
   - Apply year range filter
   - Exclude recently played (repeat protection)
   - Ensure no duplicates
4. Preload first round assets
5. Transition to READY state

### 6.2 Round Flow
1. **ROUND_START**: Begin cinematic reveal
   - Show event image
   - Start auto-pan (if enabled)
   - Timer starts counting down
2. **ROUND_ACTIVE**: Input phase
   - User selects year
   - User places marker on map
   - User can use hints
   - User submits (or timer expires)
3. **ROUND_LOCK**: Disable all inputs
4. **ROUND_EVALUATE**: Calculate results
   - Evaluate year accuracy
   - Evaluate location accuracy
   - Apply hint penalties
   - Calculate XP
5. **ROUND_COMPLETE**: Show results
   - Display accuracy scores
   - Show XP earned
   - Wait for manual "Next" action

### 6.3 Hint System
- 12 total hints available
- Dependency graph for hints
- Penalty calculation: each hint reduces reward
- Cap at MAX_HINT_PENALTY (100%)
- Penalties applied independently to accuracy and XP

### 6.4 Timer System
- Starts at round beginning
- Never pauses
- Auto-submits when reaches 0
- Missing inputs treated as absent

---

## Phase 7: Evaluation Engine Details

### 7.1 Year Accuracy Calculation
```typescript
function evaluateYear(guess: number, actual: number): number {
  const diff = Math.abs(guess - actual);
  // Example: 100% accuracy at 0 years off, linearly decreasing
  // 0% accuracy at 50+ years off
  const accuracy = Math.max(0, 1 - (diff / 50));
  return accuracy;
}
```

### 7.2 Location Accuracy Calculation
```typescript
function evaluateLocation(guess: {lat, lng}, actual: {lat, lng}): number {
  const distance = calculateDistanceKm(guess, actual);
  // Example: 100% accuracy at 0km, linearly decreasing
  // 0% accuracy at 1000+ km off
  const accuracy = Math.max(0, 1 - (distance / 1000));
  return accuracy;
}
```

### 7.3 Overall Accuracy
```typescript
function calculateOverallAccuracy(yearAcc: number, locAcc: number): number {
  return (yearAcc + locAcc) / 2;
}
```

### 7.4 XP Calculation
```typescript
function calculateXP(accuracy: number, baseXP: number, hintPenalty: number): number {
  const xpBeforePenalty = accuracy * baseXP;
  const xpAfterPenalty = Math.max(0, xpBeforePenalty * (1 - hintPenalty));
  return Math.floor(xpAfterPenalty);
}
```

---

## Phase 8: Internationalization

### 8.1 UI Localization
- Use i18next for UI strings
- Separate translation files per language
- Language selector in settings

### 8.2 Content Localization
- Event descriptions fetched per language
- No silent fallback mixing
- Show error if content unavailable in selected language

### 8.3 Translation Structure
```
src/locales/
├── en/
│   ├── ui.json
│   └── common.json
├── fr/
│   ├── ui.json
│   └── common.json
└── de/
    ├── ui.json
    └── common.json
```

---

## Phase 9: Theme System

### 9.1 Theme Configuration
```typescript
const THEMES = {
  light: {
    primary: '#FF8C00', // Orange
    background: '#FFFFFF',
    text: '#1A1A1A',
    card: '#F5F5F5',
    mapTiles: 'light-style',
  },
  dark: {
    primary: '#FFA500', // Lighter orange for dark mode
    background: '#1A1A1A',
    text: '#FFFFFF',
    card: '#2D2D2D',
    mapTiles: 'dark-style',
  },
};
```

### 9.2 CSS Variables
Use CSS custom properties for theme values:
```css
:root[data-theme='light'] {
  --color-primary: #FF8C00;
  --color-background: #FFFFFF;
  /* etc */
}
```

---

## Phase 10: Persistence

### 10.1 Local Storage Schema
```typescript
interface LocalStorageData {
  repeatProtection: {
    eventIds: string[];
    timestamps: number[];
  };
  sessionRecovery: {
    sessionId: string;
    currentRound: number;
    playerState: PlayerState;
    timestamp: number;
  } | null;
  settings: {
    theme: 'light' | 'dark';
    uiLanguage: string;
    contentLanguage: string;
    gameSettings: GameSettings;
  };
}
```

### 10.2 Save Points
- After each round evaluation (round result)
- After session completion (session summary)
- Atomic writes per round

---

## Phase 11: Hard Constraints Checklist

### Gameplay Constraints
- [ ] No auto-submit (except timeout)
- [ ] No auto-advance rounds
- [ ] No timer pause
- [ ] No partial submission
- [ ] No round start without ready assets
- [ ] No randomness after initialization

### UI Constraints
- [ ] No image cropping
- [ ] No hidden defaults (year slider, marker)
- [ ] No implicit inputs
- [ ] No draggable markers
- [ ] No timers in input UI

### System Constraints
- [ ] No state mutation outside core docs
- [ ] No XP/Accuracy coupling
- [ ] No parallel scoring systems
- [ ] All behavior documented

---

## Phase 12: Testing Strategy

### 12.1 Unit Tests
- Evaluation engine functions
- Hint penalty calculations
- Distance calculations
- State transitions

### 12.2 Integration Tests
- Full round flow
- Timer behavior
- Hint system
- Persistence layer

### 12.3 E2E Tests
- Complete session flow
- Settings persistence
- Theme switching
- Language switching

---

## Phase 13: Implementation Order

### Sprint 1: Foundation
1. Set up project structure
2. Install dependencies
3. Create type definitions
4. Set up state management
5. Implement constants

### Sprint 2: Core Services
1. Event service (mock backend)
2. Evaluation engine
3. Persistence service
4. State lifecycle management

### Sprint 3: Basic UI
1. Theme provider
2. Settings screen
3. Preflight screen
4. Common components (timer, slider)

### Sprint 4: Map Integration
1. Map component setup
2. Click-to-place marker
3. Auto-pan functionality
4. Theme-aware styling

### Sprint 5: Round Flow
1. Cinematic phase
2. Input phase
3. Submission logic
4. Result display

### Sprint 6: Hint System
1. Hint panel component
2. Dependency system
3. Penalty calculation
4. Integration with evaluation

### Sprint 7: Session Management
1. Session complete screen
2. Results aggregation
3. Persistence integration
4. Recovery system

### Sprint 8: Polish
1. Internationalization
2. Theme refinement
3. Error handling
4. Accessibility
5. Performance optimization

### Sprint 9: Testing
1. Unit tests
2. Integration tests
3. E2E tests
4. Bug fixes

### Sprint 10: Final Review
1. Constraint verification
2. Documentation
3. Code cleanup
4. Build verification

---

## Phase 14: Mock Data & Backend Integration

### 14.1 Mock Event Data
Create a mock dataset for development:
```typescript
const MOCK_EVENTS: GameEvent[] = [
  {
    id: 'event-1',
    title: 'Example Event',
    description: 'Event description',
    year: 1969,
    latitude: 40.7128,
    longitude: -74.0060,
    imageUrl: '/images/event-1.jpg',
    metadata: {},
  },
  // ... more events
];
```

### 14.2 Backend API Contract
Define expected API endpoints:
- `GET /api/events?minYear=&maxYear=&excludeIds=&limit=&lang=`
- `GET /api/events/:id?lang=`
- `POST /api/results/round`
- `POST /api/results/session`
- `GET /api/history/recent?count=`

---

## Phase 15: Performance Considerations

### 15.1 Asset Preloading
- Preload next round image during current round
- Preload map tiles for expected regions
- Cache event data locally

### 15.2 State Optimization
- Memoize expensive calculations
- Debounce map interactions
- Virtualize long lists (if needed)

### 15.3 Bundle Size
- Code splitting per screen
- Lazy load map library
- Optimize images

---

## Success Criteria

1. **Functional**: All game flows work as specified
2. **Deterministic**: Same inputs produce same outputs
3. **Accurate**: Scoring matches specification exactly
4. **Responsive**: Works on desktop and mobile
5. **Accessible**: Keyboard navigation, screen reader support
6. **Performant**: Smooth 60fps, fast load times
7. **Maintainable**: Clean code, good documentation
8. **Testable**: Comprehensive test coverage

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Map API complexity | Start with simple Leaflet, upgrade later |
| State complexity | Use strict state machine, extensive tests |
| Timing issues | Use requestAnimationFrame for timer |
| Persistence failures | Graceful degradation, local fallback |
| Localization gaps | Comprehensive string extraction, testing |

---

## Notes

- This plan assumes a single developer or small team
- Timeline estimates are rough; adjust based on complexity
- Prioritize core gameplay over polish in early sprints
- Maintain strict adherence to hard constraints throughout
- Document any deviations from spec immediately
