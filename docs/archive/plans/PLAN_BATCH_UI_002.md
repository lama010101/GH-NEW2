# GUESS-HISTORY — BATCH UI-002 IMPLEMENTATION PLAN
**Project:** GUESS-HISTORY  
**Task ID:** MP-PLAN-DEVIN-002  
**Version:** 1.0  
**Created:** 2026-06-17  
**Status:** ACTIVE

---

## 0. DOCUMENT AUTHORITY

Binding references:
- `docs/KNOWN_CONSTRAINTS.md` (KC-001 through KC-007)
- `docs/PROGRESS.md`
- `docs/GUESS_HISTORY_MASTER_SPEC.md`
- `docs/GAME_MODES_SPEC.md` (Section 1.2 — Round Result Screen)

Immovable architecture rules:
- broadcastStateUpdate in partykit/server.ts must NEVER use room.broadcast()
- Single write authority: src/server/sessionCore.ts
- src/app/prototype/ is permanently off-limits
- src/server/sessionCore.ts and partykit/server.ts require explicit CTO-reviewed justification if touched
- KC-001 GUARD: grep -n "sheetFieldWrap" src/components/compete/RoundActiveSection.module.css | grep "z-index: 1001"
- KC-007 GUARD: grep -c -- "--gh-" src/app/globals.css → must return 9 or greater
- str_replace/sed only. Never a full file rewrite.
- One file per atomic sub-task wherever possible.

---

## 1. DECISIONS NEEDED

### Visual Confirmation Required (Not Blockers)

1. **Background darkness values — C1.2 and C1.4 use plan defaults (pending visual confirmation post-deploy):**
   - TASK C1.2 (Round cinematic image): Implemented with `brightness(0.7)` per original plan default — distinct from the CTO-specified 0.8 value used for shared background asset
   - TASK C1.4 (Result screen event photos): Implemented with `brightness(0.75)` per original plan default — distinct from the CTO-specified 0.8 value used for shared background asset
   - These values are per-event photography adjustments, not the shared site background asset. Visual confirmation needed after deploy to determine if further adjustment required.

