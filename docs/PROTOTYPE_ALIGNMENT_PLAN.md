# GUESS-HISTORY — PROTOTYPE ALIGNMENT PLAN
**Project:** GUESS-HISTORY
**Task ID:** MP-PLAN-PROTOTYPE-ALIGN-001
**Version:** 1.0
**Created:** 2026-06-19
**Status:** ACTIVE

---

## 0. DOCUMENT AUTHORITY

### Scope
This plan audits TWO SCREENS ONLY:
1. **LOBBY**: Prototype at `src/app/prototype/lobby/page.tsx` vs Live at `src/components/compete/LobbySection.tsx`
2. **ROUND RESULTS**: Prototype at `src/app/prototype/round-results/page.tsx` + `round-results.module.css` vs Live at `src/components/compete/RoundCompleteSection.tsx` + `RoundCompleteSection.module.css` + `WhereCard.tsx`/`WhereCard.module.css` + `WhenCard.tsx`/`WhenCard.module.css`

### Exclusions (DO NOT PROPOSE CHANGES)
- **RainbowRing.tsx** — Locked accuracy/% ring component, do not touch
- **Scoring, badge evaluation, game logic** — Visual/layout only
- **SessionComplete.tsx** — Final results screen, separate screen, out of scope
- **Backend, API, PartyKit, sessionCore files** — Out of scope

### Pre-Existing Aligned Tokens (DO NOT RE-FLAG)
Per MP-FIX-CARD-TOKENS-002 and MP-FIX-WHERE-COLOR-001, the following are already aligned and should NOT be re-flagged:
- Glass card background: `linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))`
- Glass card border: `rgba(255,255,255,0.1)`
- Glass card radius: `18px`
- Glass card blur: `blur(10px)`
- Glass card shadow: `0 8px 30px rgba(0,0,0,0.35)`
- WHERE card border: `rgba(59,130,246,0.8)` (blue per MP-FIX-WHERE-COLOR-001)
- WHEN card border: `rgba(139,92,246,0.8)` (violet)

---

## 1. STRUCTURED DIFF: LOBBY SCREEN

| Element | Prototype State | Live State | Gap Type | Severity |
|---------|-----------------|-----------|----------|----------|
| **OVERALL LAYOUT** | | | | |
| Proto bar | Present: "Compete Lobby — Prototype" + "Mock data · host = you" at top (z-index 60, rgba(10,10,12,0.6) bg, blur 8px) | Absent | extra-element-not-in-prototype | low |
| Scroll container max-width | `max-width: 520px; margin: 0 auto;` (single column) | No explicit max-width on shell; grid uses `max-width: 1320px` on dock only; two-column grid layout on desktop (`grid-template-columns: 1fr 1fr`) | structural-layout | med |
| Scroll padding | `padding: 56px 16px calc(120px + env(safe-area-inset-bottom))` | Implicit padding via header + grid + dock spacing | structural-layout | low |
| Card gap | `gap: 16px` between cards in scroll | `.lobby-grid { gap: 16px; }` | cosmetic-token | low |
| **HEADER** | | | | |
| Header layout | Flex column: back btn + mode badge + status chip on top row, title centered below | Grid 3-col: back btn (left) \| mode badge (center) \| status chip (right), title centered below | structural-layout | med |
| Card title (in card heads) | `font-size: 16px; font-weight: 700;` | `.lobby-subsection-title { font-size: var(--font-sm); font-weight: 600; }` (~14px/600) | cosmetic-token | med |
| Mode badge | `font-size: 11px; font-weight: 800;` | `.lobby-mode-badge { font-size: 12px; font-weight: 800; }` | cosmetic-token | low |
| **INVITE CARD** | | | | |
| Card structure | Separate card, only visible if `isHost` | Merged into `.lobby-roster-card` as `.lobby-subsection` (invite + roster both in same card) | structural-layout | med |
| Search field | `width: 100%; background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 11px 14px 11px 40px; font-size: 14px;` | `.lobbyInviteSearch { padding: 8px 10px 8px 38px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); font-size: var(--font-xs); }` | cosmetic-token | med |
| Search clear button | Not present in prototype | `.lobbySearchClearBtn` (× button, absolute right 8px) present | extra-element-not-in-prototype | low |
| Pool card width | `width: 110px;` | `width: var(--gh-friend-card-width);` (CSS variable) | cosmetic-token | low |
| Pool name | `font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` (single line) | Split into `.lobbyCardNameFirst` (cyan, 600wt) + `.lobbyCardNameLast` (tag color, 400wt) | structural-layout | med |
| Invite button | `width: 100%; font-size: 12px; font-weight: 700; color: #06181c; background: #22d3ee; border: none; border-radius: 9px; padding: 7px 0;` (full-width solid cyan) | `.lobbyInviteBtn { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: var(--gh-btn-outline-bg); color: var(--gh-btn-outline-text); border: 1px solid var(--gh-btn-outline-border); }` (small outline button) | cosmetic-token | med |
| Star/favorite buttons | Not present in prototype | `.lobbyStarBtn` on pool cards, `.lobbyStarBtnInline` in roster rows | extra-element-not-in-prototype | low |
| View all modal | Not present in prototype | `.lobbyViewAllCard` + `.lobbyAllModal` for browsing all players | extra-element-not-in-prototype | low |
| **PLAYERS ROSTER** | | | | |
| Card structure | Separate card, always visible | Merged into `.lobby-roster-card` with invite section | structural-layout | med |
| Pending invites section | Not in prototype | Rendered as roster rows with `.lobbyStatusPillAmber` + remove button | extra-element-not-in-prototype | low |
| Kick button | `width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.12); color: #f87171; font-size: 18px;` (circular) | `.lobby-kick-btn { width: 22px; height: 22px; border-radius: 6px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: var(--font-sm); }` (rounded square) | cosmetic-token | low |
| Status pill (Ready) | `font-size: 10px; font-weight: 800; letter-spacing: 0.6px; padding: 4px 10px;` | `.lobbyStatusPillGreen { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; padding: 2px 6px; }` | cosmetic-token | low |
| **GAME SETTINGS** | | | | |
| Card head | `accentBar` + "Game settings" + "RELAX MODE" tag (violet) | `.lobby-card-header` with accent bar + h3 title (no RELAX MODE tag) | structural-layout | low |
| RELAX MODE tag | `font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #a78bfa; background: rgba(139,92,246,0.14); border: 1px solid rgba(139,92,246,0.35); padding: 3px 9px; border-radius: 999px;` | Not present in live | missing-element | low |
| Tab row (Realtime/Turn-by-turn) | Not in prototype | `.lobbyTabRow { display: flex; gap: 6px; margin-bottom: 16px; background: rgba(255,255,255,0.06); border-radius: 12px; padding: 4px; }` with "Realtime" / "Turn-by-turn" tabs | extra-element-not-in-prototype | med |
| Era presets grid | Not in prototype | `.lobbyEraGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }` with 5 era buttons (Ancient, Medieval, Early Modern, Modern, Contemporary) | extra-element-not-in-prototype | med |
| Slider thumb (timer/year) | `width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid #22d3ee; box-shadow: 0 1px 4px rgba(0,0,0,0.4);` | `.lobby-timer-slider::-webkit-slider-thumb { width: 16px; height: 16px; border: 2px solid #fff; background: var(--gh-teal); }` (inverted colors: cyan bg + white border) | cosmetic-token | med |
| Slider fill | `background: #22d3ee;` (solid cyan) | `.lobby-timer-slider-fill { background: linear-gradient(90deg, var(--gh-teal), #0891b2); }` (teal→cyan gradient) | cosmetic-token | low |

