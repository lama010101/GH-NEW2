# HOME PAGE SPEC
**Project:** Guess-History  
**Document:** HOME_PAGE_SPEC.md  
**Version:** 1.0  
**Status:** AUTHORITATIVE  
**Date:** 2026-04-28  

---

## 0. Document Authority

This document defines the complete UI, UX, and behavioral specification for the Guess-History home page. Any implementation that deviates from this spec is wrong. All four mode cards, the background system, the top bar, and the info panel are covered here.

Binding references:
- `docs/GUESS_HISTORY_MASTER_SPEC.md` — game mode architecture
- `docs/CORE_UI_AND_FEATURES.md` — Practice mode flow
- `docs/STATS_SYSTEM.md` — XP and level data

---

## 1. Layout Overview

The home page is a **single full-viewport screen**. There is no scroll. All content fits within 100vh × 100vw.

```
┌─────────────────────────────────────────────┐
│  TOP BAR   [XP Pill]           [Bell][Avatar]│
│                                              │
│           GUESS-HISTORY                      │
│                                              │
│  [DAILY] [PRACTICE] [LEVEL UP] [COMPETE]     │  ← Mode cards (carousel)
│                                              │
│  [INFO PANEL — contextual, slides in/out]    │
└─────────────────────────────────────────────┘
```

**Background:** Full-bleed collage of historical photographs (see Section 3).  
**Foreground layers (z-order, bottom to top):** background mosaic → dark overlay → content.

---

## 2. Top Bar

### 2.1 Layout

Single horizontal bar, full width, sits at the top of the content layer. Two zones: left (XP pill) and right (bell + avatar).

### 2.2 XP Pill (left)

Displays the authenticated player's current stats. Two values separated by a vertical divider:

