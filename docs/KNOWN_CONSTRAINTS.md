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
  grep -n "sheetFieldWrap" src/components/compete/RoundActiveSection.module.css | grep "z-index: 1001"
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