---

## 2. STRUCTURED DIFF: ROUND RESULTS SCREEN

| Element | Prototype State | Live State | Gap Type | Severity |
|---------|-----------------|-----------|----------|----------|
| **OUTER CONTAINER** | | | | |
| Screen layout | `position: fixed; inset: 0; overflow: hidden` | `.container { padding: 0 12px; padding-bottom: 72px; max-width: 720px; margin: 0 auto; }` | structural-layout | med |
| Scroll container | `max-width: 560px; padding: 56px 16px calc(96px + safe-area-inset-bottom); gap: 14px` | No explicit scroll container; uses standard page flow with padding | structural-layout | med |
| Proto bar | Present: "Round Results — Prototype" + "Mock data · you = Alex" | Not present | extra-element-not-in-prototype | low |
| **BANNER** | | | | |
| Banner section | Present: kicker (cyan, letter-spacing 2.5px), bannerTitle (30px, 800), bannerRank (cyan→violet gradient), bannerStats (XP · accuracy) | Not present | missing-element | high |
| **EVENT CARD** | | | | |
| Event image height | `height: 200px` | `height: 180px` | cosmetic-token | low |
| Event gradient overlay | `linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85))` | Not visible (image shown directly) | structural-layout | med |
| Event overlay positioning | `position: absolute; left: 0; right: 0; bottom: 0; padding: 18px` (title/meta overlay on image) | Not present (title shown above image, meta below image) | structural-layout | med |
| Event meta color | `color: #22d3ee` (cyan) | `color: var(--gh-orange)` (orange) | cosmetic-token | med |
| Event title | `font-size: 24px; font-weight: 800; margin: 4px 0 0; letter-spacing -0.3px` (centered on image) | `font-size: var(--gh-font-base); font-weight: 600; padding: 14px 16px 10px; text-align: center` | cosmetic-token | med |
| Event description | Separate paragraph below event card | Hidden by default; revealed via "📖 Historical Context" button → bottom sheet modal | structural-layout | med |
| **ACCURACY/HERO CARD** | | | | |
| Card layout | `.heroCard`: `display: flex; align-items: center; gap: 18px; padding: 18px` | `.accuracyCard`: `padding: 16px; margin-bottom: 10px` | structural-layout | med |
| XP value | `font-size: 26px; font-weight: 800; color: #ffd54a; line-height: 1` (gold) | `font-size: var(--font-sm); color: var(--gh-text-secondary)` (secondary text color) | cosmetic-token | med |
| XP label | `font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px` | Not visible (XP shown as label text only) | missing-element | low |
| Combo badge | `align-self: flex-start; padding: 4px 11px; border-radius: 999px;` with tier colors (gold/silver/bronze) | `InlineImageBadge` component (image-based) | structural-layout | med |
| Split row (Where/When) | `display: flex; gap: 18px` with dot separators (cyan for Where, violet for When) showing location/time scores | Not present in accuracy card | missing-element | med |
| Near miss chip | Not present in prototype | `.nearMissChip` shown when accuracy 95-99% | extra-element-not-in-prototype | low |
| Hint penalty badge | Not present in prototype | `.hintPenaltyBadge` shown with hint penalties | extra-element-not-in-prototype | low |
| **LEADERBOARD CARD** | | | | |
| Card header | `.cardHead`: `display: flex; gap: 10px; padding: 16px 18px 10px` with `.accentBar` (4px, #22d3ee) + `cardTitle` "Leaderboard" | `.leaderboardTitle { font-size: var(--gh-font-base); font-weight: 700; margin-bottom: 10px }` (no accent bar) | structural-layout | med |
| Tabs (This Round / All Rounds) | `.tabs`: `display: flex; gap: 8px; padding: 14px 14px 0` | `.leaderboardTabs`: `display: flex; gap: 8px; margin-bottom: 12px` | structural-layout | low |
| Tab styling | `flex: 1; padding: 10px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05)` | `padding: 6px 12px; border-radius: var(--gh-radius-sm); border: none; background: transparent` | cosmetic-token | med |
| Tab active state | `background: rgba(255,255,255,0.1); color: #22d3ee or #8b5cf6 (dynamic)` | `color: var(--gh-orange); background: var(--gh-bg-input); font-weight: 600` | cosmetic-token | med |
| LB row highlight (me) | `.lbRowMe`: `background: rgba(34,211,238,0.08)` | `.lbRowSelf`: `background: var(--gh-row-self-bg)` | cosmetic-token | low |
| LB rank | `width: 22px; text-align: center; font-size: 15px; font-weight: 800` | `min-width: 14px; font-size: 12px; color: var(--gh-text-muted)` | cosmetic-token | low |
| LB rank gold (1st place) | `.lbRankGold`: `color: #ffd54a` (gold) | Not explicitly styled (no gold color for rank) | missing-element | low |
| LB you tag | `font-size: 10px; color: #22d3ee; background: rgba(34,211,238,0.15); padding: 1px 7px; border-radius: 999px` (pill) | `.lbYouTag`: `color: var(--gh-text-muted); font-size: 12px; margin-left: 4px` (plain text) | cosmetic-token | med |
| LB XP / Score | `font-size: 13px; font-weight: 700; color: #ffd54a` (gold) | `.lbAccPill: background: var(--gh-bg-input); border-radius: var(--gh-radius-pill); padding: 2px 9px` (pill style) | cosmetic-token | med |
| LB accuracy | `font-size: 14px; font-weight: 800; width: 44px; text-align: right; color: dynamic hsl()` | `.lbAccPill: font-size: var(--font-xs); font-weight: 600; color: dynamic hsl()` | cosmetic-token | low |
| **WHERE / WHEN BREAKDOWN** | | | | |
| Card structure | Single `.card` with tabbed content (WHERE/WHEN tabs inside card) | Two separate cards: `WhereCard` + `WhenCard` in `.cardsGrid` | structural-layout | high |
| Tabs (Where / When) | `.tabs`: `display: flex; gap: 8px; padding: 14px 14px 0` with badge icons | Tabs integrated into each card header (WhereCard/WhenCard have own titles) | structural-layout | high |
| Breakdown header | `.breakHead`: `display: flex; justify-content: space-between; padding: 14px 18px 0` | Not present (info in card header) | missing-element | med |
| Correct location/year label | `.breakCorrect`: `font-size: 14px; color: rgba(255,255,255,0.7)` | `.correctRow`: `font-size: var(--font-xs); display: flex; justify-content: space-between` | cosmetic-token | low |
| Correct value styling | `color: accent (#22d3ee or #8b5cf6)` | `.correctName` / `.correctValue: font-size: var(--font-base); font-weight: 700` | cosmetic-token | low |
| Breakdown sub (distance/years) | `.breakSub`: `font-size: 12px; color: rgba(255,255,255,0.5); padding: 2px 18px 0` | `.distanceWrap` / (years in leaderboard): `font-size: var(--font-sm); color: var(--gh-text-primary)` | cosmetic-token | low |
| **WHEN TIMELINE** | | | | |
| Timeline container | `.timeline: position: relative; height: 110px; margin: 28px 18px 8px` | `.timeline: width: 100%; height: 108px; position: relative; margin: 12px 0; padding: 0 16px` | cosmetic-token | low |
| Timeline bar | `.timelineBar: position: absolute; top: 62px; height: 3px; background: rgba(255,255,255,0.18)` | `.timelineBar: position: absolute; top: 50%; height: 4px; background: var(--gh-text-muted)` | cosmetic-token | low |
| Correct marker | `.correctMarker: position: absolute; top: 40px; display: flex; flex-direction: column; align-items: center` | `.correctMarker: position: absolute; top: 50%; transform: translate(-50%, -50%); width: 4px; height: 32px; background: var(--gh-orange)` | structural-layout | med |
| Correct flag | `.correctFlag: font-size: 9px; color: #4ade80; background: rgba(74,222,128,0.15); padding: 2px 6px` | `.correctLabel: font-size: 12px; color: var(--gh-text-muted); position: absolute; top: -20px` | cosmetic-token | med |
| Correct year label | `.correctYearTl: font-size: 12px; color: #4ade80; margin-top: 2px` (green) | `.correctYear: font-size: 12px; color: var(--gh-orange); position: absolute; top: 32px` (orange) | cosmetic-token | med |
| Player markers | `.tlPlayer: position: absolute; top: 30px; display: flex; flex-direction: column; gap: 2px` | `.playerMarker: position: absolute; top: 50%; transform: translate(-50%, calc(-50% - verticalOffset))` | structural-layout | med |
| Player year label | `.tlYear: font-size: 11px; color: rgba(255,255,255,0.8); fontWeight: 700 (me) or 400` | `.playerYearLabel: font-size: 15px (me) or 10px; fontWeight: 700 (me) or 400; color: var(--gh-text-primary)` | cosmetic-token | low |
| **WHERE MAP** | | | | |
| Map container | `.map: position: relative; height: 220px; margin: 14px 14px 4px; border-radius: 14px; background: radial-gradient(circle at 50% 40%, #16384a, #0c1a24 70%)` | `.mapContainer: border-radius: 8px; overflow: hidden; height: 200px` | structural-layout | high |
| Map rendering | CSS mock with `.mapGrid` (grid pattern) | Real Leaflet map (StaticResultMap component) | structural-layout | high |
| Correct pin | `.mapPin.mapPinCorrect`: dot (14px, #4ade80) + label (#4ade80) | Leaflet marker with correct location | structural-layout | high |
| Player pins | `.mapPin`: avatar ring (2px border, cyan for me) | Leaflet markers with avatar images | structural-layout | high |
| **EXPANDABLE SECTIONS** | | | | |
| Hints card | Hints in expandable section inside breakdown card | Separate `.hintsCard` above WHERE/WHEN cards | structural-layout | med |
| Expandable leaderboard | Inside breakdown card, with `.expand` + `.subLb` rows | Not present (leaderboard is separate card) | structural-layout | med |
| **COUNTDOWN / READY** | | | | |
| Countdown section | `.countdown: display: flex; gap: 12px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1)` | `.countdownCard: background: var(--gh-general-card-bg); border: 1px solid var(--gh-general-card-border); padding: 16px` | cosmetic-token | low |
| **BOTTOM BAR** | | | | |
| Bar structure | `.bottomBar: position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; gap: 12px; padding: 12px 16px calc(12px + safe-area-inset-bottom)` | `.bottomBar: position: fixed; bottom: 0; left: 0; right: 0; height: 56px; display: flex; justify-content: space-between; padding: 0 16px; z-index: 1000` | structural-layout | med |
| Home button | `.iconBtn: width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15)` | `.homeButton: background: transparent; border: none; padding: 8px` | cosmetic-token | low |
| Progress dots | `.progress: flex: 1; display: flex; gap: 7px` with `.dot` (8px, filled/current/empty) | `.progressDots: display: flex; gap: 8px` with `.progressDot` (height: 4px, width: 28px bars) | cosmetic-token | low |
| Next button | `.nextBtn: padding: 12px 26px; border-radius: 12px; background: #22d3ee; color: #06181c; font-size: 15px; font-weight: 800; box-shadow: 0 6px 22px rgba(34,211,238,0.35)` | `.nextButton: background: var(--gh-orange); color: var(--gh-btn-text); font-weight: 700; font-size: var(--font-sm); border-radius: 8px; padding: 10px 18px` | cosmetic-token | med |
| **COLOR PALETTE** | | | | |
| Gold (XP, rank 1st) | `#ffd54a` | `var(--gh-orange)` used instead | cosmetic-token | med |
| Green (correct marker) | `#4ade80` | `var(--gh-orange)` used instead | cosmetic-token | med |
| Cyan accent | `#22d3ee` | `var(--gh-teal)` (aligned) | cosmetic-token | low |
| Violet accent | `#8b5cf6` | `var(--gh-violet)` (aligned) | cosmetic-token | low |

---

## 3. ATOMIC TASK LIST

### LOBBY SCREEN TASKS

#### TASK L1 — MP-UI-ALIGN-LOBBY-001
**ID:** `MP-UI-ALIGN-LOBBY-001`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Card title font size/weight
**Before:** `.lobby-subsection-title { font-size: var(--font-sm); font-weight: 600; }`
**After:** `.lobby-subsection-title { font-size: 16px; font-weight: 700; }`
**Description:** Increase card title font size from ~14px/600 to 16px/700 to match prototype
**Validation:** `grep "lobby-subsection-title" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L2 — MP-UI-ALIGN-LOBBY-002
**ID:** `MP-UI-ALIGN-LOBBY-002`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Invite search field styling
**Before:** `.lobbyInviteSearch { padding: 8px 10px 8px 38px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); font-size: var(--font-xs); }`
**After:** `.lobbyInviteSearch { width: 100%; padding: 11px 14px 11px 40px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.08); font-size: 14px; }`
**Description:** Align search field to prototype: increase border width to 1.5px, radius to 12px, padding, and font size to 14px
**Validation:** `grep -A2 "lobbyInviteSearch" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L3 — MP-UI-ALIGN-LOBBY-003
**ID:** `MP-UI-ALIGN-LOBBY-003`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Invite button styling
**Before:** `.lobbyInviteBtn { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: var(--gh-btn-outline-bg); color: var(--gh-btn-outline-text); border: 1px solid var(--gh-btn-outline-border); }`
**After:** `.lobbyInviteBtn { width: 100%; font-size: 12px; font-weight: 700; padding: 7px 0; border-radius: 9px; background: #22d3ee; color: #06181c; border: none; }`
**Description:** Change invite button from small outline to full-width solid cyan to match prototype
**Validation:** `grep -A2 "lobbyInviteBtn" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L4 — MP-UI-ALIGN-LOBBY-004
**ID:** `MP-UI-ALIGN-LOBBY-004`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Slider thumb styling (timer/year sliders)
**Before:** `.lobby-timer-slider::-webkit-slider-thumb { width: 16px; height: 16px; background: var(--gh-teal); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }`
**After:** `.lobby-timer-slider::-webkit-slider-thumb { width: 18px; height: 18px; background: #fff; border: 2px solid #22d3ee; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }` (apply to all range inputs in settings)
**Description:** Invert slider thumb colors: white background with cyan border (from cyan bg with white border), increase size to 18px
**Validation:** `grep "webkit-slider-thumb" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L5 — MP-UI-ALIGN-LOBBY-005
**ID:** `MP-UI-ALIGN-LOBBY-005`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Kick button border radius
**Before:** `.lobby-kick-btn { width: 22px; height: 22px; border-radius: 6px; ... }`
**After:** `.lobby-kick-btn { width: 26px; height: 26px; border-radius: 50%; ... }`
**Description:** Change kick button from rounded square to circular (50% border-radius), increase size to 26px to match prototype
**Validation:** `grep "lobby-kick-btn" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L6 — MP-UI-ALIGN-LOBBY-006
**ID:** `MP-UI-ALIGN-LOBBY-006`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Status pill font size
**Before:** `.lobbyStatusPillGreen { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; padding: 2px 6px; ... }`
**After:** `.lobbyStatusPillGreen { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; padding: 4px 10px; ... }`
**Description:** Decrease status pill font size to 10px/800, increase padding to match prototype
**Validation:** `grep "lobbyStatusPillGreen" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

#### TASK L7 — MP-UI-ALIGN-LOBBY-007
**ID:** `MP-UI-ALIGN-LOBBY-007`
**File:** `src/components/compete/LobbySection.module.css`
**Element:** Mode badge font size
**Before:** `.lobby-mode-badge { font-size: 12px; font-weight: 800; ... }`
**After:** `.lobby-mode-badge { font-size: 11px; font-weight: 800; ... }`
**Description:** Decrease mode badge font size to 11px to match prototype
**Validation:** `grep "lobby-mode-badge" src/components/compete/LobbySection.module.css`
**Dependencies:** None

---

### ROUND RESULTS SCREEN TASKS

#### TASK R1 — MP-UI-ALIGN-RESULTS-001
**ID:** `MP-UI-ALIGN-RESULTS-001`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Banner section (new element)
**Before:** Banner section not present
**After:** Add banner section after container, before eventCard:
```tsx
{/* Round banner */}
<div className={styles.banner}>
  <span className={styles.bannerKicker}>ROUND {snapshot.currentRoundIndex + 1} / {snapshot.rounds.length}</span>
  <h1 className={styles.bannerTitle}>
    You placed <span className={styles.bannerRank}>#{myRank}{rankSuffix(myRank)}</span>
  </h1>
  <div className={styles.bannerStats}>
    <span>+{myResult?.score ?? 0} XP</span>
    <span className={styles.bannerDot}>·</span>
    <span>{Math.round(accuracy)}% accuracy</span>
  </div>
</div>
```
**Description:** Add banner section with kicker, title with rank gradient, and stats row (XP · accuracy)
**Validation:** `grep "banner" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R2 (CSS), calculate myRank from leaderboardRows
**Note:** Need to derive myRank from leaderboardRows before banner

---

#### TASK R2 — MP-UI-ALIGN-RESULTS-002
**ID:** `MP-UI-ALIGN-RESULTS-002`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Banner CSS classes
**Before:** Banner CSS not present
**After:** Add banner CSS:
```css
.banner {
  text-align: center;
  padding: 14px 8px 4px;
}
.bannerKicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2.5px;
  color: #22d3ee;
}
.bannerTitle {
  font-size: 30px;
  font-weight: 800;
  margin: 8px 0 0;
  letter-spacing: -0.5px;
}
.bannerRank {
  background: linear-gradient(135deg, #22d3ee, #8b5cf6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.bannerStats {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  gap: 10px;
  justify-content: center;
}
.bannerDot {
  color: rgba(255, 255, 255, 0.3);
}
```
**Description:** Add banner CSS classes matching prototype styling
**Validation:** `grep "\.banner" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R3 — MP-UI-ALIGN-RESULTS-003
**ID:** `MP-UI-ALIGN-RESULTS-003`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Event meta color
**Before:** `.eventMeta { color: var(--gh-orange); }` (or equivalent)
**After:** `.eventMeta { color: #22d3ee; }` (cyan)
**Description:** Change event meta color from orange to cyan to match prototype
**Validation:** `grep "eventMeta" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R4 — MP-UI-ALIGN-RESULTS-004
**ID:** `MP-UI-ALIGN-RESULTS-004`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Event title styling
**Before:** `.eventTitle { font-size: var(--gh-font-base); font-weight: 600; padding: 14px 16px 10px; text-align: center; }`
**After:** `.eventTitle { font-size: 24px; font-weight: 800; margin: 4px 0 0; letter-spacing: -0.3px; }`
**Description:** Increase event title font size to 24px/800, reduce letter-spacing
**Validation:** `grep "eventTitle" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R5 — MP-UI-ALIGN-RESULTS-005
**ID:** `MP-UI-ALIGN-RESULTS-005`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** XP value styling
**Before:** `.accuracyXp { font-size: var(--font-sm); color: var(--gh-text-secondary); }`
**After:** `.accuracyXp { font-size: 26px; font-weight: 800; color: #ffd54a; line-height: 1; }`
**Description:** Change XP value from secondary text to gold #ffd54a, 26px/800
**Validation:** `grep "accuracyXp" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None
**Decision dependency:** DECISION R1 (restore gold color for XP)

---

#### TASK R6 — MP-UI-ALIGN-RESULTS-006
**ID:** `MP-UI-ALIGN-RESULTS-006`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** XP label (new element)
**Before:** XP label not present
**After:** After XP value, add:
```tsx
<span className={styles.xpLabel}>XP earned</span>
```
**Description:** Add "XP earned" label below XP value
**Validation:** `grep "xpLabel" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R7 (CSS)

---

#### TASK R7 — MP-UI-ALIGN-RESULTS-007
**ID:** `MP-UI-ALIGN-RESULTS-007`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** XP label CSS
**Before:** Not present
**After:** Add:
```css
.xpLabel {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 3px;
}
```
**Description:** Add XP label CSS class
**Validation:** `grep "xpLabel" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R8 — MP-UI-ALIGN-RESULTS-008
**ID:** `MP-UI-ALIGN-RESULTS-008`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Split row (Where/When scores) - new element
**Before:** Split row not present in accuracy card
**After:** After XP label and badge, add:
```tsx
<div className={styles.splitRow}>
  <div className={styles.splitItem}>
    <span className={styles.splitDot} style={{ background: "#22d3ee" }} />
    <span className={styles.splitLabel}>Where</span>
    <span className={styles.splitVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, locationScore)) / 100) * 120)}, 90%, 52%)` }}>{locationScore}%</span>
  </div>
  <div className={styles.splitItem}>
    <span className={styles.splitDot} style={{ background: "#8b5cf6" }} />
    <span className={styles.splitLabel}>When</span>
    <span className={styles.splitVal} style={{ color: `hsl(${Math.round((Math.max(0, Math.min(100, timeScore)) / 100) * 120)}, 90%, 52%)` }}>{timeScore}%</span>
  </div>
</div>
```
**Description:** Add split row showing Where and When scores with colored dots
**Validation:** `grep "splitRow" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R9 (CSS), need locationScore/timeScore from myResult

---

#### TASK R9 — MP-UI-ALIGN-RESULTS-009
**ID:** `MP-UI-ALIGN-RESULTS-009`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Split row CSS
**Before:** Not present
**After:** Add:
```css
.splitRow {
  display: flex;
  gap: 18px;
}
.splitItem {
  display: flex;
  align-items: center;
  gap: 6px;
}
.splitDot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.splitLabel {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}
.splitVal {
  font-size: 14px;
  font-weight: 700;
}
```
**Description:** Add split row CSS classes
**Validation:** `grep "splitRow" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R10 — MP-UI-ALIGN-RESULTS-010
**ID:** `MP-UI-ALIGN-RESULTS-010`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Leaderboard card header with accent bar
**Before:** `.leaderboardTitle { font-size: var(--gh-font-base); font-weight: 700; margin-bottom: 10px; }`
**After:** Replace with card head structure:
```css
.cardHead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 10px;
}
.accentBar {
  width: 4px;
  height: 18px;
  border-radius: 999px;
  background: #22d3ee;
}
.cardTitle {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
```
**Description:** Add card head with accent bar and change leaderboard title styling
**Validation:** `grep "cardHead\|accentBar" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R11 (JSX)

---

#### TASK R11 — MP-UI-ALIGN-RESULTS-011
**ID:** `MP-UI-ALIGN-RESULTS-011`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Leaderboard card JSX structure
**Before:** `<div className={styles.leaderboardTitle}>{t('round_leaderboard')}</div>`
**After:** Replace with:
```tsx
<div className={styles.cardHead}>
  <span className={styles.accentBar} />
  <h2 className={styles.cardTitle}>{t('round_leaderboard')}</h2>