| Element | Content | Style |
|---|---|---|
| Accuracy | Player's global accuracy percentage, integer only, e.g. `37 %` | White, 12–13px, weight 500 |
| Divider | `\|` | Muted, low opacity |
| XP | Total XP formatted with thousands separator, e.g. `59 325 XP` | Gold/amber tint (#f0c060), 12–13px, weight 500 |

The pill has a semi-transparent background (`rgba(255,255,255,0.09)`), a 0.5px white border at low opacity, and a pill border radius (20px).

**No chevron/arrow button next to the XP pill.** The pill is display-only. A future leaderboard entry point will be defined in a separate spec when that feature is scoped.

### 2.3 Right Zone

Two elements, left to right:

**Bell icon** — notification access. Circular button, same semi-transparent treatment as the XP pill. Bell SVG icon, white at 65% opacity.

**Avatar** — circular player profile photo or initials fallback. 30–32px diameter. 1.5px white border at 28% opacity.

---

## 3. Background — Historical Photo Mosaic

### 3.1 Purpose

Full-bleed decorative background built from a grid of cropped historical photographs. Provides thematic atmosphere. Must never distract from foreground content.

### 3.2 Grid Specification

- **Grid:** 5 columns × 3 rows = 15 cells
- **Gap:** 3px between cells
- **Coverage:** 100% of viewport width and height (absolute positioned, `inset: 0`)
- **Images:** Sourced from the historical events image pool (same pool used in gameplay). Images are cropped to fill their cell (object-fit: cover). Cells do not need uniform aspect ratios — natural overflow is acceptable.
- **Image assignment:** Random at page load. Images should be varied — no two adjacent cells showing the same event or era.

### 3.3 Dark Overlay

A single full-bleed overlay sits on top of the mosaic. Gradient: `rgba(0,0,0,0.28)` at top → `rgba(0,0,0,0.60)` at bottom. Opacity of the mosaic itself: `0.32–0.35`. The combined effect makes the mosaic readable as texture but never as individual identifiable images — it is ambiance, not content.

### 3.4 Fallback

If images are unavailable (preflight failure, network issue), cells fall back to dark muted fills in varying warm/cool tones. The overlay and grid structure remain intact. The page must never appear broken due to image load failure.

---

## 4. Logo

Centered horizontally between the top bar and the mode cards.

- Text: `GUESS-HISTORY`
- Font: app default sans-serif, weight 700, ~24–26px, letter-spacing 1px
- Color split:
  - `GUESS-` → white
  - `HIS` → purple (`#c084fc`)
  - `TORY` → orange (`#fb923c`)
- Text shadow: `0 2px 8px rgba(0,0,0,0.5)` for legibility over background

---

## 5. Mode Cards

### 5.1 Layout

Four cards displayed in a **horizontal row**, equal flex width, with 8–10px gap. On mobile, this becomes a **swipeable horizontal carousel** where the active card is centered and adjacent cards are partially visible (~20px peeking in from each side).

### 5.2 Card Anatomy

Each card consists of two stacked zones:

**Art zone (top):** Square aspect ratio (1:1). Gradient background specific to the mode. Contains a 3D-style icon SVG at ~66% of the zone width, centered, with a subtle drop shadow. May contain additional in-art elements (badges, indicators).

**Label zone (bottom):** Colored background (darker shade of the mode's gradient). Two lines of text, centered:
- Mode name: 10–11px, weight 700, all caps, letter-spacing 1.1px, white
- Mode subtitle: 8.5–9px, weight 500, all caps, letter-spacing 0.7px, white at 65% opacity

### 5.3 Selection State

- **Default:** no visible selection ring
- **Selected:** `outline: 2px solid rgba(255,255,255,0.55)`, card translates up 3px (`translateY(-3px)`)
- **Tap/click active:** `scale(0.97)` briefly
- Only one card can be selected at a time
- On page load, **Practice** is selected by default

### 5.4 Mode: Daily

| Property | Value |
|---|---|
| Art background | Dark blue gradient: `#0d2a50` → `#1a3f7a` |
| Label background | `#0d2040` |
| Icon | 3D calendar with clock indicator showing today's date highlighted |
| In-art badge | `LIVE` — red pill (`#ef4444`), top-right corner of art zone, 7.5px uppercase |
| Mode name | DAILY |
| Subtitle | TODAY'S CHALLENGE |

### 5.5 Mode: Practice

| Property | Value |
|---|---|
| Art background | Orange gradient: `#7c3a0a` → `#d96b1a` |
| Label background | `#6a3008` |
| Icon | 3D target/bullseye with arrow |
| Mode name | PRACTICE |
| Subtitle | SOLO WARM-UP |

### 5.6 Mode: Level Up

| Property | Value |
|---|---|
| Art background | Purple gradient: `#4a1a7a` → `#9b4dca` |
| Label background | `#3a1060` |
| Icon | 3D upward arrow / rocket emerging from a platform |
| In-art badge | Current level pill, e.g. `Level 5` — centered, bottom of art zone, semi-transparent white pill |
| Mode name | LEVEL UP |
| Subtitle | PROGRESSIVE RUNS |

### 5.7 Mode: Compete

| Property | Value |
|---|---|
| Art background | Teal gradient: `#0a4a3a` → `#1a9a7a` |
| Label background | `#093a2a` |
| Icon | 3D figures (players) with a trophy |
| Mode name | COMPETE |
| Subtitle | FRIENDS LOBBY |

---

## 6. Info Panel

### 6.1 Behavior

The info panel sits directly below the cards row. It is **hidden by default** and **slides in with a transition** when a card is selected. Transition: `max-height 0 → auto` with `opacity 0 → 1` over 280–300ms ease. When switching cards, the panel fades out (180ms), content swaps, then fades back in.

The panel is **contextual** — its content is entirely determined by the selected mode. See Sections 6.2–6.5.

### 6.2 Daily Panel

Displayed when Daily card is selected.

**Content (top to bottom):**

1. **Countdown line:** Small pulsing red dot + text: `Today's challenge resets in Xh Ym`. Time is live-updated every minute. Text color `#93c5fd`.
2. **CTA button:** `Play Today's Challenge` — full width, blue gradient, rounded (10px radius).

**Rules:**
- If the player has already completed today's challenge, the CTA button changes to `View Today's Results` and is non-destructive (navigates to the completed result view, does not start a new game).
- No settings. Daily parameters are fixed server-side and not configurable by the player.

### 6.3 Practice Panel

Displayed when Practice card is selected.

**Content (top to bottom):**

1. **Round Timer toggle row:** Toggle (on/off) + label `Round Timer` + current value (e.g. `2:00`). When toggled off, the value is hidden. When toggled on, a time selector appears inline.
2. **Year Range toggle row:** Toggle (on/off) + label `Year Range` + two values for start and end year (e.g. `655 — 2025`), both in orange. When toggled off, defaults to full range (`-100 — current year`).
3. **Start button:** `Start Practice` — full width, orange gradient, rounded.

**Rules:**
- Default state: both toggles on. Default timer: 2:00. Default year range: full range.
- Settings are persisted to localStorage and restored on next visit.
- Year range values are tappable/clickable and open an inline picker (spec for picker deferred to Practice Mode Spec).
- Timer value is tappable/clickable and opens an inline time picker (spec deferred to Practice Mode Spec).

### 6.4 Level Up Panel

Displayed when Level Up card is selected.

**Content (top to bottom):**

1. **Level line:** `Level X → Level X+1` left-aligned. Right-aligned: `Min accuracy to pass: Y%` in muted white.
2. **Progress bar:** Horizontal bar showing progress within the current level (games played toward next promotion threshold). Purple fill, full width.
3. **Difficulty pills row:** Three equal pills side by side showing the fixed parameters for the current level:
   - `Year Range` + value (e.g. `1776–2025`)
   - `Timer` + value (e.g. `4:30`)
   - `Rounds` + value (always `5`)
4. **Start button:** `Start Level X` — full width, purple gradient, rounded.

**Rules:**
- All parameters in this panel are **read-only**. The player cannot change them. The game sets them based on the current level.
- If the player has not yet started Level Up mode, show Level 1 parameters and `Start Level 1`.

### 6.5 Compete Panel

Displayed when Compete card is selected.

**Content (top to bottom):**

1. **Option selector:** Two equal-width option buttons side by side:
   - `Create lobby` / `New game`
   - `Join with code` / `Enter code`
   - Only one can be active at a time. Active state: teal-tinted background + teal border. Default: Create lobby.
2. **CTA button:** `Go to Lobby` — full width, teal gradient, rounded.

**Rules:**
- Selecting `Join with code` reveals a code input field between the option selector and the CTA button. The code input is a single-line text field, centered, uppercase, max 8 characters.
- `Go to Lobby` is disabled (dimmed, non-clickable) when `Join with code` is selected and the input is empty.
- Navigates to `/compete` route.

---

## 7. Navigation Behavior

| Action | Destination |
|---|---|
| Daily → Play Today's Challenge | `/daily` (daily game session) |
| Practice → Start Practice | Triggers preflight → `/practice/game/room/{roomId}/round/1` |
| Level Up → Start Level X | Triggers preflight → `/levelup/game/{sessionId}/round/1` |
| Compete → Go to Lobby (create) | `/compete` (creates new session) |
| Compete → Go to Lobby (join) | `/compete/{gameId}` (joins existing session) |
| Bell icon | `/notifications` |
| Avatar | `/profile` |

---

## 8. Authenticated vs Unauthenticated State

| State | Behavior |
|---|---|
| Authenticated | Full home page as described above |
| Unauthenticated | Home page renders identically but CTAs redirect to `/login?return=<mode>`. XP pill shows `-- % \| -- XP`. |

Guest play is **not supported** in this version. All modes require authentication.

---

## 9. Responsive Behavior

| Breakpoint | Layout |
|---|---|
| Desktop (≥ 768px) | All 4 cards visible simultaneously in a row, equal width |
| Mobile (< 768px) | Horizontal carousel: center card full-width-minus-padding, adjacent cards peek 20px on each side. Swipe gesture advances selection and updates info panel. |

On mobile, the info panel is fixed below the carousel. It does not scroll with the card swipe.

---

## 10. Performance Requirements

- Background mosaic images must be lazy-loaded. The overlay and card content render immediately regardless of image load state.
- Info panel content is rendered eagerly for all four modes (not lazy) — switching panels must be instantaneous with no loading state.
- The countdown timer for Daily updates client-side every 60 seconds. No network call required for the countdown.

---

## 11. Forbidden Patterns

- No hero marketing copy on the home page.
- No stats, history, or recent games shown on the home page at this stage.
- No auto-advancing carousel animation. Card selection is always manual.
- No chevron or arrow button in the XP pill or adjacent to it.
- No default year selected on the Practice year range picker — the player must actively set values.
- No modal overlays on the home page. All contextual content uses the inline info panel only.

---

## 12. Mode Behavioral Summary

| Mode | Parameters Set By | Min Accuracy Required | Session Type |
|---|---|---|---|
| Daily | Server (fixed per day) | None — participation only | Solo, server-seeded |
| Practice | Player (timer + year range) | None | Solo, client-configured |
| Level Up | System (per level formula) | Yes — must pass to advance | Solo, system-configured |
| Compete | Host (in lobby) | None | Multiplayer, lobby-configured |

---

## 13. Level Up Mode — Difficulty Formula

Level Up parameters scale deterministically with level number. The formula is authoritative:

| Parameter | Formula | Level 1 Example | Level 10 Example | Level 100 Example |
|---|---|---|---|---|
| Year range width | `200 + (level × 18)` years, centered on 2025 | 218 years (1807–2025) | 380 years (1645–2025) | 2000 years (25–2025) |
| Timer (seconds) | `300 - (level × 2)`, minimum 60s | 298s (≈ 5:00) | 280s (≈ 4:40) | 100s (≈ 1:40) |
| Min accuracy to pass | `50 + (level × 0.3)`%, capped at 80% | 50.3% | 53% | 80% |
| Rounds per game | Always 5 | 5 | 5 | 5 |

These values are computed server-side at session creation. The client displays them read-only. The coder must not hardcode level parameters — they must always be derived from the formula.

---

*Spec version 1.0 — Guess-History Home Page — authored 2026-04-28*
