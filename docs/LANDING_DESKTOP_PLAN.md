# Desktop Landing Page with Sign-In Module — Plan

**Repo:** `lama010101/GH-NEW2`  
**Target:** Public `/` route for unauthenticated desktop users (`>= 768px`).  
**Assumption:** The current waitlist-style landing page is being upgraded to a desktop-first marketing + sign-in page. Authenticated users will continue to be redirected from `/` to `/home` by middleware.

---

## 1. Goal

Create a single desktop landing screen that:

- Presents the brand, tagline, and a short feature pitch on the left.
- Surfaces the full sign-in module inline on the right (not behind a separate `/login` click).
- Reuses the existing Supabase auth flow, i18n keys, and CSS design tokens.
- Keeps the page fully public, SEO-friendly (server-rendered shell), and responsive down to mobile.

---

## 2. Scope

### In scope
- `src/app/page.tsx` — server component, metadata, two-column layout for desktop.
- `src/components/landing/SignInModule.tsx` — new client component for inline sign-in/up/forgot-password.
- `src/app/page.module.css` — desktop layout, background, card container.
- New `landing` i18n keys for hero copy and feature bullets.
- Reuse existing `auth` namespace for the sign-in form itself.

### Out of scope (unless requested)
- Removing `/login` or `AuthModal` (they stay for mobile/modal flows).
- Changing middleware auth rules.
- Altering the Supabase schema.

---

## 3. Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  fixed full-bleed background + dark overlay                     │
│  ┌───────────────────────────────┐  ┌────────────────────────┐  │
│  │                               │  │  Sign-In Card          │  │
│  │  [logo]                       │  │  ─────────────         │  │
│  │  Where and when did it happen?│  │  Google sign-in        │  │
│  │                               │  │  ─ or ─                │  │
│  │  • Practice mode              │  │  [email    ]           │  │
│  │  • Daily challenge            │  │  [password ]           │  │
│  │  • Compete with friends       │  │  [Sign In]             │  │
│  │  • Level up progression       │  │  Forgot password?      │  │
│  │                               │  │  Don't have an account?│  │
│  │  [Join waitlist] (optional)   │  │                        │  │
│  └───────────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

- Background: reuse `/desktop-home_background.webp` + dark overlay (existing `page.module.css`).
- Container: max-width `1200px`, centered, `grid-template-columns: 1.4fr 1fr`, gap `48px`.
- On `< 768px`, stack to single column; sign-in card can render first for mobile.

---

## 4. Component Breakdown

### 4.1 `src/app/page.tsx` (server component)

- Keep `generateMetadata()` using `getTranslations('landing')`.
- Render fixed background image + overlay.
- Render two-column layout:
  - **Left column:** `Image` logo (`/icons/logo.webp`), `<h1>` tagline, `<p>` description, feature list.
  - **Right column:** `<SignInModule />` client component.
- Pass `returnTo` search param to `SignInModule` if present (`?next=/home` default).

### 4.2 `src/components/landing/SignInModule.tsx` (client component)

Reuse the behavior already proven in `AuthModal.tsx`:

- State: `mode` (`signin` | `signup`), `email`, `password`, `confirmPassword`, `loading`, `error`, `rememberMe`, `forgotSent`, `signUpSent`.
- Handlers:
  - `handleGoogleSignIn()` — same OAuth flow, redirect to `/auth/callback?next=...`.
  - `handleEmailAuth()` — `signInWithPassword` or `signUp`.
  - `handleForgotPassword()` — `resetPasswordForEmail`.
- On `SIGNED_IN` or confirmed signup, `router.push(next || '/home')`.
- Include `LanguageSwitcher` at the top of the card.
- Add `<form noValidate>` wrapper for Enter-key submit and better a11y.
- Markup:
  - Google button (white, centered icon).
  - Divider with `auth.or`.
  - Email + password inputs.
  - Remember-me checkbox (sign-in mode only).
  - Forgot password link (sign-in mode only).
  - Confirm password input (sign-up mode only).
  - Primary submit button (`var(--gh-orange)` background).
  - Mode switcher text button.
  - Error banner (`var(--gh-danger)`).
  - Success messages for forgot/confirm email.

