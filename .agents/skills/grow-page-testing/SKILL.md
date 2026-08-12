---
name: grow-page-testing
description: How to end-to-end test the /grow investor deck page, including the navigation rail, InvestorProgress counter, TOC, scroll-snap behavior, mobile viewport, and prefers-reduced-motion emulation.
---

# /grow investor deck — end-to-end testing

## Dev secrets needed
- `NEXT_PUBLIC_SUPABASE_URL` (used by Next.js middleware, even for public `/grow`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- These are normally sourced from `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets`.

## Starting the dev server
- The `/grow` route is public (`src/middleware.ts` `PUBLIC_PATHS`), but Next.js still requires Supabase env vars at startup.
- `npm run dev` can be blocked by the `scripts/dev/check-partykit-secret.sh` guard because it expects a matching `PARTYKIT_SECRET` between `.env.local`/shell and `.dev.vars`.
- For `/grow` static testing, run only the Next.js dev server:
  ```bash
  source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
  npx next dev -p 3001
  ```
  This avoids the PartyKit guard and is sufficient for `/grow` route work.

## Useful verification points
- The page is at `http://localhost:3001/grow`.
- `InvestorProgress` shows the current section counter (`01 / 12` … `12 / 12`) on the right of the fixed top bar.
- `GrowNavRail` is a fixed right-side rail with `aria-label="Slide chapters"`. It contains:
  - `Beginning` (double-chevron-up) → `#hook`
  - `Previous` (chevron-up)
  - 12 bullet anchors (`<a href="#<section-id>">`) with `aria-label="<number> · <headline>"`
  - `Next` (chevron-down)
  - `End` (double-chevron-down) → `#investment`
  - Expand/collapse TOC list button
- Active bullet has `aria-current="true"` and a visible orange fill.
- Disabled boundary controls are `<span aria-disabled="true">` with reduced opacity.
- Collapsed bullets show a tooltip on hover/focus containing the `number · headline` label.
- Expanded TOC renders all 12 section titles inside `a span.truncate`.

## Reachable selectors for Playwright
- Counter: `header span.font-mono`
- Rail: `nav[aria-label="Slide chapters"]`
- Active bullet: `nav[aria-label="Slide chapters"] a[aria-current="true"]`
- Bullet by prefix: `a[aria-label^="03 ·"]` (use the section number prefix)
- TOC expand/collapse button: `button[aria-label="Expand table of contents"]` / `button[aria-label="Collapse table of contents"]`
- Controls:
  - `a[aria-label="Go to beginning"]`, `a[aria-label="Previous slide"]`, `a[aria-label="Next slide"]`, `a[aria-label="Go to end"]`
  - Disabled state: `span[aria-label="Previous slide (unavailable)"]`, `span[aria-label="Beginning (already on first slide)"]`, `span[aria-label="Next slide (unavailable)"]`, `span[aria-label="End (already on last slide)"]`

## Viewports and reduced motion
- Desktop: `1280x720` or larger.
- Mobile: `390x844` (Playwright `page.setViewportSize({width: 390, height: 844})`).
- `prefers-reduced-motion: reduce`:
  - In a Playwright script: `await page.emulateMedia({ reducedMotion: 'reduce' })`.
  - Or launch Chrome with `--force-prefers-reduced-motion`.
  - Under reduced motion, `html:has([data-grow-snap])` loses `scroll-snap-type: y mandatory` (`src/app/globals.css:704-726`).
  - Verify by checking `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and `getComputedStyle(document.documentElement).scrollSnapType === 'none'`.

## Architecture check — no custom scrolling in the rail
- `GrowNavRail` must not contain `scrollIntoView`, `scrollTo`, `scrollBy`, `scrollTop`, `onWheel`, or `onTouch`.
- Navigation should be native `<a href="#<section-id>">` plus CSS `scroll-snap-type: y mandatory` and `scroll-snap-align: start`.
- The fixed header offset is provided by `scroll-padding-top: 3.5rem` on `html:has([data-grow-snap])`.

## How to confirm the footer is reachable
- `InvestorFooter` has no `data-section-id`, so it is not a snap target.
- From section 12, scroll one viewport down with `window.scrollBy(0, window.innerHeight)` or `PageDown`; the footer should be fully visible.

## Known pitfalls
- The `predev` PartyKit guard will fail `npm run dev` if `PARTYKIT_SECRET` is not aligned; use `npx next dev` for `/grow` work instead.
- Playwright scripts that import `'playwright'` must be run from inside the repo directory so `node_modules/playwright` resolves.
