# HOME PAGE SPEC
**Project:** Guess-History  
**Document:** HOME_PAGE_SPEC.md  
**Version:** 1.1  
**Status:** AUTHORITATIVE — aligned with current implementation  
**Date:** 2026-07-21

---

## 0. Document Authority

This document describes the current `/home` page UI and behavior as implemented in:

- `src/app/home/page.tsx`
- `src/app/home/home.module.css`
- `src/components/layout/TopBar.tsx`
- `src/components/home/CompetePanel.tsx`
- `src/components/home/DailyPanel.tsx`
- `src/components/home/types.ts`
- `src/components/RankCard.tsx`
- `src/components/NavModal.tsx`
- `src/components/WelcomeModal.tsx`
- `src/components/practice/PracticeSettingsModal.tsx`
- `src/components/practice/PracticeResumeModal.tsx`

Binding references:
- `docs/GAME_MODES_SPEC.md` — mode rules
- `docs/STATS_SYSTEM.md` — XP/accuracy sources
- `src/core/rank.ts` — rank title and tier derivation
- `src/i18n/en.json` (namespace `home`) — UI copy

---

## 1. Layout Overview

The home page is a **full-viewport, scrollable** screen.

- Background: fixed full-bleed `home_background.webp` image with a dark scrim overlay (`var(--gh-modal-overlay)`).
- Content layer: a vertically scrolling area (`page-scroll`) padded below the fixed top bar.
- Max content width: `480px` mobile, `600px` desktop (`@media (min-width: 768px)`).
- Scroll is handled by the content layer, not the body, so the top bar stays fixed.

Vertical content order:

1. Fixed `TopBar` (z-index above content).
2. Optional kicked toast banner (`?kicked=1`).
3. Inline `RankCard`.
4. Centered tagline.
5. Vertical stack of four `ModeCard`s: **Compete → Daily → Level Up → Practice**.
6. Modals: `NavModal`, `WelcomeModal`, `PracticeSettingsModal`, `PracticeResumeModal`.

---

## 2. Top Bar

Implemented by `TopBar.tsx`.

### 2.1 Left zone — logo
- Clickable `Image` pointing to `/icons/logo.webp`.
- Navigates to `/home` on click.

### 2.2 Middle zone — rank / accuracy pill
- Left side: `RANK {tier}` where tier is derived from `totalXp` via `rankForXp`.
- Right side: global accuracy integer followed by `%`.
- Accuracy color is a dynamic HSL green-to-red gradient based on the value.

### 2.3 Right zone
- `NotificationBell` — opens the notifications route/modal.
- Circular avatar button. Shows `avatarUrl` if set; otherwise two-letter initials from the profile display name.
- Clicking the avatar opens `NavModal`.

---

## 3. Authentication & Loading State

- The page bootstraps identity with `bootstrapIdentity()`.
- If `identity.status === 'unauthenticated'`, the user is redirected to `/login?next=/home`.
- While loading, a full-screen loading indicator is shown. If it lasts more than 10s, a "clear session and restart" escape hatch appears.
- If identity bootstrap errors, a retry button and a force-clear button are shown instead of a blank screen.

---

## 4. New-User Welcome Flow

- New users are detected by comparing `created_at` and `last_sign_in_at` on the Supabase session (< 5 minutes) AND `profiles.welcome_completed === false`.
- A one-shot `triggerAssignAvatar()` POSTs to `/api/user/assign-avatar` and receives a generated historical avatar plus a display name.
- `WelcomeModal` opens automatically with the generated avatar and initial display name.
- On save, `PATCH /api/user/update-username` sets `display_name` and `welcome_completed: true`.
- The top-bar stats and initials are re-fetched after save via `profileVersion`.

---

## 5. Rank Card

- Rendered inline below the top bar.
- `RankCard` derives everything from `totalXp` using `rankForXp`.
- Shows:
  - Rank medallion image (from `/images/rank-titles/`).
  - Tier badge (`T{tier}`).
  - Rank title (localized).
  - Total XP formatted with locale.
  - Next-rank line + progress bar (orange fill, width from `progressPct`).

---

## 6. Tagline

Centered text below the rank card:

> "Where and when did it happen?"

Localized via `home.tagline`.

---

## 7. Mode Cards

All four cards share a horizontal row layout:

- Left: square icon thumbnail (`96px`) with a 15% white background and mode icon image from `/icons/{mode}_large.webp`.
- Middle: title + two-line description.
- Right: pill CTA button.

Card gradients are defined in `MODE_CARD_GRADIENT` (`src/components/home/types.ts`):

| Mode | Gradient key | Title copy key | Description copy key |
|---|---|---|---|
| Compete | `compete` | `home.compete_name` (`CHALLENGE`) | `home.compete_desc` |
| Daily | `daily` | `home.daily_name` (`DAILY`) | `home.daily_desc` |
| Level Up | `levelup` | `home.levelup_name` (`LEVEL UP`) | `home.levelup_desc` |
| Practice | `practice` | `home.practice_name` (`PRACTICE`) | `home.practice_desc` |

