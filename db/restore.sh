#!/bin/bash
set -e

DB_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@localhost:5432/power2plant}"
DUMP="$(dirname "$0")/seed.sql"

if [ ! -f "$DUMP" ]; then
  echo "ERROR: No dump found at $DUMP" >&2
  exit 1
fi

if ! pg_isready -d "$DB_URL" -q 2>/dev/null; then
  echo "ERROR: Database not reachable at $DB_URL" >&2
  exit 1
fi

echo "Restoring from $DUMP ..."
psql "$DB_URL" --file="$DUMP" --quiet
echo "Done"