2. **WHERE/WHEN card border colors (TASK C2):**
   - WHERE card: Current uses --gh-teal (#22d3ee) → Proposed: --gh-blue (#3b82f6) per spec
   - WHEN card: Current uses --gh-violet (#8b5cf6) → Keep as-is (matches spec)
   - General cards (Accuracy, XP, Event info): White border → Proposed: rgba(255,255,255,0.8) or 1px solid #ffffff

3. **Font token gaps (TASK C4):**
   - If any legitimate use case lacks an existing token, list here for new token creation (do not invent silently)

### Resolved Decisions

- **Background darkening value (items 1–2 above):** RESOLVED at 0.8 for all pages using the shared background asset (`/home_background.webp`). Applied to:
  - `src/app/home.module.css` — `.bgOverlay` changed from rgba(0,0,0,0.58) to rgba(0,0,0,0.8)
  - `src/app/compete/[gameId]/page.module.css` — `.bgScrim` changed from rgba(0,0,0,0.55) to rgba(0,0,0,0.8)
  - Note: All other usages of `home_background.webp` are in `src/app/prototype/` which is permanently off-limits per KC rules.

### Pre-Existing Build Error (Not in Scope)

- `src/app/prototype/round-results/page.tsx:123` has syntax error (missing closing quote in className)
- This is outside scope (prototype directory) and should not be fixed as part of this batch

---

## 2. RISK RATINGS

| Task ID | Risk | Justification |
|---------|------|---------------|
| MP-INV-PKCE-HISTORY-001 | LOW | Read-only investigation, no code changes |
| MP-REFACTOR-CARD-TOKENS-001 | MEDIUM | Touches globals.css (KC-007 guard), affects multiple CSS modules |
| MP-REFACTOR-INLINE-STYLES-001 | LOW | Pure refactoring, no behavior changes, well-scoped files |
| MP-FEAT-BG-DARKEN-001 | MEDIUM | Visual changes require judgment, affects multiple locations |
| MP-FEAT-CARD-FRAME-COLOR-001 | LOW | Spec-locked decisions, straightforward color token swaps |
| MP-FEAT-LEADERBOARD-TAB-VISIBILITY-001 | LOW | UI-only change, no state/logic modifications |
| MP-FIX-FONT-CONSISTENCY-001 | HIGH | History of regressions (MP-FIX-FONT-MOBILE-001), app-wide scope |

---

## 3. ATOMIC TASK DEFINITIONS

### PHASE A: STATUS VERIFICATION

#### TASK A1 — MP-INV-PKCE-HISTORY-001
**ID:** `MP-INV-PKCE-HISTORY-001`  
**Phase:** A  
**File(s):** `src/core/supabaseBrowser.ts` (read-only)  
**Function/Component:** OAuth flowType configuration  
**Current State from investigation:**
- Commit 844b033 (2026-06-10): "MP-FIX-AUTH-SIGNIN-005: remove flowType pkce from browser supabase singleton" — removed `flowType: 'pkce'` from createBrowserClient options
- Commit 9499f2e (2026-06-17): "MP-FIX-AUTH-OAUTH-PKCE-001: set flowType to pkce to match server-side code exchange" — re-added `flowType: "pkce"` to createClient options
- No OAuth callback route changes found in git log for these commits

**Proposed Change:** None (investigation-only)  
**Before/After:** N/A  
**Validation commands:** None  
**Dependencies:** None  
**Output:** Report findings only — original removal commit 844b033, its message, and context indicating why it was removed (signin fix), then re-addition commit 9499f2e.

---

### PHASE B: DESIGN SYSTEM FOUNDATION

#### TASK B1 — MP-REFACTOR-CARD-TOKENS-001
**ID:** `MP-REFACTOR-CARD-TOKENS-001`  
**Phase:** B  
**File(s):** `src/app/globals.css`  
**Function/Component:** CSS custom properties (design tokens)  
**Current State from investigation:**
- Existing tokens: `--gh-glass-blur: blur(12px)`, `--gh-glass-shadow: 0 4px 24px rgba(0, 0, 0, 0.45)`, `--gh-glass-border: rgba(99, 155, 255, 0.28)`
- Hardcoded occurrences found:
  - `backdrop-filter: blur(6px)` (RoundActiveSection.module.css:104)
  - `backdrop-filter: blur(8px)` (RoundActiveSection.module.css:154)
  - `backdrop-filter: blur(12px)` (RoundActiveSection.module.css:241)
  - `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5)` (RoundActiveSection.module.css:248)
  - `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4)` (RoundActiveSection.module.css:308)
  - `box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5)` (RoundActiveSection.module.css:663)
  - `box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6)` (RoundActiveSection.module.css:497)
  - Various border values: `1px solid rgba(255, 255, 255, 0.35)`, `1px solid rgba(255, 255, 255, 0.12)`, etc.

**Proposed Change:** Add new tokens to `:root` in globals.css:
```css
/* --- Blur tokens --- */
--gh-blur-sm:  blur(6px);
--gh-blur-md:  blur(8px);
--gh-blur-lg:  blur(12px);

/* --- Shadow tokens --- */
--gh-shadow-sm:  0 2px 8px rgba(0, 0, 0, 0.4);
--gh-shadow-md:  0 4px 20px rgba(0, 0, 0, 0.5);
--gh-shadow-lg:  0 8px 28px rgba(0, 0, 0, 0.5);
--gh-shadow-xl:  0 -10px 40px rgba(0, 0, 0, 0.6);

/* --- Border tokens --- */
--gh-border-medium: rgba(255, 255, 255, 0.35);
--gh-border-strong: rgba(255, 255, 255, 0.50);
```

**Before/After:** N/A (new tokens added)  
**Validation commands:**
- `grep -c -- "--gh-" src/app/globals.css` → must return ≥ 9 (pre-edit)
- `grep -c -- "--gh-" src/app/globals.css` → must return ≥ 20 (post-edit, +11 new tokens)
- `npx tsc --noEmit` → exit 0
- `npm run build` must show only the documented prototype baseline error (see Correction 5)

**Dependencies:** None  
**Note:** This task provides border tokens for TASK C2. 
- Use existing `--gh-border-default` (rgba(255, 255, 255, 0.12)) instead of creating a duplicate subtle token.
- C2 should reference `--gh-border-default` for subtle borders, `--gh-border-medium` for medium, `--gh-border-strong` for strong.

---

#### TASK B2 — MP-REFACTOR-INLINE-STYLES-001
**ID:** `MP-REFACTOR-INLINE-STYLES-001`  
**Phase:** B  
**File(s):** 5 files (5 sub-tasks)  
**Function/Component:** Container element inline style props  
**Current State from investigation:**

**Sub-task B2.1 — RoundCompleteSection.tsx:**
- 4 `style={{}}` occurrences:
  - Line 252: `style={{ ...getUsernameGradientStyle(row.playerId), fontWeight: row.isMe ? 700 : 500 }}` → **EXCLUDED** (computed gradient)
  - Line 259: `style={{ color: accColor, fontSize: "var(--gh-font-base)" }}` → **EXCLUDED** (already uses token, computed color)
  - Line 274: `style={{ ...getUsernameGradientStyle(p.playerId), fontWeight: isMe ? 700 : 500 }}` → **EXCLUDED** (computed gradient)
  - Line 417: `style={{ "--dot-bg": isDone ? "#f97316" : isCurrent ? "var(--gh-orange)" : "#374151", "--dot-opacity": isCurrent ? 0.7 : 1 }}` → **EXCLUDED** (CSS custom properties, computed)

**Sub-task B2.2 — WhereCard.tsx:**
- 4 `style={{}}` occurrences:
  - Line 87: `style={{ fontSize: 25, fontWeight: 700, color: locColor }}` → **TOKENIZE** `fontSize: 25` to `fontSize: "var(--font-2xl)"` (24px is close, or keep as-is if 25px is intentional)
  - Line 203-205: `style={{ background: r.playerId === playerId ? "rgba(255,255,255,0.06)" : "transparent", borderBottom: ... }}` → **EXCLUDED** (computed conditional)
  - Line 211: `style={{ ...getUsernameGradientStyle(r.playerId), fontWeight: ... }}` → **EXCLUDED** (computed gradient)
  - Line 221: `style={{ color: locAccColor, fontSize: "var(--font-base)" }}` → **EXCLUDED** (already uses token, computed color)

**Sub-task B2.3 — WhenCard.tsx:**
- 7 `style={{}}` occurrences:
  - Line 116: `style={{ fontSize: 25, fontWeight: 700, color: whenColor }}` → **TOKENIZE** `fontSize: 25` to `fontSize: "var(--font-2xl)"` (same as WhereCard)
  - Line 167: `style={{ left: `${correctXPercent}%` }}` → **EXCLUDED** (computed position)
  - Line 180: `style={{ left: `${tick.xPercent}%`, height: tick.isMajor ? 14 : 8 }}` → **EXCLUDED** (computed position/height)
  - Line 201-203: `style={{ left: `${clampedXPercent}%`, transform: ... }}` → **EXCLUDED** (computed position)
  - Line 215: `style={{ fontSize: row.isMe ? 15 : 10, fontWeight: ... }}` → **EXCLUDED** (computed conditional)
  - Line 255: `style={{ ...getUsernameGradientStyle(r.playerId), fontWeight: ... }}` → **EXCLUDED** (computed gradient)
  - Line 266: `style={{ color: accColor, fontSize: "var(--gh-font-base)" }}` → **EXCLUDED** (already uses token, computed color)

**Sub-task B2.4 — SessionComplete.tsx:**
- 10 `style={{}}` occurrences:
  - Lines 210, 221, 274, 336, 346, 356: All use `color: hsl(...)` computed from accuracy → **EXCLUDED** (computed colors)
  - Line 268: `style={{ width: `${Math.max(0, Math.min(100, player.avgAccuracy))}%` }}` → **EXCLUDED** (computed width)
  - Line 323: `style={{ cursor: 'pointer' }}` → **TOKENIZE** to CSS class
  - Line 344: `style={{ display: 'block', margin: '0 auto 2px' }}` → **TOKENIZE** to CSS class

**Sub-task B2.5 — compete/[gameId]/page.tsx:**
- 1 `style={{}}` occurrence:
  - Line 423: `style={{ position: "fixed", top: "16px", right: "16px", zIndex: 2000 }}` → **TOKENIZE** to CSS class

**Proposed Change:** 
- **DECISION:** Merge B2 with C4 per-file to avoid two separate diffs fighting over the same lines. Each file will have ONE coordinated sub-task that handles both inline style migration AND font-size tokenization where applicable.
- Sub-task B2.1+C4.1: RoundCompleteSection.tsx — No changes needed (all excluded)
- Sub-task B2.2+C4.2: WhereCard.tsx — Tokenize fontSize: 25 + any font-size fixes
- Sub-task B2.3+C4.3: WhenCard.tsx — Tokenize fontSize: 25 + any font-size fixes
- Sub-task B2.4+C4.4: SessionComplete.tsx — Tokenize static inline styles + any font-size fixes
- Sub-task B2.5+C4.5: compete/[gameId]/page.tsx — Tokenize position wrapper + any font-size fixes

**Before/After:** N/A (varies per file)  
**Validation commands:** (per sub-task)
- `npx tsc --noEmit` → exit 0
- `rm -rf .next && npm run build` → must show SAME baseline error (prototype only) and NO OTHER error outside src/app/prototype/
- `git diff --name-only` → must show ONLY the file for that sub-task

**Dependencies:** B1 (for any new tokens if needed)  
**Note:** This approach avoids conflicting edits on the same lines between B2 and C4.

---

### PHASE C: NEW VISUAL/UX FEATURES

#### TASK C1 — MP-FEAT-BG-DARKEN-001
**ID:** `MP-FEAT-BG-DARKEN-001`  
**Phase:** C  
**File(s):** Multiple (3-4 sub-tasks)  
**Function/Component:** Background image darkening  
**Current State from investigation:**

**Sub-task C1.1 — Home page mosaic:**
- File: `src/app/home.module.css`
- Current: `.bgImage` uses `background-image: url(/home_background.webp)` with `.bgOverlay` at `rgba(0, 0, 0, 0.58)`
- Text/UI sits on top (cards, tagline)
- Implementation: CSS background-image + overlay div

**Sub-task C1.2 — Round cinematic image:**
- File: `src/components/compete/RoundActiveSection.tsx` (line 440-448)
- Current: `<img>` tag with `className={styles.eventImg}`, no darkening
- Text/UI sits on top during IMAGE_PHASE
- Implementation: `<img>` tag

**Sub-task C1.3 — Compete lobby:**
- File: `src/app/compete/[gameId]/page.module.css` (NOT LobbySection.tsx — see below)
- Current: LobbySection has NO background image of its own. It is a transparent component that renders on top of the page-level background in compete/[gameId]/page.tsx. The page applies `.bgImage` (CSS background-image: `/home_background.webp`) and `.bgScrim` (overlay at `rgba(0, 0, 0, 0.55)`). Darkening the lobby view requires adjusting `.bgScrim` in `page.module.css`.
- Current darkening: `rgba(0, 0, 0, 0.55)` — already moderately dark.
- Note: Adjusting bgScrim affects ALL game states shown on that page (lobby, active round, results), not just the lobby phase. This is a scope concern — see Decisions Needed item 2 above.
- Implementation if in scope: increase `.bgScrim` from `rgba(0, 0, 0, 0.55)` to `rgba(0, 0, 0, 0.65)`

**Sub-task C1.4 — Result screen event images:**
- File: `src/components/compete/RoundCompleteSection.tsx` (line 151-158)
- Current: `<img>` tag with `className={styles.eventImage}`, no darkening
- Text/UI sits on top (event title, description)
- Implementation: `<img>` tag

**Proposed Change:** 
- **C1.1 (Home — CTO locked value 0.8):** Change `.bgOverlay` from `rgba(0, 0, 0, 0.58)` to `rgba(0, 0, 0, 0.8)` in `src/app/home.module.css`
- **C1.2 (Cinematic — plan default brightness 0.7):** Add `filter: brightness(0.7)` to `.eventImg` in RoundActiveSection.module.css — uses plan default, pending visual confirmation post-deploy
- **C1.3 (Lobby — CTO locked value 0.8):** Change `.bgScrim` from `rgba(0, 0, 0, 0.55)` to `rgba(0, 0, 0, 0.8)` in `src/app/compete/[gameId]/page.module.css`
- **C1.4 (Result event — plan default brightness 0.75):** Add `filter: brightness(0.75)` to `.eventImage` in RoundCompleteSection.module.css — uses plan default, pending visual confirmation post-deploy

**Before/After:** N/A (varies per location)  
**Validation commands:** (per sub-task)
- `npx tsc --noEmit` → exit 0
- `npm run build` must show only the documented prototype baseline error
- Visual inspection of each location

**Dependencies:** None  
**Note:** 
- C1.1 and C1.3 use the shared background asset (`/home_background.webp`) and are locked at 0.8 per CTO decision.
- C1.2 and C1.4 are per-event photography (different from the shared background) and use plan defaults (0.7 and 0.75), pending visual confirmation after deploy.
- Use overlay div where text/UI layers on top (C1.1, C1.3), filter where no overlay exists (C1.2, C1.4).

---

#### TASK C2 — MP-FEAT-CARD-FRAME-COLOR-001
**ID:** `MP-FEAT-CARD-FRAME-COLOR-001`  
**Phase:** C  
**File(s):** `src/components/compete/RoundCompleteSection.module.css`, `WhereCard.module.css`, `WhenCard.module.css`  
**Function/Component:** Card background and border styling  
**Current State from investigation:**
- **LOCKED DECISIONS (do not re-litigate):**
  - All round-result-screen cards: background rgba(0,0,0,0.8) — 80% opaque black
  - Border/frame color by card type: white = general cards, blue = WHERE card, purple = WHEN card
  - No separate combo card (WHERE + WHEN combined, not independent)
- **Current implementation:**
  - WhereCard: `background: var(--gh-where-card-bg)` (rgba(6, 182, 212, 0.18)), `border: 1px solid var(--gh-where-card-border)` (rgba(6, 182, 212, 0.50))
  - WhenCard: `background: var(--gh-when-card-bg)` (rgba(139, 92, 246, 0.18)), `border: 1px solid var(--gh-when-card-border)` (rgba(139, 92, 246, 0.50))
  - General cards (Accuracy, XP, Event info, Leaderboard, Hints, Countdown): `background: var(--gh-glass-bg)` (rgba(30, 30, 40, 0.75)), `border: 1px solid var(--gh-glass-border)` (rgba(99, 155, 255, 0.28))
- **Existing tokens in globals.css:**
  - `--gh-blue: #3b82f6`
  - `--gh-violet: #8b5cf6`
  - `--gh-teal: #22d3ee` (currently used by WhereCard title, not border)

**Proposed Change:**

**Sub-task C2.1 — Update globals.css tokens:**
```css
/* ── WHERE / WHEN card backgrounds (updated per MP-FEAT-CARD-FRAME-COLOR-001) ── */
--gh-where-card-bg:        rgba(0, 0, 0, 0.8);  /* 80% opaque black per spec */
--gh-where-card-border:    rgba(59, 130, 246, 0.8);  /* --gh-blue with opacity */
--gh-when-card-bg:         rgba(0, 0, 0, 0.8);  /* 80% opaque black per spec */
--gh-when-card-border:     rgba(139, 92, 246, 0.8);  /* --gh-violet with opacity */
--gh-general-card-bg:      rgba(0, 0, 0, 0.8);  /* 80% opaque black per spec */
--gh-general-card-border:  rgba(255, 255, 255, 0.8);  /* white with opacity */
```

**Sub-task C2.2 — Update WhereCard.module.css:**
- Change `.card` background from `var(--gh-where-card-bg)` to `var(--gh-general-card-bg)` (all cards same background per spec)
- Change `.card` border from `var(--gh-where-card-border)` to `var(--gh-where-card-border)` (already correct, just token value update)
- **LEAVE box-shadow/glow untouched** — the locked spec covers background color + border color only. Do not remove glow unless it produces a visible conflict with the new background/border (if conflict found, stop and report instead of unilateral removal)

**Sub-task C2.3 — Update WhenCard.module.css:**
- Change `.card` background from `var(--gh-when-card-bg)` to `var(--gh-general-card-bg)` (all cards same background per spec)
- Change `.card` border from `var(--gh-when-card-border)` to `var(--gh-when-card-border)` (already correct, just token value update)
- **LEAVE box-shadow/glow untouched** — the locked spec covers background color + border color only. Do not remove glow unless it produces a visible conflict with the new background/border (if conflict found, stop and report instead of unilateral removal)

**Sub-task C2.4 — Update RoundCompleteSection.module.css:**
- Change all general cards (`.eventCard`, `.accuracyCard`, `.leaderboardCard`, `.hintsCard`, `.countdownCard`) from `var(--gh-glass-bg)` to `var(--gh-general-card-bg)`
- Change all general cards from `var(--gh-glass-border)` to `var(--gh-general-card-border)`

**Before/After:** 
- Before: Varied card backgrounds (glass effect), WHERE uses teal-ish border, WHEN uses violet border, general cards use blue-ish border
- After: All cards uniform 80% opaque black background, WHERE = blue border, WHEN = violet border, general = white border

**Validation commands:**
- `grep -c -- "--gh-" src/app/globals.css` → must return ≥ 9 (pre-edit)
- `grep -c -- "--gh-" src/app/globals.css` → must return ≥ 24 (post-edit, +3 new tokens)
- `npx tsc --noEmit` → exit 0
- `rm -rf .next && npm run build` → must show SAME baseline error (prototype only) and NO OTHER error outside src/app/prototype/

**Dependencies:** B1 (for border tokens if needed, but using direct rgba values here)  
**Note:** Exact hex/rgba values listed in Decisions Needed for visual confirmation. Using best proposal: --gh-blue (#3b82f6) and --gh-violet (#8b5cf6) with 0.8 opacity for borders.

---

#### TASK C3 — MP-FEAT-LEADERBOARD-TAB-VISIBILITY-001
**ID:** `MP-FEAT-LEADERBOARD-TAB-VISIBILITY-001`  
**Phase:** C  
**File(s):** `src/components/compete/RoundCompleteSection.module.css`  
**Function/Component:** Leaderboard tab toggle styling  
**Current State from investigation:**
- Location: `src/components/compete/RoundCompleteSection.module.css` lines 163-184
- Current implementation:
  - `.leaderboardTab`: `font-size: var(--font-xs)` (13px), `background: transparent`, `color: var(--gh-text-secondary)`, `padding: 6px 12px`
  - `.leaderboardTab:hover`: `color: var(--gh-text-primary)`, `background: var(--gh-bg-input)`
  - `.leaderboardTabActive`: `color: var(--gh-orange)`, `background: var(--gh-bg-input)`, `font-weight: 600`
- Issue: Users report not noticing the toggle

**Proposed Change:** Increase visual prominence by:
1. Increase font-size from `var(--font-xs)` (13px) to `var(--font-sm)` (14px)
2. Add stronger active state: `background: rgba(251, 146, 60, 0.15)` (subtle orange tint) for `.leaderboardTabActive`
3. Add bottom border for active tab: `border-bottom: 2px solid var(--gh-orange)` for `.leaderboardTabActive`
4. Increase padding from `6px 12px` to `8px 16px` for larger touch target

**Before/After:**
- Before: Small 13px text, subtle background change, no visual indicator other than color
- After: Larger 14px text, orange-tinted background, orange bottom border, larger padding

**Validation commands:**
- `npx tsc --noEmit` → exit 0
- `rm -rf .next && npm run build` → must show SAME baseline error (prototype only) and NO OTHER error outside src/app/prototype/
- Visual inspection of tab toggle

**Dependencies:** None  
**Note:** UI-only change, no state or logic modifications.

---

#### TASK C4 — MP-FIX-FONT-CONSISTENCY-001
**ID:** `MP-FIX-FONT-CONSISTENCY-001`  
**Phase:** C  
**File(s):** Multiple (area-based sub-tasks)  
**Function/Component:** App-wide font consistency  
**Current State from investigation:**
- 357 total `font-size:` / `fontSize:` occurrences (excluding prototype directory)
- Many already use `var(--font-*)` tokens (compliant)
- Some hardcoded values remain in CSS modules
- Computed values in .tsx files (exclude per rules)
- Layout-constrained micro-labels ≤11px (exclude per established exception)

**Classification from investigation:**
- **(a) Already using tokens — compliant:** Most of RoundCompleteSection.module.css, SessionComplete.module.css, etc.
- **(b) Static literal values — should be tokenized:** Found in multiple CSS modules
- **(c) JS-computed values — excluded:** fontSize: size * 0.42, fontSize: row.isMe ? 15 : 10, etc.
- **(d) Layout-constrained ≤11px — excluded:** Already marked with `/* layout-constrained — do not tokenize */` comments

**Proposed Change:** Decompose into area-based sub-tasks (mirroring prior Group 1–6 structure):

**Sub-task C4.1 — RoundCompleteSection.module.css:**
- Already compliant — all use `var(--font-*)` tokens or are marked layout-constrained
- **NO CHANGES NEEDED**

**Sub-task C4.2 — WhereCard.module.css + WhenCard.module.css:**
- WhereCard: Already compliant — uses `var(--font-lg)`, `var(--font-2xs)`, or layout-constrained
- WhenCard: Already compliant — uses `var(--gh-font-lg)`, `var(--font-2xs)`, or layout-constrained
- **NO CHANGES NEEDED**

**Sub-task C4.3 — SessionComplete.module.css:**
- Already compliant — uses `var(--font-2xl)`, `var(--font-2xs)`, `var(--font-xs)`, or layout-constrained
- **NO CHANGES NEEDED**

**Sub-task C4.4 — RoundActiveSection.module.css:**
- Already compliant — uses `var(--font-sm)`, `var(--font-base)`, or layout-constrained
- **NO CHANGES NEEDED**

**Sub-task C4.5 — compete/page.tsx + compete/[gameId]/page.tsx:**
- compete/page.tsx: Already compliant
- compete/[gameId]/page.tsx: Already compliant
- **NO CHANGES NEEDED**

**Sub-task C4.6 — compete/page.tsx + compete/[gameId]/page.tsx (fontSize audit):**
- **src/app/compete/page.tsx:** AUDITED — one inline style at line 154: `fontSize: "var(--font-2xs)"` — already uses token, COMPLIANT. No changes needed.
- **src/app/compete/[gameId]/page.tsx:** AUDITED — zero inline `fontSize` occurrences. No changes needed.
- **NO CHANGES NEEDED**

**Sub-task C4.7 — Page-level CSS modules (account, help, leaderboard, etc.):**
- `src/app/account/account.module.css`: Lines 24, 174, 179 use hardcoded 15px, 13px → Tokenize to `var(--font-base)`, `var(--font-xs)`
- `src/app/help/help.module.css`: Multiple hardcoded values (20px, 12px, clamp(32px, 6vw, 52px), etc.) → Tokenize where appropriate to existing tokens
- `src/app/leaderboard/leaderboard.module.css`: Already compliant
- Other page-level files: Investigate and tokenize hardcoded values

**Sub-task C4.8 — Component CSS modules (AuthModal, HintModal, NavModal, etc.):**
- Most already compliant per MP-FIX-FONT-MOBILE-002
- Investigate any remaining hardcoded values

**Before/After:** N/A (varies per file)  
**Validation commands:** (per sub-task)
- `npx tsc --noEmit` → exit 0
- `rm -rf .next && npm run build` → must show SAME baseline error (prototype only) and NO OTHER error outside src/app/prototype/
- `git diff --name-only` → must show ONLY the file(s) for that sub-task

**Dependencies:** B2 (merged per-file to avoid conflicts)  
**Note:** 
- **CRITICAL:** Do NOT change any existing token VALUE in globals.css. Only fix USAGE.
- If a gap is found where no existing token fits, list under Decisions Needed instead of inventing silently.
- Decompose into atomic per-area sub-tasks, each with its own commit.

---

### PHASE D: MANDATORY FINAL BUILD GATE

#### TASK D1 — FINAL BUILD VERIFICATION
**ID:** `MP-FINAL-BUILD-002`  
**Phase:** D  
**File(s):** None (verification step)  
**Function/Component:** Full clean build verification  
**Current State from investigation:**
- Pre-existing build error in `src/app/prototype/round-results/page.tsx:123` (syntax error, missing closing quote)
- This is outside scope (prototype directory) and should not be fixed

**Proposed Change:** 
After every task above is implemented and individually committed:
```bash
rm -rf .next && npm run build
```

**Validation:** The batch is not complete until the build shows zero errors outside the documented prototype baseline. The pre-existing error in `src/app/prototype/round-results/page.tsx:123` (syntax error, missing closing quote) is allowed and expected.

**Exception handling:**
- If build fails with errors outside `src/app/prototype/`: Diagnose and fix it, scoped to the minimum change needed
- Commit any fix as its own atomic commit with task ID format `MP-FIX-BUILD-CLEANUP-NNN`
- Log fix in `docs/PROGRESS.md`
- Report explicitly what was broken and why for CTO review
- **EXCEPTION:** If build failure traces to `src/server/sessionCore.ts` or `partykit/server.ts`, STOP and report instead of fixing (these require dedicated CTO-reviewed scope)

**Dependencies:** All tasks in Phases A, B, C must be completed first  
**Note:** This is a closing step to be executed after all tasks above are committed, not during this planning step. Phase D's "zero errors" requirement is amended to "zero errors outside the documented prototype baseline."

---

## 4. SEQUENCING

**Proposed sequence (dependency-ordered):**

1. **A1** (MP-INV-PKCE-HISTORY-001) — Cheap, independent, read-only
2. **B1** (MP-REFACTOR-CARD-TOKENS-001) — Foundation for other tasks
3. **B2+C4 merged** (MP-REFACTOR-INLINE-STYLES-001 + MP-FIX-FONT-CONSISTENCY-001) — Coordinated per-file to avoid conflicts
4. **C2** (MP-FEAT-CARD-FRAME-COLOR-001) — Depends on B1 for border tokens
5. **C1** (MP-FEAT-BG-DARKEN-001) — Independent of others
6. **C3** (MP-FEAT-LEADERBOARD-TAB-VISIBILITY-001) — Independent of others
7. **D1** (FINAL BUILD VERIFICATION) — Always last

**Parallel execution opportunities:**
- **C1 and C3** can run in parallel (both independent)
- **C3** can run in parallel with B2+C4 (no overlap)
- **A1** can run at any time (read-only)

**Strict sequencing requirements:**
- B1 must complete before C2 (C2 consumes B1's border tokens)
- B2+C4 must be merged per-file to avoid conflicting edits
- D1 must always be last

---

## 5. VALIDATION SUMMARY

### Per-task validation gates

**Every atomic task must include:**

**STEP ZERO (before any edit):**
```bash
git add -A && git commit -m "wip: before [TASK-ID]"
npm run build  # Capture baseline error output
```
**Build baseline rule:** `npm run build` is allowed to show the documented pre-existing failure inside `src/app/prototype/` ONLY. Capture the exact baseline error output at STEP ZERO of the FIRST task in this batch (A1) and reuse that same baseline for comparison across all subsequent tasks — do not re-treat it as a new discovery each time.

**FINAL STEPS (after edits):**
```bash
npx tsc --noEmit  # Exit 0 required
rm -rf .next && npm run build  # Must show SAME baseline error (prototype only) and NO OTHER error outside src/app/prototype/
git diff --name-only  # Must show ONLY the files declared for that task
git add [files] && git commit -m "[TASK-ID]: [description]"
# Append one row to docs/PROGRESS.md
```
**Build gate rule:** After any task's changes, the build must show that SAME baseline error and NO OTHER error, anywhere outside `src/app/prototype/`. If a new error appears outside prototype, that is a real FAIL for that task — fix it scoped to the minimum change (or follow the sessionCore.ts/partykit.ts STOP exception if applicable). Prototype's pre-existing error is never something to fix, and it never blocks the batch from being declared complete.

### Special guards

**KC-001 GUARD** (if touching RoundActiveSection.module.css):
```bash
grep -n "sheetFieldWrap" src/components/compete/RoundActiveSection.module.css | grep "z-index: 1001"
# Must return a match
```

**KC-007 GUARD** (if touching globals.css):
```bash
grep -c -- "--gh-" src/app/globals.css
# Must return 9 or greater (pre-edit), verify count increases appropriately (post-edit)
```

---

## 6. APPENDIX: INVESTIGATION FINDINGS

### TASK A1 Findings

**Original removal commit:** 844b033 (2026-06-10)
- Message: "MP-FIX-AUTH-SIGNIN-005: remove flowType pkce from browser supabase singleton"
- Context: Removed `flowType: 'pkce'` from createBrowserClient options to fix a signin issue

**Re-addition commit:** 9499f2e (2026-06-17)
- Message: "MP-FIX-AUTH-OAUTH-PKCE-001: set flowType to pkce to match server-side code exchange"
- Context: Re-added `flowType: "pkce"` to createClient options to match server-side code exchange

**OAuth callback route:** No changes found in git log for the callback route related to these commits.

### TASK B1 Findings

**Hardcoded backdrop-filter values:**
- `blur(6px)` — RoundActiveSection.module.css:104
- `blur(8px)` — RoundActiveSection.module.css:154
- `blur(12px)` — RoundActiveSection.module.css:241

**Hardcoded box-shadow values:**
- `0 4px 20px rgba(0, 0, 0, 0.5)` — RoundActiveSection.module.css:248
- `0 2px 8px rgba(0, 0, 0, 0.4)` — RoundActiveSection.module.css:308
- `0 8px 28px rgba(0, 0, 0, 0.5)` — RoundActiveSection.module.css:663
- `0 -10px 40px rgba(0, 0, 0, 0.6)` — RoundActiveSection.module.css:497

**Hardcoded border values:**
- `1px solid rgba(255, 255, 255, 0.35)` — RoundActiveSection.module.css:115
- `1px solid rgba(255, 255, 255, 0.12)` — RoundActiveSection.module.css:156, 659
- `1.5px solid rgba(255, 255, 255, 0.35)` — RoundActiveSection.module.css:627
- `1px solid rgba(255, 255, 255, 0.15)` — RoundActiveSection.module.css:241
- And many more across compete CSS modules

### TASK B2 Findings

**Inline style classification:**
- **RoundCompleteSection.tsx:** 4 occurrences, all excluded (computed gradients, CSS custom properties, or already tokenized)
- **WhereCard.tsx:** 4 occurrences, 1 tokenizable (fontSize: 25), 3 excluded (computed)
- **WhenCard.tsx:** 7 occurrences, 1 tokenizable (fontSize: 25), 6 excluded (computed)
- **SessionComplete.tsx:** 10 occurrences, 2 tokenizable (static cursor, display/margin), 8 excluded (computed colors/widths)
- **compete/[gameId]/page.tsx:** 1 occurrence, 1 tokenizable (position wrapper)

### TASK C1 Findings

**Background image locations:**
- **Home page:** CSS background-image in `src/app/home.module.css` with overlay div at rgba(0,0,0,0.58). ALREADY DARK.
- **Round cinematic:** `<img>` tag in `src/components/compete/RoundActiveSection.tsx` (line 440-448), no darkening. ZERO CURRENT DARKENING — primary target.
- **Compete lobby (INVESTIGATION COMPLETE):** LobbySection.tsx has NO background image. It renders transparent cards on top of the page-level background in `src/app/compete/[gameId]/page.tsx`. That page applies `.bgImage` (CSS background-image: `/home_background.webp`, defined in `page.module.css`) and `.bgScrim` (overlay `rgba(0, 0, 0, 0.55)`). LobbySection itself has no darkening mechanism. Adjusting `.bgScrim` would affect ALL game phases on that page (lobby, active round, results). Current scrim value (0.55) is already moderately dark.
- **Result event images:** `<img>` tag in `src/components/compete/RoundCompleteSection.tsx` (line 151-158), no darkening. ZERO CURRENT DARKENING — primary target.

**Darkening baseline divergence (see Decisions Needed item 2):**
- Home page: rgba(0,0,0,0.58) overlay — already dark
- Compete lobby page: rgba(0,0,0,0.55) scrim — already dark, page-level not component-level
- Round cinematic image: NO darkening at all
- Result event images: NO darkening at all
- The intended targets for this task are most likely C1.2 and C1.4 (zero-darkening locations). C1.1 and C1.3 require explicit decision before touching.

### TASK C2 Findings

**Existing color tokens:**
- `--gh-blue: #3b82f6` — Already in globals.css
- `--gh-violet: #8b5cf6` — Already in globals.css
- `--gh-teal: #22d3ee` — Already in globals.css (currently used by WhereCard title, not border)

**Current card implementations:**
- **WhereCard:** Uses teal-ish border (rgba(6, 182, 212, 0.50)), not blue
- **WhenCard:** Uses violet border (rgba(139, 92, 246, 0.50)), matches spec
- **General cards:** Use blue-ish border (rgba(99, 155, 255, 0.28)), not white

### TASK C3 Findings

**Current tab styling:**
- Font size: `var(--font-xs)` (13px)
- Background: Transparent, changes to `var(--gh-bg-input)` on hover/active
- Active state: Orange color, subtle background, no border
- Padding: `6px 12px`

### TASK C4 Findings

**Font consistency status:**
- **Total occurrences:** 357 (excluding prototype)
- **Already compliant:** Most compete components already use tokens or are marked layout-constrained
- **Areas needing work:** Some page-level CSS modules (account, help) have hardcoded values
- **Inline fontSize:** WhereCard and WhenCard have `fontSize: 25` (should tokenize to `var(--font-2xl)` or keep if intentional)

**Flagged .tsx files — confirmed audit results:**
- **src/components/NavModal.tsx:** Zero `fontSize`/`font-size` occurrences. COMPLIANT. No action needed.
- **src/components/compete/RoundActiveSection.tsx:** Zero inline `fontSize` occurrences in .tsx. All font sizes are in the CSS module. COMPLIANT. No action needed.
- **src/app/compete/page.tsx:** One inline style at line 154 using `fontSize: "var(--font-2xs)"` — already uses token. COMPLIANT. No action needed.
- **src/app/compete/[gameId]/page.tsx:** Zero inline `fontSize` occurrences. COMPLIANT. No action needed.

**Pre-existing build error:**
- `src/app/prototype/round-results/page.tsx:123` has syntax error (missing closing quote in className)
- Outside scope (prototype directory), should not be fixed

---

**END OF PLAN**