CTA pills:
- Non-compete cards show a play icon + `home.compete_play` (`PLAY`).
- Compete card shows a plus icon + `home.compete_create_game` (`CREATE`).

---

## 8. Mode-Specific Behavior

### 8.1 Compete card

- **Quick create:** the `CREATE` pill POSTs to `/api/compete/create` with a default sync configuration:
  - `mode: 'sync'`
  - `roundTimerSec: 120`
  - `totalRounds: 5`
  - `yearMin: -400`
  - `yearMax: 2025`
  - then navigates to `/compete/{gameId}`.
- **CompetePanel** is rendered inside the card body below the icon/text row.

### 8.2 CompetePanel tabs

Three tabs: `INVITATIONS`, `YOUR TURN`, `COMPLETED`.

**Invitations**
- Fetched from `/api/invitations/pending`.
- Live-updated via Supabase realtime on `game_invitations` INSERT for the current player, and refreshed every 15s and on window focus.
- Each row shows inviter avatar/initials, name, mode (`Rush` or `Relax`), time ago, accept (`✓` play) and decline (`✕`) buttons.
- Accept updates invitation status to `accepted`, marks the matching notification as read, then navigates to the lobby.

**Your Turn**
- Fetched from `/api/compete/active-games`.
- Lists active games where it is the player's turn.
- Each row shows opponent avatar/initials, opponent name, mode badge, round label (`Round {current} / {total}`), and a play button.

**Completed**
- Lists completed games.
- Shows result badge (`W` / `L` / `D`), the player's accuracy colored by value, XP earned, and leaderboard rank if available.

### 8.3 Daily card

- `DailyPanel` is rendered inline below the description.
- It shows a clock icon + `New challenge in {h}h {m}m`, counting down to the next UTC midnight and refreshing every minute.
- The `PLAY` pill navigates to `/daily`.

### 8.4 Level Up card

- The `PLAY` pill navigates to `/levelup`.
- Lobby/settings for Level Up are handled on the `/levelup` route, not on the home page.

### 8.5 Practice card

- The `PLAY` pill checks `localStorage` for `gh_practice_game_{playerId}`.
- If a stored game id exists, the app fetches `/api/compete/{storedGameId}?playerId={playerId}`:
  - If the game is not `SESSION_COMPLETE`, `PracticeResumeModal` opens (Resume or Create New).
  - Otherwise the stale localStorage entry is removed and `PracticeSettingsModal` opens.
- `PracticeSettingsModal` lets the player configure:
  - Round timer: toggle + slider from `TIMER_MIN_SEC` (15s) to `TIMER_MAX_SEC` (300s); `0` means off.
  - Era presets: Ancient, Medieval, Early Modern, Modern, Contemporary (at least one must remain selected).
  - Region presets: Africa, Asia, Europe, North America, Oceania & Antarctica, South America.
- Defaults: all eras selected, all regions selected, timer `0` (off).
- Settings are persisted via `savePracticeSettings` and restored when the modal reopens.
- On start, settings are saved, the local practice game id is cleared, and the player is routed to `/practice`.

---

## 9. Navigation Modal

Opened by clicking the avatar in the top bar.

- Avatar + display name header.
- Menu items: **Home**, **Leaderboard**, **Profile & Stats** (`/progress`), **Account** (`/account`), **Help** (`/help`).
- Language dropdown.
- Theme toggle (light/dark).
- **Sign Out** — calls `signOut()` then navigates to `/` (or `/login` on failure).
- Closes on backdrop click or `Escape`.

---

## 10. Kicked Toast

If the URL contains `?kicked=1`, a red dismissible toast is shown for 5s and the query parameter is removed.

---

## 11. Responsive Behavior

| Viewport | Behavior |
|---|---|
| Mobile (< 768px) | Single column; cards stack vertically; max-width `480px`; top bar compact. |
| Desktop (≥ 768px) | Centered column; max-width `600px`; top bar unchanged. |

The page is always scrollable; there is no horizontal carousel.

---

## 12. Performance & UX Rules

- Background image is a single static asset; no mosaic grid is rendered.
- Rank and mode cards render eagerly; panels do not lazy-load.
- All images (`avatar`, rank medallion, mode icons) degrade gracefully to initials or hidden elements.
- The home page does **not** auto-advance anything.
- No hero marketing copy, no stats history list, no recent-games list outside the CompetePanel.

---

## 13. Localization

All user-facing strings are localized through `next-intl` from the `home` namespace in `src/i18n/*.json`. Colors, spacing, and layout use CSS variables (`var(--gh-text-primary)`, `var(--font-xl)`, etc.).

---

*Spec version 1.1 — Guess-History Home Page — aligned with implementation as of 2026-07-21*
