# Worktree Workflow

We use git worktrees to avoid file-collision incidents between concurrent tracks (commits `47a3243` and `0945091` both silently overwrote another track's in-progress work). The main checkout is reserved for architecture and CTO-directed tasks. Self-directed UI, CSS, help-section, and polish tasks each run in their own worktree on a dedicated branch.

## Two-tier workflow

- **Architecture / CTO tasks:** work in the main checkout (`D:/GH-NEW2`) on `main`.
- **UI / polish tasks:** create a dedicated worktree with `new-uix-worktree.sh`.

## Typical task flow

1. Create the worktree:
   ```bash
   ./scripts/dev/new-uix-worktree.sh css-theme
   ```
   This already runs `npm install` and then `scripts/dev/check-hooks-installed.sh`
   for you. If you created the worktree by any other means (e.g. an ad-hoc
   `git worktree add`), run the check yourself right after `npm install`:
   ```bash
   bash scripts/dev/check-hooks-installed.sh
   ```
   Git hooks (`core.hooksPath` → `.husky/_/`) are generated per-worktree and
   are NOT committed. If they're missing, pushes silently skip all safety
   gates with no error — this check fails loudly instead.
2. Do normal development in `../GH-NEW-uix-css-theme`.
3. Before merging, run the overlap check from the main checkout:
   ```bash
   ./scripts/dev/check-protected-overlap.sh uix/css-theme
   ```
4. Merge the branch, then remove the worktree:
   ```bash
   git worktree remove ../GH-NEW-uix-css-theme --force
   git branch -D uix/css-theme
   ```

## Escalation rule

If `check-protected-overlap.sh` exits `1` and reports a protected file, stop and get CTO review before merging. Do not merge anyway.
