#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

NAME=${1:-}
if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <short-task-name>" >&2
  exit 2
fi

WORKTREE_DIR="$REPO_ROOT/../GH-NEW-uix-$NAME"
BRANCH="uix/$NAME"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Error: branch '$BRANCH' already exists" >&2
  exit 1
fi

if [[ -d "$WORKTREE_DIR" ]]; then
  echo "Error: worktree directory '$WORKTREE_DIR' already exists" >&2
  exit 1
fi

if git worktree list | grep -q "^$WORKTREE_DIR "; then
  echo "Error: worktree '$WORKTREE_DIR' already exists" >&2
  exit 1
fi

cd "$REPO_ROOT"
git worktree add "$WORKTREE_DIR" -b "$BRANCH"
cd "$WORKTREE_DIR"
npm install

echo "Created worktree: $WORKTREE_DIR"
echo "Branch: $BRANCH"
