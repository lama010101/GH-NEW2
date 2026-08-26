# MP-FIX-MIDDLEWARE-OGIMAGEPUBLIC-001

## Task
Allow unauthenticated crawlers to reach the dynamic OG-image route by exempting `/compete/<uuid>/opengraph-image` from the middleware auth redirect.

## Scope
`src/middleware.ts` ONLY. One file, one behavior change (one line added).

## Exclusions flagged (parallel-track WIP)
The working tree had 3 uncommitted files from MP-BUILD-OGIMAGE-INVITECARD-001 (prior task, not yet merged):
- `src/server/sessionCore.ts` (modified — `export` token added to `eventTypeToSessionStatus`)
- `src/app/compete/[gameId]/opengraph-image.tsx` (new)
- `src/server/ogImageHelpers.ts` (new)

These were NOT staged or committed by this task. Only `src/middleware.ts` was staged.

## Change

### File: `src/middleware.ts`
### Function: `isPublicPath` (line 37-49)
### Line added: line 44

**BEFORE:**
```ts
  if (PARTYKIT_SECRET_ROUTES.some((route) => route.test(pathname))) return true;
  const lastDot = pathname.lastIndexOf(".");
```

**AFTER:**
```ts
  if (PARTYKIT_SECRET_ROUTES.some((route) => route.test(pathname))) return true;
  if (/^\/compete\/[0-9a-f-]{36}\/opengraph-image$/.test(pathname)) return true;
  const lastDot = pathname.lastIndexOf(".");
```

**PATCH:**
```diff
diff --git a/src/middleware.ts b/src/middleware.ts
index b6505a2f..fbbf220a 100644
--- a/src/middleware.ts
+++ b/src/middleware.ts
@@ -41,6 +41,7 @@ function isPublicPath(pathname: string): boolean {
   if (pathname.startsWith("/prototype")) return true;
   if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) return true;
   if (PARTYKIT_SECRET_ROUTES.some((route) => route.test(pathname))) return true;
+  if (/^\/compete\/[0-9a-f-]{36}\/opengraph-image$/.test(pathname)) return true;
   const lastDot = pathname.lastIndexOf(".");
   if (lastDot !== -1 && STATIC_ASSET_EXTENSIONS.includes(pathname.slice(lastDot).toLowerCase())) {
     return true;
```

## Validation

### 1. `npx tsc --noEmit` — PASS (exit 0, zero errors)
### 2. `npx next lint` — PASS (exit 0, zero errors, zero warnings in `src/middleware.ts`)
### 3. `git diff --name-only` (staged) — PASS (ONLY `src/middleware.ts`)
### 4. Manual dev-server check — PASS

**Test A: OG image path no longer redirects to /login:**
```
Server log: GET /compete/a895776f-556f-4dd8-93d7-a0eeeface327/opengraph-image 500
```
The request reached the route handler (500 from handler, NOT 307 from middleware). No `location: /login` header. The 500 is from `ImageResponse`'s internal font loading failing on Windows (a bug in the MP-BUILD-OGIMAGE-INVITECARD-001 route code, NOT a middleware issue).

**Test B: /home unauthenticated STILL redirects to /login:**
```
HTTP/1.1 307 Temporary Redirect
location: /login?next=%2Fhome
```

**Test C: /compete/<id> (game page, no /opengraph-image suffix) STILL redirects to /login:**
```
HTTP/1.1 307 Temporary Redirect
location: /login?next=%2Fcompete%2Fa895776f-556f-4dd8-93d7-a0eeeface327
```

### 5. `/compete/<id>` itself (without `/opengraph-image` suffix) is NOT exempted — CONFIRMED (Test C above)

## Commit

```
commit e4c5272a
MP-FIX-MIDDLEWARE-OGIMAGEPUBLIC-001: exempt /compete/<uuid>/opengraph-image from auth redirect
 1 file changed, 1 insertion(+)
```

Pre-commit KC-007 auth regression tests: **46/46 passed**.

## Push status: BLOCKED by pre-push golden-path gate (timeout, not caused by this change)

The pre-push hook (`.husky/pre-push`) detected that the branch diff vs `origin/main` includes `src/components/compete/RoundActiveSection.module.css` (from prior commit `996b400c` / MP-FIX-CSSTOKENDRIFT-BATCH-001, already on this branch). This file matches the `src/components/compete/**` protected pattern in `scripts/dev/sync-compete-protected-files.txt`, triggering the sync-compete golden-path Playwright spec.

The golden-path spec **timed out** (Playwright 300000ms / 5min limit exceeded) after successfully completing all 5 rounds + play-again. The test ran the entire game flow correctly:
- All 5 rounds completed (ROUND_ACTIVE → ROUND_COMPLETE for each)
- Both players submitted each round
- SESSION_COMPLETE reached
- Play-again new game created (`91fddb30-cae6-4fba-a544-ebf2b71d1fdf`)
- Timeout hit AFTER all gameplay completed

This is a pre-existing Playwright timeout issue on this Windows environment, NOT caused by my one-line middleware change. My change adds a regex check for `/compete/<uuid>/opengraph-image` paths in `isPublicPath()` — it does not touch any sync-compete logic, route, component, or hook.

### CTO action needed
The push to `origin/devin/MP-FIX-MIDDLEWARE-OGIMAGEPUBLIC-001` is blocked. Options:
1. CTO pushes the branch manually (bypassing the local hook)
2. CTO authorizes `git push --no-verify` for this specific push
3. CTO increases the Playwright timeout / addresses the pre-existing slowness

## `git log origin/main..main` — empty (nothing merged to main by me)

## Branch
`devin/MP-FIX-MIDDLEWARE-OGIMAGEPUBLIC-001`

REF: GUESS-HISTORY | MP-FIX-MIDDLEWARE-OGIMAGEPUBLIC-001
