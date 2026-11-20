# ORIENTATION — first read for every coder session

Read this before touching code. Every fact cites the repo file it was verified in (GH-NEW2 @ origin/main `28c529fa`, checked 2026-11-18). Anything that could not be verified is marked UNVERIFIED. No secrets or env values appear here — key names only.

## 1. What this is

Guess History — a "when and where" trivia game; the product name shown in the UI is "Dig the Past" (`src/i18n/en.json` `meta_title` = "Dig the Past — Test Your Knowledge of When and Where"). The npm package is named `guess-history` (`package.json`). Domains: `digthepast.org` is current (`wrangler.jsonc` `vars.NEXTJS_BASE_URL`; `src/i18n/en.json` cookie notice); `guess-history.com` is legacy but still served — apex redirects to `www.guess-history.com` (`vercel.json` redirects) and the app picks the auth-cookie domain per host (`src/core/authCookie.ts`; migration row DOMAIN-MIGRATE-DIGTHEPAST-1114-001 in `docs/PROGRESS.md`).

## 2. Stack and layout

- Next.js `^14.2.35` App Router, React `18.3.1`, TypeScript `^5.7.3` (`package.json`). Routes live in `src/app/` with co-located `*.module.css`.
- Supabase backend: `@supabase/ssr` + `@supabase/supabase-js` (`package.json` deps). ONE environment: production project `gzvixlvkwjsrtmtybtkf` (`docs/DATABASE_SCHEMA_STATE.md`; `.github/workflows/supabase-migrations.yml` `SUPABASE_PROJECT_REF`).
- Realtime (Compete): Cloudflare Worker `guess-history-ws` — `wrangler.jsonc` (`name`, `main: partykit/worker.ts`, Durable Object binding `Lobby`); browser client connects via `NEXT_PUBLIC_PARTY_KIT_HOST` (`src/core/competeWebSocket.ts`); deployed manually via `workflow_dispatch` wrangler deploy (`.github/workflows/deploy.yml`); local worker via `npm run dev:cf` (`wrangler dev --port 1999`). Migration evidence: PROGRESS rows PKMIG-BUILD-WORKERDEV-1016-020, PKMIG-BUILD-CIDEPLOY-1016-022, MP-DEPLOY-RELAXLATEJOINER-1020-067 (built 2026-10-16, deployed 2026-10-20). Hosted PartyKit (`*.partykit.dev`) is legacy — stale hostnames remain in `docs/CTO_BACKLOG.md` (annotated), `docs/PROGRESS.md` history, and `.agents/skills/`. The specific claim "hosted PartyKit shut down 2026-10-23" is UNVERIFIED in the repo: the repo documents the worker migration, not a shutdown date.
- Vercel hosts the Next.js app: `vercel.json` (host redirect + crons), `next.config.mjs` reads `VERCEL_GIT_COMMIT_SHA`.
- Android app via Capacitor: `@capacitor/*` deps (`package.json`), `android/` Gradle project.
- Other deps: `next-intl` with 11 locales (`src/i18n/*.json`), `partyserver`/`partysocket` (worker + client), `leaflet` maps, `framer-motion`, `firebase-admin` + `web-push`, `pg`, `zod`, `tailwindcss` v4 + CSS Modules.

Layout:

- `src/app/` — App Router pages + CSS Modules.
- `src/core/` — shared domain/client code used by both Next.js and the worker.
- `src/server/` — server-only logic (`sessionCore.ts`, DB access).
- `src/components/`, `src/hooks/`, `src/lib/`, `src/types/`, `src/actions/`, `src/fonts/`, `src/i18n/` (locales + `config.ts`/`request.ts`), `src/guards/` (repo guard tests), `src/middleware.ts`.
- `partykit/` — `worker.ts` (wrangler entry shim) + `server.ts` (PartyServer GameServer) + tests.
- `scripts/` — `scripts/ai-players/` batch pipeline, `scripts/dev/` repo tooling, `scripts/test/playwright/` e2e.
- `supabase/migrations/` — SQL migrations (86 entries; applied to prod manually — see PROGRESS row INFRA-FIX-MIGRATIONSWORKFLOW-MANUALONLY-1023-C03).
- `android/` — Capacitor Android project. `.github/workflows/` — 6 workflows: `android-debug-apk.yml`, `ci-golden-path.yml`, `daily-ai-autoplay.yml`, `deploy.yml`, `secret-scan.yml`, `supabase-migrations.yml`.
- `.husky/` — `pre-commit` + `pre-push` gates. `.devin/rules/` — coder rules. `docs/` — see §8.