### 4.3 Shared auth logic (recommended)

To avoid duplicating `AuthModal`, consider one of these paths:

- **Option A (minimal duplication):** Copy the handlers/state from `AuthModal.tsx` into `SignInModule.tsx`. Fastest, but two sources of truth for auth form logic.
- **Option B (cleaner):** Extract a presentational `AuthForm.tsx` component containing all inputs, handlers, and state. `AuthModal` becomes an overlay wrapper, and `SignInModule` renders `AuthForm` inline. This keeps one source of truth.

**Recommendation:** Option B, implemented as a single auth-form refactor PR first, then the landing page PR.

---

## 5. Styling & Tokens

All CSS must come from `src/app/globals.css` tokens. No hardcoded `font-size: NNpx` values.

### Layout tokens
- `grid-template-columns: 1.4fr 1fr`
- `gap: 48px`
- `max-width: 1200px; margin: 0 auto; padding: 48px 32px`

### Sign-in card
- Background: `var(--gh-bg-surface)` or `var(--gh-glass-bg)`.
- Border: `1px solid var(--gh-border-default)`.
- Radius: `var(--gh-radius-lg)` or `var(--gh-general-card-radius)`.
- Padding: `32px`.
- Shadow: `var(--gh-shadow-lg)`.
- Backdrop blur: `var(--gh-glass-blur)` (optional).

### Typography
- Logo alt text: `var(--font-3xl)`.
- Tagline/headline: `var(--font-2xl)`.
- Body/features: `var(--font-base)`.
- Input labels: `var(--font-sm)`.

### Colors
- Primary text: `var(--gh-text-primary)`.
- Secondary text: `var(--gh-text-secondary)`.
- Muted text: `var(--gh-text-muted)`.
- Primary button bg: `var(--gh-orange)`; text: `var(--gh-btn-text)`.
- Error: `var(--gh-danger)`.
- Success: `var(--gh-success)`.
- Google button: white `#ffffff` with dark text `#111827` (already authorized in `AuthModal.module.css`).

### Inputs
- `background: var(--gh-bg-input)`.
- `border: 1px solid var(--gh-border-default)`.
- `border-radius: var(--radius-md)`.
- `padding: 12px 16px`.
- `font-size: var(--font-base)` (avoids iOS auto-zoom).

---

## 6. i18n Keys

### Reuse existing
- `auth.*` for the entire sign-in form.
- `landing.logo_alt`, `landing.tagline`, `landing.meta_title`, `landing.meta_description`.

### Add to `landing` namespace
Add to **all 11 locale files** (`en.json`, `fr.json`, `es.json`, `de.json`, `it.json`, `pt.json`, `nl.json`, `ru.json`, `ja.json`, `zh.json`, `ar.json`).

```json
{
  "landing": {
    "hero_title": "Where and when did it happen?",
    "hero_subtitle": "Test your knowledge of history. Guess the year and location of real events, challenge friends, and climb the leaderboard.",
    "feature_practice_title": "Practice",
    "feature_practice_desc": "Solo warm-up with custom timers and year ranges.",
    "feature_daily_title": "Daily Challenge",
    "feature_daily_desc": "Same events for everyone. New challenge every 24 hours.",
    "feature_compete_title": "Compete",
    "feature_compete_desc": "Real-time Rush or turn-based Relax with up to 8 players.",
    "feature_levelup_title": "Level Up",
    "feature_levelup_desc": "Progressive runs from level 1 to 100."
  }
}
```

### Notes
- For RTL (`ar.json`), keep keys identical; translators will adjust text.
- Keep existing waitlist keys if the waitlist form is preserved.

