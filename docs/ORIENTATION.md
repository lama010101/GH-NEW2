---
# ORIENTATION — READ THIS FIRST, EVERY SESSION

**Repo:** github.com/lama010101/GH-NEW2 (renamed from GH-NEW — if you see "GH-NEW" without a "2" anywhere, it is stale, flag it)
**Cloud clone path (this session):** /home/ubuntu/repos/GH-NEW2
**Env vars:** Neither .env.local nor injected environment variables (SUPABASE/PARTYKIT/FIREBASE) were found in this environment as of MP-INFRA-ORIENTATION-DOC-002. If you hit an auth/connection error, verify with `find / -maxdepth 4 -iname ".env.local"` and `env | grep -iE "SUPABASE|PARTYKIT|FIREBASE"` before assuming vars are missing, then flag to the user — do not assume they were simply never provided.
**Branch model:** Devin Cloud sessions push to a feature branch and open a PR. They do NOT auto-merge to main. Report the PR number and branch name in your final reply — never claim "done" or "pushed to main" for unmerged work. Correct status for an unmerged PR is "fix implemented in PR #[N], pending merge review."
**Worktrees:** Windsurf/Cascade self-directed UIX work happens in separate git worktrees, not this checkout. Do not touch or assume knowledge of those unless explicitly told.
---
