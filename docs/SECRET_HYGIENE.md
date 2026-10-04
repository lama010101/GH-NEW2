# Secret Hygiene (SEC-BUILD-SECRETGUARD-042)

This repo is **public**. Live secrets have been committed more than once
(DSNs with passwords in scripts, a service-role JWT and the PartyKit secret
via a `git add -A` WIP commit, a tracked `.dev.vars`, token-bearing logs).
This document is the rulebook that keeps it from happening again, and the
manual for the automated scanner that now enforces it.

## 1. Rules everyone works by

- **NEVER `git add -A` or `git add .`.** Stage explicit paths only. A single
  WIP `git add -A` is how live secrets got published before — it sweeps up
  `.env.local`, `.dev.vars`, scratch logs and debug dumps without showing
  you what it grabbed.
- **Secrets live only in secret stores**: Vercel env vars, GitHub Actions
  secrets, Devin session/org secrets, PartyKit env (`--var` / dashboard).
  Never in source files, scripts, fixtures, logs, test output, screenshots,
  or chat/prompt text.
- **Never print env values.** No `echo $SECRET`, no `console.log(process.env…)`,
  no dumping connection strings into output files or CI logs. When debugging
  config, print that a variable is *set/unset*, never its value.
- Rotate any secret that ever lands in a file — see §4.

## 2. What the scanner blocks and how to read it

`scripts/dev/secret-scan.ts` runs three ways:

- `--staged` (pre-commit hook): scans **added lines only** in the staged diff,
  plus forbidden new-file names.
- `--range <base>..<head>` (CI `diff` job): same scan over a commit range.
- `--tree` (CI `tree` job, non-blocking): report-only inventory of every
  tracked file; always exits 0.

Rules it detects (reported as `path:line:RULE` — matched text is **never**
printed, so output is safe in public CI logs):

- `DSN_WITH_PASSWORD` — `postgres(ql)://user:password@host` with a real
  (non-placeholder) password.
- `JWT_ANY` — any three-segment base64url token; `JWT_SERVICE_ROLE` /
  `JWT_ANON` when the payload role is tagged. The tag is reported, never
  claims or the token.
- `SB_SECRET` — `sb_secret_*` keys. `OPENROUTER_KEY` — `sk-or-v1-*`.
  `GOOGLE_OAUTH_SECRET` — `GOCSPX-*`. `PRIVATE_KEY_BLOCK` — PEM private-key
  headers.
- `HEX64_SECRET` — a 64-hex literal on a line naming a secret/token/key/password.
- `GENERIC_ASSIGNMENT` — `NAME` containing `SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY`
  assigned a 20+ char literal. Placeholders (`<…>`, `${…}`, `YOUR`, `xxx`,
  `placeholder`, `example`, `redacted`, `changeme`, single-repeated-char,
  empty) never count.
- `FORBIDDEN_FILE` — newly **added** files named `.dev.vars`, `.env`,
  `.env.*` (except `.env.example` / `.env.local.example`), `*.pem`, `*.key`,
  `*.log`, or anything under `test-results/` / `playwright-report/`
  (reported at line `0`).

Output ends with `SECRET SCAN: PASS|FAIL (mode=<m>, findings=<n>)`.
A `FAIL` line lists one `path:line:RULE` per finding — fix or allowlist each.

## 3. Allowlist procedure (false positives only)

1. Confirm the finding is genuinely not a secret (a fixture, a doc example,
   an ID). If it might be real, treat it as a secret — never allowlist to
   silence the gate.
2. Compute the hash of the **trimmed matching line**:
   `printf '%s' 'THE EXACT LINE TEXT' | sha256sum` — the entry stores the
   hash, **never** the secret.
3. Append to `scripts/dev/secret-scan-allow.json`:
   `{ "rule": "RULE", "path": "path/file", "lineSha256": "<hash>", "reason": "why this is safe" }`
4. A finding is suppressed only when rule + path + hash all match, so any
   edit to that line re-raises it — by design.

## 4. If a secret is ever committed

**Rotate first, then clean.** The leaked value is public the moment the
commit exists — deleting it later does not un-leak it. Immediately rotate
the credential in its provider (Supabase keys, OpenRouter, Google OAuth,
PartyKit, DB password), then remove it from the tree and its git history
(filter-repo / force-push as an owner task), then allowlist nothing —
history scans are `--tree`-visible for the cleanup task.

## 5. Owner-only setup steps (not coder tasks)

- GitHub → Settings → Code security: enable **Secret scanning** *and*
  **Push protection** for this repo.
- Branch protection on `main`: require the **`secret-scan / diff`** status
  check before merge (the `tree` job stays informational).
- Keep GitHub secret-scan alerts routed to the repo owner.

## 6. Bypass note

`git commit --no-verify` skips the local hook by design (husky cannot forbid
it). The CI `diff` job is the backstop: it scans the same rules over the PR
range and blocks merge when branch protection (§5) is enabled.
