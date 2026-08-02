---
name: Testing GH-NEW2 end-to-end
description: How to run static checks and Playwright golden-path specs for the GH-NEW2 repo, including common environment pitfalls and a known test-only flakiness when running relax + sync specs together.
---

## Scope
Covers the GH-NEW2 Next.js app at `/home/ubuntu/repos/GH-NEW2`, tested against `http://localhost:3000` and PartyKit `localhost:1999`.

## Devin Secrets Needed
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_CONNECTION`

These are sourced from `/run/repo_secrets/lama010101/GH-NEW2/.env.secrets`.

## Required setup
1. Node 20.20.2:
   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20.20.2
   ```
2. Source secrets:
   ```bash
   source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
   ```
3. Dev servers must already be running:
   - Next.js on `http://localhost:3000`
   - PartyKit on `localhost:1999`
4. Chromium must be installed:
   ```bash
   npx playwright install chromium
   ```

## Static checks
```bash
cd /home/ubuntu/repos/GH-NEW2
npx tsc --noEmit
npx next lint
```
- `tsc` should exit `0`.
- `next lint` may have pre-existing warnings; only fail on new errors from changed files.

## Running the golden-path Playwright specs
```bash
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export NEXT_PUBLIC_PARTY_KIT_HOST=localhost:1999
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

npx playwright test \
  --project=relax-golden \
  --project=sync-golden \
  --config=scripts/test/playwright/playwright.config.ts
```

### Isolated runs (useful when debugging)
```bash
# Relax only
npx playwright test --project=relax-golden --config=scripts/test/playwright/playwright.config.ts

# Sync only
npx playwright test --project=sync-golden --config=scripts/test/playwright/playwright.config.ts
```

## Known test flakiness
- Running `relax-golden` and `sync-golden` in the same invocation can leave a completed **Rush** game in the host's Completed tab. `relax-golden` A13 then calls `page.locator('[class*="gameRow"]').filter({ hasText: /opponent_name/ })`, which may match both a **Relax** and a **Rush** row with the same opponent display name and fail with a strict-mode violation. Running the specs in isolation or cleaning completed sessions between projects avoids this.
- If the active-games per-player assertions need verification without the full WS flow, create an async session via `createCompeteSession`, drive it with `submitGuess`/`advancePlayerRoundAsync`, and call `deriveAsyncPlayerHomeState` directly.

## Manual /home Compete card smoke
To capture UI screenshots of per-player `round_current` and the Completed tab:
1. Create two temporary users with `welcome_completed: true`.
2. Log each in and set the `sb-<project>-auth-token` cookie.
3. Create an async `createCompeteSession`, join a guest, start both players.
4. Advance the host one round ahead of the guest.
5. Navigate both to `/home`, click **YOUR TURN**, and screenshot.
6. Complete the host, refresh `/home`, click **COMPLETED**, and screenshot.
