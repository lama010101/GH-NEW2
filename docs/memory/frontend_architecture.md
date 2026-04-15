# Frontend Architecture

## Core Spec References

Frontend implementation MUST reference:
- `docs/core/EVENT_STREAM_SPEC.md` — Event consumption, state derivation
- `docs/core/PHASE_FSM_SPEC.md` — Phase rendering rules
- `docs/core/DETERMINISM_SPEC.md` — Client-side determinism (Practice Mode)

---

## Geo Data Policy

**Frontend MUST NEVER compute or mutate geo data.**

- The backend is the single source of truth for all location data
- Frontend consumes `location: { id, name, lat, lng }` from API responses only
- No geocoding API calls in frontend code
- No coordinate transformations or approximations
- No fallback logic when location data is missing - FAIL HARD
- Runtime validators must reject any payload without a valid `location` object

## Map Rendering

Map rendering is implemented as a **passive UI component** with no state ownership.

### GameMap Component

- **Location**: `src/components/GameMap.tsx`
- **Library**: react-leaflet v4 + Leaflet
- **Responsibilities**:
  - Render OpenStreetMap tiles
  - Handle click events to set guess location
  - Display marker at selected location (if any)
  - Error boundary for graceful failure

### Key Principles

1. **No State Ownership**: GameMap does NOT own any game state
2. **Read-Only Props**: Receives `guessLocation` and `onSetLocation` callback
3. **Unconditional Rendering**: Map renders in `ROUND_ACTIVE` phase without gating on event/location presence
4. **Debug Visibility**: Console logs at mount, update, and click events
5. **Fail Fast**: Error boundary displays "Map failed to render" instead of silent failure

### Integration Points

- **Rendered by**: `GuessLocationCard` in `game-client-parts.tsx`
- **Displayed in**: `RoundActiveScreen` when phase is `ROUND_ACTIVE`
- **State Source**: `currentGuess.location` from GameState (reducer-owned)

### CSS Requirements

Map container requires:
- `width: 100%`
- `aspect-ratio: 16 / 10` (or explicit height)
- `border-radius: 20px`
- `overflow: hidden`

### Dependencies

```json
{
  "react-leaflet": "^4.2.1",
  "leaflet": "^1.x",
  "@types/leaflet": "^1.x"
}
```
