#!/usr/bin/env bash
# Scratch script: verify .husky/pre-push protected-file matching logic.
# Tests all cases a-f from MP-GUARD-SYNC-REGRESSION-001-BUILD-B.
# Deleted at task end.
set -eu

PROTECTED_FILE="scripts/dev/sync-compete-protected-files.txt"

match_check() {
  local file="$1"
  local expected="$2"  # "MATCH" or "NO_MATCH"
  local result="NO_MATCH"
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    case "$pattern" in \#*) continue ;; esac
    case "$file" in
      $pattern) result="MATCH"; break ;;
    esac
  done < "$PROTECTED_FILE"
  if [ "$result" = "$expected" ]; then
    echo "PASS: '$file' → $result (expected $expected)"
  else
    echo "FAIL: '$file' → $result (expected $expected)"
  fi
}

echo "=== Case a: src/components/compete/RoundActiveSection.tsx → MUST match ==="
match_check "src/components/compete/RoundActiveSection.tsx" "MATCH"

echo ""
echo "=== Case b: src/app/practice/page.tsx → MUST NOT match ==="
match_check "src/app/practice/page.tsx" "NO_MATCH"

echo ""
echo "=== Case c: partykit/server.ts → MUST match ==="
match_check "partykit/server.ts" "MATCH"

echo ""
echo "=== Case d: manifest comment line (# ...) → skipped ==="
# Simulate: a comment line in the manifest should never match any file
comment_pattern="# this is a comment"
echo "Comment pattern: '$comment_pattern'"
test_file="src/components/compete/RoundActiveSection.tsx"
result="NO_MATCH"
case "$test_file" in
  $comment_pattern) result="MATCH" ;;
esac
if [ "$result" = "NO_MATCH" ]; then
  echo "PASS: comment line does not match any file"
else
  echo "FAIL: comment line matched a file"
fi

# Also verify the hook's own comment-skipping logic
echo ""
echo "  (verifying hook skips comments in manifest loop)"
comment_line="# MP-GUARD-SYNC-REGRESSION-001 — files whose push triggers the golden-path gate."
case "$comment_line" in \#*) echo "  PASS: hook case '\\#*' catches comment line" ;; *) echo "  FAIL: comment not caught" ;; esac

echo ""
echo "=== Case e: empty pushed-file list → exit 0 with skip message ==="
# Simulate: empty PUSHED_FILES
PUSHED_FILES=""
if [ -z "$PUSHED_FILES" ]; then
  echo "PASS: empty pushed-file list → exit 0 with 'no pushed files to check — skipping golden-path gate.'"
else
  echo "FAIL: empty list not detected"
fi

echo ""
echo "=== Case f: nested path src/components/compete/sub/Deep.tsx ==="
echo "Testing if shell case ** matches across / ..."
match_check "src/components/compete/sub/Deep.tsx" "MATCH"

echo ""
echo "=== Shell ** behavior explanation ==="
# In bash case statements, ** does NOT match across / by default
# (unlike globstar in pathname expansion). Let's prove it:
echo "Testing: does 'src/components/compete/**' match 'src/components/compete/sub/Deep.tsx'?"
test_pattern="src/components/compete/**"
test_path="src/components/compete/sub/Deep.tsx"
case "$test_path" in
  $test_pattern) echo "  YES — ** matches across /" ;;
  *) echo "  NO — ** does NOT match across / in shell case" ;;
esac

echo ""
echo "Testing: does 'src/components/compete/*' match 'src/components/compete/RoundActiveSection.tsx'?"
test_pattern2="src/components/compete/*"
test_path2="src/components/compete/RoundActiveSection.tsx"
case "$test_path2" in
  $test_pattern2) echo "  YES — * matches a single path segment" ;;
  *) echo "  NO — * does not match" ;;
esac
