#!/usr/bin/env bash
set -euo pipefail

EXPECTED_REF="jfggdhsducvjydnejypg"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/../supabase/migrations/20260811000001_create_journey_tables.sql"

CONN="${1:-${MIGRATION_DB_CONNECTION:-}}"

if [[ -z "$CONN" ]]; then
  echo "ABORT: supply connection string as first argument or set MIGRATION_DB_CONNECTION" >&2
  exit 1
fi

# Accept a pooler-style user (postgres.<project_ref>) or a direct-style host
# (db.<project_ref>.supabase.co). Only the dev project ref is permitted.
user_part=""
host_part=""

# Strip scheme and take everything up to the first '@' as credentials.
if [[ "$CONN" =~ ^postgresql://([^@]+)@(.+)$ ]]; then
  credentials="${BASH_REMATCH[1]}"
  after_at="${BASH_REMATCH[2]}"
  # user is the credential segment before the first ':' (password follows)
  user_part="${credentials%%:*}"
  # host is the segment after '@' up to the next ':' or '/'
  host_part="${after_at%%[:/]*}"
else
  echo "ABORT: connection string does not look like a postgres:// URI — refusing to run migration" >&2
  exit 1
fi

parsed_ref=""

if [[ "$user_part" =~ ^postgres\.([a-zA-Z0-9]+)$ ]]; then
  parsed_ref="${BASH_REMATCH[1]}"
fi

if [[ -z "$parsed_ref" && "$host_part" =~ ^db\.([a-zA-Z0-9]+)\.supabase\.co$ ]]; then
  parsed_ref="${BASH_REMATCH[1]}"
fi

if [[ "$parsed_ref" != "$EXPECTED_REF" ]]; then
  echo "ABORT: connection string resolves to project '${parsed_ref:-<unrecognized>}', expected dev project ${EXPECTED_REF} — refusing to run migration" >&2
  exit 1
fi

echo "OK: connection string validated against dev project ${EXPECTED_REF} (${host_part})"
psql "$CONN" -f "$MIGRATION_FILE"