---

## 7. Routing & Middleware

No middleware changes needed, but verify:

- `PUBLIC_PATHS` still contains `"/"`.
- `src/middleware.ts` redirects authenticated users from `/` to `/home`.
- `/login` remains and continues to render `AuthModal`.
- After successful sign-in in `SignInModule`, `router.push(next || '/home')`.
- Google OAuth `redirectTo` should be `${origin}/auth/callback?next=${encodeURIComponent(next)}`.
- Sign-out paths (`/account`, `/profile`) should keep redirecting to `/`.

---

## 8. Accessibility

- Use `<main>` for the page landmark.
- `<h1>` for the hero tagline.
- Form inputs have associated `<label>`.
- Error banner uses `role="alert"` or `aria-live="polite"`.
- Primary button has `data-testid="auth-submit-btn"` (reuse existing test id).
- Google button has visible text + SVG icon.
- Focus states use default focus ring or token-based outline.
- Color contrast for `var(--gh-orange)` on `var(--gh-btn-text)`.

---

## 9. Responsive Behavior

| Breakpoint | Layout |
|---|---|
| `>= 768px` | Two-column: hero left, sign-in card right, both vertically centered. |
| `< 768px` | Single column stacked. Sign-in card can appear first or after hero; recommend after hero to preserve brand read. |

- Use `@media (min-width: 768px)` for the desktop override so mobile stays safe by default.
- Hide feature bullets on very small screens or reduce to 2-up grid if desired.

---

## 10. Implementation Phases

### Phase 1 — Auth form refactor (optional but recommended)
- Extract `src/components/auth/AuthForm.tsx` from `AuthModal.tsx`.
- Update `AuthModal.tsx` to render `<AuthForm required={required} onSuccess={onClose} />` inside overlay.
- Run `npx tsc --noEmit` and `npm run lint`.

### Phase 2 — Landing page shell
- Update `src/app/page.tsx` to two-column server-rendered layout.
- Add `src/components/landing/SignInModule.tsx` (or use `<AuthForm>` if Phase 1 done).
- Style `src/app/page.module.css` with desktop grid + tokens.

### Phase 3 — i18n
- Add new `landing` keys to `src/i18n/en.json` and all other locale files.
- Use `getTranslations('landing')` in `page.tsx` for static copy.
- Use `useTranslations('auth')` and `useTranslations('landing')` in `SignInModule`/`AuthForm`.

### Phase 4 — QA
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run` (catches hardcoded font sizes in CSS)
- `npm run build`
- Manual visual check at `1280x800` and `1920x1080`.
- Sign-in flow: email/password, Google OAuth, forgot password, sign-up.
- Verify authenticated user visiting `/` still redirects to `/home`.
- Verify unauthenticated user can still hit `/api/waitlist` if waitlist is kept.

---

## 11. Files to Touch

- `src/app/page.tsx`
- `src/app/page.module.css`
- `src/components/landing/SignInModule.tsx` (new)
- `src/components/auth/AuthForm.tsx` (new, if Option B)
- `src/components/AuthModal.tsx` (if Option B)
- `src/i18n/*.json` (all 11 locales)

---

## 12. Open Decisions

1. **Waitlist form:** Should the email waitlist form remain on `/` (e.g., as a secondary CTA below the sign-in card) or be removed? Current assumption: remove from hero but keep `/api/waitlist` functional.
2. **Hero visuals:** Should feature bullets use the mode icons (Practice, Daily, Compete, Level Up) already in `docs/ui/assets` or simple checkmark bullets? Recommendation: use existing icon assets for richer desktop presentation.
3. **Mobile priority:** Should the sign-in card appear above the hero on mobile? Recommendation: yes, to reduce friction.
4. **AuthForm extraction:** Do Phase 1 (shared component) or accept duplicated logic in `SignInModule`? Recommendation: Phase 1.
