# Home Page Replication Guide for AI Coders

## Overview

The current home page (`/home`) is a full-screen background image with a frosted overlay containing three mode selection cards in a horizontally scrollable carousel (mobile) or centered grid (desktop). It is served at `/home` via React Router, wrapped in `MainLayout`.

## Architecture

```
BrowserRouter
  └─ /home (MainLayout)
       └─ HomePage (Outlet)
```

### Key Files
- **Route entry**: `src/pages/HomePage.tsx`
- **Layout wrapper**: `src/layouts/MainLayout.tsx`
- **App routing**: `src/App.tsx:358-361`

---

## Dependencies & Imports

### UI Components
| Import | Source | Purpose |
|--------|--------|---------|
| `GlobalSettingsModal` | `@/components/GlobalSettingsModal` | Settings modal (unused on this page but imported) |
| `AuthModal` | `@/components/AuthModal` | Auth gate for unregistered users |
| `Slider` | `@/components/ui/slider` | Timer/year range sliders |
| `Input` | `@/components/ui/input` | Inline editable year/timer values |
| `Label` | `@/components/ui/label` | Accessible labels for toggles |
| `Switch` | `@/components/ui/switch` | Feature toggles (timer, year range) |
| `Button` | `@/components/ui/button` | CTAs |
| `Logo` | `@/components/Logo` | Logo image (`/icons/logo.webp`) |
| `HomeInstallModule` | `@/components/pwa/HomeInstallModule` | PWA install prompt |
| `AchievementModal` | `@/components/badges/AchievementModal` | Achievement popup queue |

### Hooks & Stores
| Import | Source | Purpose |
|--------|--------|---------|
| `useAuth` | `@/hooks/useAuth` | `{ user, isGuest }` |
| `useSettingsStore` | `@/lib/useSettingsStore` | Zustand store for timer/year preferences |
| `useGameLaunchers` | `@/hooks/useGameLaunchers` | `{ startGame, startLevelUpGame }` from GameContext |
| `useGameStore` | `@/store/useGameStore` | `{ isLoading }` |
| `useVibrate` | `@/hooks/useVibrate` | Haptic feedback helper |
| `useAchievementModalQueue` | `@/hooks/useAchievementModalQueue` | Badge achievement queue |
| `useToast` | `@/hooks/use-toast` | Error toasts |

### Services
| Import | Source | Purpose |
|--------|--------|---------|
| `fetchUserSettings` | `@/utils/profile/profileService` | Load persisted user settings |
| `fetchUserProfile` | `@/utils/profile/profileService` | Load profile (for `level_up_best_level`) |

---

## Visual Structure

### Background
```
Fixed fullscreen div
├── backgroundImage: url("/images/background.webp")
├── backgroundSize: cover
├── backgroundColor: '#121212'
└── z-0
```

### Content Overlay
```
Absolute inset-0 div
├── z-[100]
├── backdropFilter: 'blur(8px)'
├── backgroundColor: 'rgba(255, 255, 255, 0.75)'
├── overflow-y: auto
└── Centered max-w-6xl container
    ├── Logo (centered, mt-[6.5rem])
    ├── Cards container (flex row, snap-x on mobile)
    │   ├── Spacer (mobile only, centers first card)
    │   ├── Practice Card (orange gradient)
    │   ├── Level Up Card (purple-pink gradient)
    │   ├── Compete Card (cyan gradient)
    │   └── Spacer (mobile only, centers last card)
    ├── HomeInstallModule (PWA prompt)
    ├── GlobalSettingsModal
    ├── AuthModal
    └── AchievementModal
```

---

## Card Specifications

All three cards share the same base dimensions: `w-[13.5rem] h-[13.5rem]` for the image area.

### Practice Card (`classic` mode)
- **Gradient**: `linear-gradient(180deg, #fcd34d 0%, #f97316 60%, #ea580c 100%)`
- **Icon**: `/icons/practice.webp`
- **Title**: "PRACTICE" (gray-800 bar, rounded-b-xl)
- **Subtitle**: "Solo warm-up"
- **Controls below**:
  - Round Timer toggle (Switch + Slider 5s–5m, 5s step)
  - Years toggle (Switch + dual Slider -100 to 2025)

