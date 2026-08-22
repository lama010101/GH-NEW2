#!/usr/bin/env bash
# MP-FIX-ENVLOCAL-BACKUPGUARD-001 — safeguard .env.local before any hook logic runs.
#
# Copies .env.local -> .env.local.backup ONLY if .env.local currently exists,
# is non-empty, and contains at minimum the strings "SUPABASE_URL" and
# "SUPABASE_SECRET_KEY_PROD" (sanity check that it's a real, complete file).
#
# If the sanity check fails (file missing, empty, or missing required vars),
# the script does NOT touch .env.local.backup at all — it leaves whatever
# backup already exists untouched and exits with a warning.
# This prevents ever overwriting a GOOD backup with a BAD one.
#
# The script never deletes, truncates, or moves the original .env.local —
# read-only access to it, copy only.
#
# Usage:  bash scripts/dev/backup-env-local.sh
# Exit:   0 = backup created (or already-current good backup preserved);
#         1 = sanity check failed, existing backup left untouched.

set -euo pipefail

ENV_LOCAL=".env.local"
ENV_BACKUP=".env.local.backup"

# Required-var sanity markers — proof the file is a real, complete env file.
REQUIRED_VAR_1="SUPABASE_URL"
REQUIRED_VAR_2="SUPABASE_SECRET_KEY_PROD"

# --- Sanity checks -----------------------------------------------------------

if [ ! -f "$ENV_LOCAL" ]; then
  echo "BACKUP-ENV: .env.local not found — leaving existing .env.local.backup untouched."
  exit 1
fi

# Non-empty check (zero-byte file = truncated/garbage state).
if [ ! -s "$ENV_LOCAL" ]; then
  echo "BACKUP-ENV: .env.local is empty (zero bytes) — leaving existing .env.local.backup untouched."
  exit 1
fi

# Required-vars check.
if ! grep -q "$REQUIRED_VAR_1" "$ENV_LOCAL" || ! grep -q "$REQUIRED_VAR_2" "$ENV_LOCAL"; then
  echo "BACKUP-ENV: .env.local missing required vars ($REQUIRED_VAR_1 / $REQUIRED_VAR_2) — leaving existing .env.local.backup untouched."
  exit 1
fi

# --- Backup ------------------------------------------------------------------

# Atomic copy: write to a temp file first, then rename, so a partial write
# can never corrupt the backup.
cp "$ENV_LOCAL" "${ENV_BACKUP}.tmp" && mv -f "${ENV_BACKUP}.tmp" "$ENV_BACKUP"

BACKUP_LINES=$(wc -l < "$ENV_BACKUP")
SOURCE_LINES=$(wc -l < "$ENV_LOCAL")
echo "BACKUP-ENV: .env.local backed up to .env.local.backup (${SOURCE_LINES} src lines -> ${BACKUP_LINES} backup lines)."
exit 0