CSS: components use CSS Modules (`*.module.css`). Global tokens in `src/app/globals.css`: `--font-2xs`(12px) `--font-xs`(13px) `--font-sm`(14px) `--font-base`(16px) `--font-lg`(17px) `--font-xl`(20px) `--font-2xl`(24px) `--font-3xl`(28px→22px narrow) `--font-4xl`(32px→26px narrow), plus `--gh-*` color tokens. Hardcoded `font-size: NNpx` is ratchet-guarded by `src/guards/css-no-hardcoded-font-sizes.guard.test.ts` (rule `.devin/rules/css-no-hardcoded-tokens.md`); the baseline can only go down — never edit the guard test or its BASELINE.

## 3. Commands that exist (`package.json` scripts)

- `npm run dev` — sources `.env.local`, runs `npx kill-port 3000 1999`, then `concurrently` `next dev` + `partykit dev` (`predev`: `check-partykit-secret.sh`).
- `npm run dev:cf` — same shape but worker via `wrangler dev --port 1999` (`predev:cf` same check).
- `npm run build` / `npm start` — `next build` / `next start`.
- `npm run lint` — `next lint`. `npm run typecheck` — `tsc --noEmit`.
- `npm test` / `npm run test:watch` — `vitest run` / `vitest`. `npm run test:integration` — vitest with `vitest.integration.config.ts`.
- `npm run party:dev` / `party:build` / `party:deploy` — partykit CLI (legacy path; prod worker deploy is `deploy.yml`, manual).
- `npm run test:e2e` — Playwright (`scripts/test/playwright/playwright.config.ts`); `test:e2e:report`, `test:simulation`, `test:simulation:report` variants.
- `npm run ai:poc`, `ai:batch-v2` — AI-players answer pipeline (`scripts/ai-players/`).
- `npm run security:audit`, `secret:scan`, `env:check` — repo audit/secret/env tooling (`scripts/dev/`).
- `npm run prepare` — husky (runs on `npm ci`).

WARNING: `npm run dev` and `npm run dev:cf` execute `npx kill-port 3000 1999` — they kill ANY process on those ports, including another session's stack. For a Next.js-only server use `npx next dev -p <free port>`; note it does NOT start the realtime worker, so Compete realtime needs `wrangler dev --port 1999` running separately (`package.json` `dev:cf`).

## 4. Environment rules (owner rulings)