</div>
```
**Description:** Wrap leaderboard title in card head with accent bar
**Validation:** `grep "cardHead" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R10 (CSS)

---

#### TASK R12 — MP-UI-ALIGN-RESULTS-012
**ID:** `MP-UI-ALIGN-RESULTS-012`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Leaderboard tabs styling
**Before:** `.leaderboardTab { padding: 6px 12px; border-radius: var(--gh-radius-sm); border: none; background: transparent; }`
**After:** `.leaderboardTab { flex: 1; padding: 10px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); transition: all 0.18s; }`
**Description:** Change leaderboard tabs to bordered style with larger padding
**Validation:** `grep "leaderboardTab" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R13 — MP-UI-ALIGN-RESULTS-013
**ID:** `MP-UI-ALIGN-RESULTS-013`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Leaderboard tab active state
**Before:** `.leaderboardTabActive { color: var(--gh-orange); background: var(--gh-bg-input); font-weight: 600; }`
**After:** `.leaderboardTabActive { background: rgba(255,255,255,0.1); }` + dynamic color via inline style in JSX
**Description:** Change tab active background to lighter overlay; move color to inline style for dynamic cyan/violet
**Validation:** `grep "leaderboardTabActive" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R14 (JSX)

---

#### TASK R14 — MP-UI-ALIGN-RESULTS-014
**ID:** `MP-UI-ALIGN-RESULTS-014`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Leaderboard tab active color (inline style)
**Before:** `className={`${styles.leaderboardTab} ${leaderboardTab === 'thisRound' ? styles.leaderboardTabActive : ''}`}`
**After:** Add inline style for active tabs:
```tsx
<button
  className={`${styles.leaderboardTab} ${leaderboardTab === 'thisRound' ? styles.leaderboardTabActive : ''}`}
  style={leaderboardTab === 'thisRound' ? { color: '#22d3ee', borderColor: '#22d3ee' } : undefined}
  onClick={() => setLeaderboardTab('thisRound')}
>
  {t('this_round')}
</button>
<button
  className={`${styles.leaderboardTab} ${leaderboardTab === 'allRounds' ? styles.leaderboardTabActive : ''}`}
  style={leaderboardTab === 'allRounds' ? { color: '#8b5cf6', borderColor: '#8b5cf6' } : undefined}
  onClick={() => setLeaderboardTab('allRounds')}
>
  {t('all_rounds')}
</button>
```
**Description:** Add inline styles for tab active color (cyan for This Round, violet for All Rounds)
**Validation:** `grep "leaderboardTab" src/components/compete/RoundCompleteSection.tsx | grep "style="`
**Dependencies:** TASK R13 (CSS)

