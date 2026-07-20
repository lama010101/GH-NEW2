#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
PROTECTED_FILE="$REPO_ROOT/scripts/dev/protected-files.txt"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <branch-name|worktree-path>" >&2
  exit 2
fi

ARG=$1

if [[ -d "$ARG" ]]; then
  if ! TARGET=$(git -C "$ARG" rev-parse --abbrev-ref HEAD 2>/dev/null); then
    echo "Error: '$ARG' exists but is not a git worktree" >&2
    exit 2
  fi
else
  TARGET=$ARG
fi

if [[ ! -f "$PROTECTED_FILE" ]]; then
  echo "Error: protected-files.txt not found at $PROTECTED_FILE" >&2
  exit 2
fi

if ! CHANGED=$(git diff --name-only "main...$TARGET" 2>/dev/null); then
  echo "Error: could not diff main...$TARGET" >&2
  exit 2
fi

if [[ -z "$CHANGED" ]]; then
  echo "No protected files touched — safe to merge"
  exit 0
fi

MATCH=0
readarray -t GLOBS < "$PROTECTED_FILE" || true

for FILE in $CHANGED; do
  for GLOB in "${GLOBS[@]}"; do
    [[ -z "${GLOB:-}" || "${GLOB:0:1}" == "#" ]] && continue
    if [[ "$FILE" == $GLOB ]]; then
      echo "PROTECTED FILE TOUCHED: $FILE — escalate to CTO before merging"
      MATCH=1
    fi
  done
done

if [[ $MATCH -eq 1 ]]; then
  exit 1
else
  echo "No protected files touched — safe to merge"
  exit 0
fi
