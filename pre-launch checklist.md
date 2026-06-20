# PRE-LAUNCH CHECKLIST

## PROJECT: Guess-History (GH-NEW)
## STATUS: LIVING DOCUMENT — appended to as items are identified
## CREATED: 2026-06-19

---

## 0. PURPOSE

This file tracks decisions that are **acceptable now, at pre-launch /
pre-revenue stage, but become blockers before any commercial launch**
(public release, monetization, paid acquisition, or any point at which
GH-NEW stops being internal testing and starts being a product with
real users and/or revenue).

Items here are not bugs and not "someday" nice-to-haves. They are
**known, accepted risks with a deadline tied to a business event**
(commercial launch), not a calendar date. Each item must state:

- What was accepted, and why
- What the actual risk is
- What must happen before launch to close it
- Where in the codebase it lives

This file is read before any commercial launch decision. Nothing on
this list should still be open when that decision is made without an
explicit, conscious sign-off from the CTO/product owner.

---

## 1. OPEN ITEMS

### 1.1 Map tile provider — CARTO free-tier non-commercial license

**Status:** ACCEPTED RISK — OPEN
**Date added:** 2026-06-19
**Related task:** MP-IMPL-MAP-LANG-001 (CLOSED, commit `c0a8636`)

**What was accepted:**
`GameMap.tsx` and `StaticResultMap.tsx` use CARTO Voyager raster tiles
(`basemaps.cartocdn.com/rastertiles/voyager`) to render English-language
map labels, replacing raw OpenStreetMap tiles. No API key required;
free, immediately working, visually confirmed by Lolo.

**The actual risk:**
CARTO's published basemaps terms (carto.com/basemaps) state that
commercial use requires an Enterprise license. GH-NEW is currently
pre-revenue/internal testing, so this was accepted as a reasonable
risk for the current stage. It is **not** licensed for a commercial,
publicly launched, monetized product as currently implemented.

**What must happen before commercial launch:**
Move to a paid CARTO plan, OR migrate to MapTiler (also confirmed to
require a paid/non-free-tier plan for commercial use — see MapTiler's
own pricing terms), OR self-host tile rendering. This is a vendor
selection + billing setup task, not a code change in itself, though it
will require updating the `TileLayer` URL again at that time.

**Where it lives:**
- `src/components/GameMap.tsx`
- `src/components/StaticResultMap.tsx`

**Resolution:** Not yet started. Revisit when a commercial launch date
is set.

---

## 2. FUTURE / DEFERRED FEATURE WORK (not blockers, but related)

Items in this section are not launch blockers — they're scoped-out
work intentionally deferred during a related task, listed here so they
aren't lost. Move an item to Section 1 only if it becomes an actual
launch blocker.

### 2.1 Map label language toggle (local / English)

**Status:** DEFERRED — not started
**Date added:** 2026-06-19
**Related task:** MP-IMPL-MAP-LANG-001

Legacy (`lama010101/guess-history`) had a working `local`/`en` toggle:
a Zustand store field (`mapLabelLanguage`), persisted to Supabase via
`setFromUserSettings`/`syncToSupabase`, exposed as a radio control in
Settings, and read by both the map `TileLayer` and the Nominatim
geocoding client to switch `accept-language`.

GH-NEW's current implementation (MP-IMPL-MAP-LANG-001) hardcodes
English only — no store field, no Supabase column, no Settings UI —
by deliberate scope decision, shaped so the toggle can be added later
without restructuring the tile-selection logic itself.

**When picked up, this task will need:**
- New Zustand store field (`mapLabelLanguage: 'local' | 'en'`)
- Supabase settings column + sync logic
- Settings UI radio control
- Branch logic already exists in `TileLayer` url construction — only
  needs the hardcoded string replaced with the store value

**Not a launch blocker** — English-only is an acceptable permanent
default if never revisited. Purely a UX nice-to-have.

---

## 3. HOW TO USE THIS FILE

- New accepted-risk items go in Section 1, using the same template
  (what was accepted / actual risk / what closes it / file locations).
- Each item must be referenced in `userMemories` or `PROGRESS.md` at
  the time it's created, with a pointer back to this file, so it isn't
  only discoverable by someone who already knows to look here.
- Before setting any commercial launch date, this entire file must be
  reviewed top to bottom. Every Section 1 item must be either resolved
  or explicitly re-accepted with a documented reason.