---

#### TASK R15 — MP-UI-ALIGN-RESULTS-015
**ID:** `MP-UI-ALIGN-RESULTS-015`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** LB rank gold styling
**Before:** Not present (no gold for rank 1)
**After:** Add:
```css
.lbRankGold {
  color: #ffd54a;
}
```
**Description:** Add gold color for 1st place rank
**Validation:** `grep "lbRankGold" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R16 (JSX), DECISION R1 (restore gold color)

---

#### TASK R16 — MP-UI-ALIGN-RESULTS-016
**ID:** `MP-UI-ALIGN-RESULTS-016`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** LB rank gold class application
**Before:** `<span className={styles.lbRank}>{row.rank}</span>`
**After:** `<span className={`${styles.lbRank} ${row.rank === 1 ? styles.lbRankGold : ''}`}>{row.rank}</span>`
**Description:** Apply gold class to rank 1
**Validation:** `grep "lbRankGold" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R15 (CSS)

---

#### TASK R17 — MP-UI-ALIGN-RESULTS-017
**ID:** `MP-UI-ALIGN-RESULTS-017`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** LB you tag pill styling
**Before:** `.lbYouTag { color: var(--gh-text-muted); font-size: 12px; margin-left: 4px; }`
**After:** `.lbYouTag { font-size: 10px; font-weight: 700; color: #22d3ee; background: rgba(34,211,238,0.15); padding: 1px 7px; border-radius: 999px; }`
**Description:** Change you tag from plain text to cyan pill
**Validation:** `grep "lbYouTag" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R18 — MP-UI-ALIGN-RESULTS-018
**ID:** `MP-UI-ALIGN-RESULTS-018`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** LB XP styling
**Before:** `.lbAccPill { background: var(--gh-bg-input); border-radius: var(--gh-radius-pill); padding: 2px 9px; }`
**After:** `.lbXp { font-size: 13px; font-weight: 700; color: #ffd54a; }` (new class, replace pill approach)
**Description:** Change LB XP from pill to gold text
**Validation:** `grep "lbXp" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R19 (JSX), DECISION R1 (restore gold color)

---

#### TASK R19 — MP-UI-ALIGN-RESULTS-019
**ID:** `MP-UI-ALIGN-RESULTS-019`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** LB score cell JSX
**Before:** `<span className={styles.lbAccPill}>+{displayValue}<span className={styles.lbAccSuffix}>{displaySuffix}</span></span>`
**After:** `<span className={styles.lbXp}>+{displayValue}<span className={styles.lbAccSuffix}>{displaySuffix}</span></span>`
**Description:** Change class from lbAccPill to lbXp
**Validation:** `grep "lbXp" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R18 (CSS)

---

#### TASK R20 — MP-UI-ALIGN-RESULTS-020
**ID:** `MP-UI-ALIGN-RESULTS-020`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** WHEN correct marker styling
**Before:** `.correctMarker { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 4px; height: 32px; background: var(--gh-orange); }`
**After:** Change to flag + year layout:
```css
.correctMarker {
  position: absolute;
  top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.correctFlag {
  font-size: 9px;
  color: #4ade80;
  background: rgba(74,222,128,0.15);
  padding: 2px 6px;
  border-radius: 4px;
}
.correctYearTl {
  font-size: 12px;
  color: #4ade80;
  margin-top: 2px;
}
```
**Description:** Change correct marker from orange bar to green flag + year label
**Validation:** `grep "correctMarker\|correctFlag\|correctYearTl" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R21 (JSX), DECISION R2 (restore green color for correct marker)

---

#### TASK R21 — MP-UI-ALIGN-RESULTS-021
**ID:** `MP-UI-ALIGN-RESULTS-021`
**File:** `src/components/compete/RoundCompleteSection.tsx` (WhenCard.tsx)
**Element:** WHEN correct marker JSX
**Before:** Current correct marker implementation in WhenCard
**After:** Replace with flag + year structure:
```tsx
<div className={styles.correctMarker} style={{ left: `${pct(correctYear)}%` }}>
  <span className={styles.correctFlag}>Correct</span>
  <span className={styles.correctYearTl}>{correctYear}</span>
</div>
```
**Description:** Change correct marker to flag + year label
**Validation:** `grep "correctFlag" src/components/compete/WhenCard.tsx`
**Dependencies:** TASK R20 (CSS)

---

#### TASK R22 — MP-UI-ALIGN-RESULTS-022
**ID:** `MP-UI-ALIGN-RESULTS-022`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Bottom bar next button styling
**Before:** `.nextButton { background: var(--gh-orange); color: var(--gh-btn-text); font-weight: 700; font-size: var(--font-sm); border-radius: 8px; padding: 10px 18px; }`
**After:** `.nextButton { padding: 12px 26px; border-radius: 12px; background: #22d3ee; color: #06181c; font-size: 15px; font-weight: 800; box-shadow: 0 6px 22px rgba(34,211,238,0.35); }`
**Description:** Change next button from orange to cyan solid with shadow
**Validation:** `grep "nextButton" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** None

---

#### TASK R23 — MP-UI-ALIGN-RESULTS-023
**ID:** `MP-UI-ALIGN-RESULTS-023`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Progress dots styling
**Before:** `.progressDot { height: 4px; width: 28px; }`
**After:** `.dot { width: 8px; height: 8px; border-radius: 50%; }`
**Description:** Change progress dots from bars (4px×28px) to circles (8px)
**Validation:** `grep "progressDot\|\.dot" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R24 (JSX)

---

#### TASK R24 — MP-UI-ALIGN-RESULTS-024
**ID:** `MP-UI-ALIGN-RESULTS-024`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Progress dots JSX
**Before:** Current progressDots implementation with progressDot class
**After:** Change to dot class with circle styling:
```tsx
<div className={styles.progress}>
  {Array.from({ length: snapshot.rounds.length }).map((_, i) => (
    <span
      key={i}
      className={styles.dot}
      style={{ background: i < snapshot.currentRoundIndex ? "#22d3ee" : i === snapshot.currentRoundIndex ? "#fff" : "rgba(255,255,255,0.2)" }}
    />
  ))}
</div>
```
**Description:** Change progress dots from bars to circles
**Validation:** `grep "styles.dot" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R23 (CSS)

---

#### TASK R25 — MP-UI-ALIGN-RESULTS-025
**ID:** `MP-UI-ALIGN-RESULTS-025`
**File:** `src/components/compete/RoundCompleteSection.module.css`
**Element:** Countdown card styling
**Before:** `.countdownCard { background: var(--gh-general-card-bg); border: 1px solid var(--gh-general-card-border); padding: 16px; }`
**After:** `.countdown { display: flex; gap: 12px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }`
**Description:** Change countdown from card to inline pill styling
**Validation:** `grep "countdown" src/components/compete/RoundCompleteSection.module.css`
**Dependencies:** TASK R26 (JSX)

---

#### TASK R26 — MP-UI-ALIGN-RESULTS-026
**ID:** `MP-UI-ALIGN-RESULTS-026`
**File:** `src/components/compete/RoundCompleteSection.tsx`
**Element:** Countdown JSX structure
**Before:** Current countdownCard implementation
**After:** Change to inline pill:
```tsx
<div className={styles.countdown}>
  <span className={styles.countdownText}>Auto-advancing in <strong>{countdown}s</strong></span>
  <span className={styles.readyNames}>
    {snapshot.readyForNext?.map((pid) => {
      const player = players.find(p => p.playerId === pid);
      return player && <span key={pid} style={{ color: "#4ade80" }}>{player.displayName} ✓</span>;
    })}
  </span>
</div>
```
**Description:** Change countdown from card to inline pill with ready names
**Validation:** `grep "styles.countdown" src/components/compete/RoundCompleteSection.tsx`
**Dependencies:** TASK R25 (CSS)

---

## 4. DECISIONS NEEDED FOR CTO

### DECISION L1 — Lobby Grid Layout
**Issue:** Prototype uses single-column layout with `max-width: 520px`. Live uses responsive 2-column grid (1fr 1fr) on desktop, 1-column on mobile.
**Question:** Should live adopt prototype's single-column mobile-first layout, or is the responsive 2-column grid the intended desktop experience?
**Impact:** High — fundamental layout change affecting entire lobby structure.
**Recommendation:** Keep live's responsive 2-column grid for desktop (better space utilization), adopt prototype's single-column for mobile only. This is a live enhancement over prototype.

---

### DECISION L2 — Lobby Card Merging (Invite + Roster)
**Issue:** Prototype has separate invite card and roster card. Live merges both into `.lobby-roster-card` as subsections.
**Question:** Should live separate invite and roster into two cards, or keep merged?
**Impact:** Medium — card structure change.
**Recommendation:** Keep merged (live's approach groups related content better). Prototype separation may be due to simplified scope.

---

### DECISION L3 — Lobby Pool Name Splitting
**Issue:** Prototype shows pool names as single line (full name). Live splits into first name (cyan) + last name (tag color).
**Question:** Should pool names be single-line or split?
**Impact:** Low — cosmetic.
**Recommendation:** Keep split (live's approach provides visual distinction). Prototype single-line may be simplified.

---

### DECISION L4 — Lobby Extra Features (Star/Follow, Era Presets, Tab Row)
**Issue:** Live has features not in prototype:
- Star/favorite buttons on player cards
- Era preset grid (Ancient, Medieval, etc.)
- Tab row for Realtime/Turn-by-turn modes
- View all modal for player browsing
- Pending invites section
**Question:** Are these features intended to be part of the production design, or should they be removed to match prototype?
**Impact:** Medium-High — functional feature removal if removed.
**Recommendation:** Keep all (these are functional additions beyond prototype's simplified scope). Prototype is mock-only.

---

### DECISION L5 — Lobby RELAX MODE Tag
**Issue:** Prototype shows "RELAX MODE" tag in game settings header (violet). Live does not have this tag.
**Question:** Is RELAX MODE a real game mode that should be added to live, or should it be removed from prototype?
**Impact:** Low — tag addition/removal.
**Recommendation:** Clarify if RELAX MODE is a real mode. If yes, add to live. If no, ignore.

---

### DECISION R1 — Round Results Color Palette (Gold vs Orange)
**Issue:** Prototype uses gold `#ffd54a` for XP values, rank 1st place, and LB scores. Live uses `var(--gh-orange)` for these.
**Question:** Should live restore gold color for XP/rank/score, or keep orange?
**Impact:** Medium — color palette consistency.
**Recommendation:** Restore gold for XP/rank/score (prototype's gold is more semantically meaningful for rewards). Orange may be a placeholder.

---

### DECISION R2 — Round Results Correct Marker Color (Green vs Orange)
**Issue:** Prototype uses green `#4ade80` for correct marker flag and year label. Live uses `var(--gh-orange)` for correct marker bar.
**Question:** Should live restore green for correct marker, or keep orange?
**Impact:** Medium — color semantics.
**Recommendation:** Restore green (green semantically means "correct"). Orange may be a placeholder.

---

### DECISION R3 — Round Results Event Card Layout
**Issue:** Prototype: image with gradient overlay, title/meta overlay on image. Live: title above image, image below, meta below image, image clickable for fullscreen.
**Question:** Which layout is the target design?
**Impact:** High — event card structural change.
**Recommendation:** Live's approach (title above, image clickable) is more accessible and functional. Prototype's overlay may be simplified for mock.

---

### DECISION R4 — Round Results Event Description (Inline vs Modal)
**Issue:** Prototype shows event description as inline paragraph below event card. Live hides description, reveals via "📖 Historical Context" button → bottom sheet modal.
**Question:** Should description be inline or modal?
**Impact:** Medium — UX pattern.
**Recommendation:** Keep modal (live's approach is more space-efficient). Prototype inline may be simplified.

---

### DECISION R5 — Round Results WHERE/WHEN Structure (Single Tabbed vs Two Cards)
**Issue:** Prototype: single card with WHERE/WHEN tabs inside. Live: two separate cards (WhereCard + WhenCard) in grid.
**Question:** Should live adopt single tabbed card, or keep two separate cards?
**Impact:** High — major structural change.
**Recommendation:** Keep two separate cards (live's approach allows side-by-side on desktop via grid at 768px+). Prototype single card is mobile-first.

---

### DECISION R6 — Round Results Expandable Hints (Inline vs Separate Card)
**Issue:** Prototype: hints in expandable section inside breakdown card. Live: separate hintsCard above WHERE/WHEN cards.
**Question:** Should hints be expandable inline or separate card?
**Impact:** Low-Medium — hints visibility.
**Recommendation:** Keep separate card (live's approach gives hints more prominence). Prototype expandable may be simplified.

---

### DECISION R7 — Round Results Combo Badge vs InlineImageBadge
**Issue:** Prototype: combo badge as text pill with tier colors (gold/silver/bronze). Live: InlineImageBadge component (image-based).
**Question:** Should combo badge be text pill or image-based?
**Impact:** Low — badge rendering.
**Recommendation:** Keep image-based if images exist, otherwise adopt text pill. Check if badge images exist in `/badges/`.

---

## 5. VERIFICATION STEPS

After implementing all tasks (excluding those blocked by decisions), run:

```bash
# Build verification
npm run build

# Type check
npm run type-check

# Lint (if configured)
npm run lint

# Visual verification (manual)
# 1. Navigate to /compete/[gameId] (lobby) on mobile and desktop
# 2. Check card title fonts are 16px/700
# 3. Check search field has 1.5px border, 12px radius
# 4. Check invite button is full-width cyan
# 5. Check slider thumbs are white with cyan border, 18px
# 6. Check kick button is circular 26px
# 7. Check status pills are 10px
# 8. Check mode badge is 11px

# 3. Navigate to round results screen
# 4. Check banner is present with kicker, title, rank gradient, stats
# 5. Check event meta is cyan
# 6. Check event title is 24px/800
# 7. Check XP value is 26px gold
# 8. Check XP label is present
# 9. Check split row is present with Where/When scores
# 10. Check leaderboard header has accent bar
# 11. Check leaderboard tabs are bordered
# 12. Check tab active colors are cyan/violet
# 13. Check rank 1 is gold
# 14. Check you tag is cyan pill
# 15. Check LB XP is gold
# 16. Check WHEN correct marker is green flag + year
# 17. Check next button is cyan with shadow
# 18. Check progress dots are circles
# 19. Check countdown is inline pill
```

---

## 6. TASK DEPENDENCY GRAPH

```
LOBBY:
L1 (card title font)
L2 (search field)
L3 (invite button)
L4 (slider thumb)
L5 (kick button)
L6 (status pill)
L7 (mode badge)
→ All independent, can be parallel

RESULTS:
R2 (banner CSS) → R1 (banner JSX)
R7 (XP label CSS) → R6 (XP label JSX)
R9 (split row CSS) → R8 (split row JSX)
R10 (card head CSS) → R11 (card head JSX)
R13 (tab active CSS) → R14 (tab active color JSX)
R15 (LB rank gold CSS) → R16 (LB rank gold JSX)
R18 (LB XP CSS) → R19 (LB XP JSX)
R20 (correct marker CSS) → R21 (correct marker JSX)
R23 (progress dots CSS) → R24 (progress dots JSX)
R25 (countdown CSS) → R26 (countdown JSX)

R3 (event meta color) - independent
R4 (event title) - independent
R5 (XP value) - independent (blocked by DECISION R1)
R12 (leaderboard tabs) - independent
R17 (you tag) - independent
R22 (next button) - independent
```

---

## 7. SUMMARY

**Total Tasks:** 33 (Lobby: 7, Results: 26)

**Tasks Blocked by Decisions:**
- R5 (XP value gold) → DECISION R1
- R15 (LB rank gold) → DECISION R1
- R18 (LB XP gold) → DECISION R1
- R20 (correct marker green) → DECISION R2

**High-Impact Decisions (must resolve before certain tasks):**
- DECISION R1: Gold vs Orange for XP/rank/score (blocks R5, R15, R18)
- DECISION R2: Green vs Orange for correct marker (blocks R20, R21)

**Out-of-Scope Structural Decisions (documented but not tasks):**
- Lobby grid layout (DECISION L1)
- Lobby card merging (DECISION L2)
- Lobby pool name splitting (DECISION L3)
- Lobby extra features (DECISION L4)
- Lobby RELAX MODE tag (DECISION L5)
- Event card layout (DECISION R3)
- Event description inline vs modal (DECISION R4)
- WHERE/WHEN structure (DECISION R5)
- Expandable hints (DECISION R6)
- Combo badge rendering (DECISION R7)

---

**END OF PLAN**