### Level Up Card (`levelup` mode)
- **Gradient**: `linear-gradient(to bottom, pink-300, fuchsia-400, purple-600)`
- **Icon**: `/icons/level.webp`
- **Title**: "LEVEL UP"
- **Subtitle**: "Progressive runs"
- **Level badge**: Shows `Math.max(1, profile?.level_up_best_level ?? 1)`
- **Guest lock overlay**: Black/80 pill with lock icon if `isGuest`

### Compete Card (`friends` mode)
- **Gradient**: `linear-gradient(180deg, #45fff0 0%, #00adc1 100%)`
- **Icon**: `/icons/compete.webp`
- **Title**: "COMPETE"
- **Subtitle**: "Friends lobby"
- **Guest lock overlay**: Same as Level Up

---

## State & Logic

### Loading State (`isLoaded`)
- Starts `false`
- `loadUserData()` fetches `fetchUserSettings(user.id)` + `fetchUserProfile(user.id)` in parallel
- On success: hydrates `useSettingsStore` via `setFromUserSettings()`
- Sets `isLoaded = true` in `finally`
- Guest users skip fetching and immediately set `isLoaded = true`

### Auth Gating (`startMode`)
```
if (!user) → show AuthModal, save pendingMode
if (isGuest && mode in REGISTERED_ONLY_MODES) → show AuthModal
  REGISTERED_ONLY_MODES = new Set(['levelup', 'friends'])
```

### Mode Launch Flow
| Mode | Action |
|------|--------|
| `friends` | `navigate('/compete')` |
| `levelup` | `await startLevelUpGame(bestLevel)` |
| `classic` | `await startGame({ timerEnabled, timerSeconds, hintsPerGame: 5, minYear, maxYear })` |

### Timer Editing
- Click timer value → switches to `<Input>` with `inputMode="numeric"`
- Enter/Blur commits (clamped 5–300, snapped to 5s)
- Escape cancels

### Year Range Editing
- Click start/end year values → inline `<Input>`
- Same commit/cancel behavior as timer
- Slider uses dual-thumb range `[-100, 2025]`

### Post-Auth Resume
```
useEffect(() => {
  if (pendingMode && user && !isGuest && !showAuthModal) {
    startMode(pendingMode, { skipAuthCheck: true });
  }
}, [user, isGuest, showAuthModal, pendingMode]);
```

### Mobile Scroll Positioning
On load (`isLoaded` + mobile width), auto-scrolls the carousel to center the Level Up card:
```
const target = levelUpCard.offsetLeft - (containerWidth - cardWidth) / 2;
container.scrollTo({ left: target, behavior: 'auto' });
```

---

## Key Assets Required

| Path | Usage |
|------|-------|
| `/images/background.webp` | Fullscreen background |
| `/icons/logo.webp` | Logo in nav + home |
| `/icons/practice.webp` | Practice card image |
| `/icons/level.webp` | Level Up card image |
| `/icons/compete.webp` | Compete card image |
| `/icons/lock.webp` | Guest lock overlay |

---

## Styling Constants

```tsx
const YEAR_RANGE_MIN = -100;
const YEAR_RANGE_MAX = 2025;
const minTimerValue = 5;
const maxTimerValue = 300;
const stepSize = 5;
```

Tailwind custom classes used:
- `no-scrollbar` (hide scrollbars on card container)
- `snap-x snap-mandatory` (mobile carousel snapping)
- `touch-pan-x overscroll-x-contain` (mobile scroll behavior)
- `bg-history-light dark:bg-black` (in MainLayout nav)

---

## Event Listeners

- `profileUpdated` (window): Refetches profile to update Level Up badge
- `useLocation` state `requireRegistration`: Shows auth modal for guests

---

## To Replicate

1. **Route**: Add `<Route path="/home" element={<MainLayout />}>` with `<Route index element={<HomePage />} />`
2. **Providers**: Wrap in `AuthProvider`, `GameProvider`, `ThemeProvider`, `TooltipProvider`
3. **Copy** `src/pages/HomePage.tsx` and all listed imports
4. **Ensure assets** in `public/images/` and `public/icons/`
5. **Wire stores**: `useSettingsStore` (Zustand + persist), `useGameStore`
6. **Implement** `useGameLaunchers` returning `{ startGame, startLevelUpGame }`
7. **Implement** `fetchUserSettings` and `fetchUserProfile` from Supabase
8. **Style**: Dark overlay with frosted glass, horizontal scroll carousel on mobile