- ONE environment only: production Supabase `gzvixlvkwjsrtmtybtkf` (`docs/DATABASE_SCHEMA_STATE.md`). No staging. Local `next dev` and Playwright runs read AND write production data — always clean up test rows/users you create (owner ruling; cleanup pattern visible throughout `docs/PROGRESS.md`).
- `.env.local` is edited ONLY by the owner. A coder never modifies it and never prints secret values — names only (owner ruling; `docs/SECRET_HYGIENE.md`).
- `.env.example` key names: `OPENROUTER_API_KEY`, `ADMIN_EMAILS`, `SUPABASE_DB_CONNECTION`, `GH_SUPABASE_URL`, `GH_SUPABASE_SECRET_KEY`, `GH_SUPABASE_PUBLISHABLE_KEY`, `GH_SUPABASE_ANON_KEY`, `GH_SUPABASE_DB_CONNECTION`, `GH_PARTYKIT_SECRET`, `GH_OPENROUTER_API_KEY` (`.env.example`; its comment says legacy unprefixed names still work and `npm run env:check` validates). Code also reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_PARTY_KIT_HOST` (`src/core/supabaseBrowser.ts`, `src/core/supabaseServer.ts`, `src/core/competeWebSocket.ts`).
- Worker secrets are set by the owner via `wrangler secret put`; names only: `PARTYKIT_SECRET`, `SUPABASE_SECRET_KEY_PROD`, `SUPABASE_URL` (`wrangler.jsonc` comment, `.github/workflows/deploy.yml`).

## 5. Git rules (owner rulings)

- One throwaway worktree per task off `origin/main` (`docs/WORKTREE_WORKFLOW.md`; `scripts/dev/new-uix-worktree.sh`). `D:\GH-NEW2` is a shared dirty tree — never develop or commit in it.
- Stage explicit paths only: `git add <file>` — never `git add -A` / `git add .`.
- Push the branch immediately after a clean commit. Merging is a separate approved step — open a PR and stop; never self-merge.
- Before push: `git diff --name-only origin/main` must list only task-allowed files.
- Hooks: `.husky/pre-commit` runs secret-scan + KC-007 auth guard + a vitest subset; `.husky/pre-push` runs `check-hooks-installed.sh` and, only when protected files changed, the sync golden-path Playwright gate.

## 6. Protected baseline

`scripts/dev/protected-files.txt` — touching any of these needs the "KC-009 smoke test" (owner term; see `docs/KNOWN_CONSTRAINTS.md`):

- `partykit/server.ts`
- `src/server/sessionCore.ts`
- `src/server/getGameState.ts`
- `src/app/compete/**`
- `src/app/api/compete/**`
- `src/components/compete/**`
- `src/hooks/useCompeteSocket.ts`
- `src/hooks/useCompeteTimer.ts`
- `src/core/competeApi.ts`
- `src/core/competeTypes.ts`
- `src/core/competeUtils.ts`
- `src/core/competeWebSocket.ts`
- `src/core/rules.ts`
- `src/core/identity.ts`
- `src/core/supabaseBrowser.ts`

`scripts/dev/sync-compete-protected-files.txt` = the same list PLUS `scripts/test/playwright/specs/sync-compete-golden-path.spec.ts` and Playwright helpers (`helpers/auth-cookie.ts`, `helpers/compete-ui.ts`, `orchestrator/websocketClient.ts`, `orchestrator/observer.ts`, `fixtures/auth.ts`) — changes there also trigger the pre-push gate (manifest header comment; `.husky/pre-push`).

Read `docs/KNOWN_CONSTRAINTS.md` (the numbered constraint list) and `docs/WORKTREE_WORKFLOW.md` before non-trivial work.

## 7. Validation checklist (every task)

- `npx tsc --noEmit` — 0 errors.
- `npx next lint` — 0 errors (pre-existing warnings are normal).
- `npx vitest run` — baseline: see latest `docs/PROGRESS.md` row (a fresh worktree has no `node_modules` unless you run `npm ci`).
- `bash scripts/dev/check-hooks-installed.sh` — must pass before the first push.
- Scope: `git diff --name-only origin/main` shows only allowed files; `git diff -U0` shows only intended lines.

## 8. Docs map (`docs/`)

- `AI_FLEET_DIAGNOSIS_1103-060.md` — AI fleet diagnosis evidence.
- `AUDIT_REPORT.md` — "GH-NEW Codebase Audit Report".
- `BADGE_SYSTEM.md` — "PROJECT: Guess-History" badge system doc.
- `CODEBASE_AUDIT_REPORT.md` — "GH-NEW Codebase Audit Report".
- `CORE UI AND FEATURES.md` — "THE CORE FEATURES - PRACTICE MODE".
- `CTO_BACKLOG.md` — "CTO BACKLOG & BUG TRACKER" (owner task/bug list; stale `partykit.dev` host lines are annotated in place).
- `DAILY_MODE_SPEC.md` — "DAILY MODE SPECIFICATION".
- `DATABASE_CONNECTION.md` — "Database Connection Guide".
- `DATABASE_SCHEMA_STATE.md` — "DATABASE SCHEMA STATE" (prod project ref).
- `EXECUTION_PLAN.md` — "GUESS-HISTORY — AUTHORITATIVE EXECUTION PLAN".
- `GAME_MODES_SPEC.md` — "GAME MODES SPECIFICATION".
- `GUESS_HISTORY_MASTER_SPEC.md` — "GUESS-HISTORY — UNIFIED MASTER SPECIFICATION".
- `HISTORIANS_JOURNEY_SPEC.md` — "Historian's Journey — Product & Architecture Spec".
- `HOME_PAGE_SPEC.md` — "HOME PAGE SPEC".
- `KNOWN_CONSTRAINTS.md` — "KNOWN CONSTRAINTS" (read before non-trivial work).
- `LANDING_DESKTOP_PLAN.md` — "Desktop Landing Page with Sign-In Module — Plan".
- `MP-PLAN-COMPETE-AUDIT-FIX-001.md` — compete audit fix plan.
- `MP-PLAN-PROTECTEDBASELINE-RELAXPRACTICE-001.md` — protected-baseline plan.
- `PLAN_BATCH_UI_002.md` — batch UI implementation plan.
- `PROGRESS.md` — "GUESS-HISTORY — Implementation Progress" (task log; see §9).
- `PROJECT.md` — first line "DESCRIPTION: Migrated inline styles to CSS module" (looks like a task note, not a project overview — UNVERIFIED as canonical).
- `PROTOTYPE_ALIGNMENT_PLAN.md` — "GUESS-HISTORY — PROTOTYPE ALIGNMENT PLAN".
- `RELAX_MODE_SPEC.md` — "COMPETE RELAX (ASYNC) — FULL MODE SPECIFICATION".
- `SECRET_HYGIENE.md` — "Secret Hygiene (SEC-BUILD-SECRETGUARD-042)".
- `STATS_SYSTEM.md` — first heading is the filename itself (depth UNVERIFIED).
- `WORKTREE_WORKFLOW.md` — "Worktree Workflow".
- `prompt-template FOR CTO ONLY.txt` — prompt template for the CTO.
- `guess_history_home_page.html` — static HTML mock (starts with `<style>`).
- Subdirectories (contents not opened): `docs/backend/` (2), `docs/core/` (3), `docs/ui/` (13), `docs/timeline year picker/` (3) — contents UNVERIFIED.

## 9. Where to log work

Append ONE row per completed task to `docs/PROGRESS.md`: task ID, status, files, factual description, commit hash, date — additive only, matching existing row format. On merge conflicts the file is always resolved additively (keep both rows); never resolve `PROGRESS.md` conflicts in a text editor by picking sides (owner ruling).
