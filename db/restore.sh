#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
[ -f "$ROOT_DIR/.env" ] && . "$ROOT_DIR/.env"

DB_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@localhost:5432/power2plant}"
DUMP="$SCRIPT_DIR/seed.sql"
DUMP_ENRICHMENT="$SCRIPT_DIR/seed-enrichment-attempts.sql.gz"

if [ ! -f "$DUMP" ]; then
  echo "ERROR: No dump found at $DUMP" >&2
  exit 1
fi

if ! pg_isready -d "$DB_URL" -q; then
  echo "ERROR: Database not reachable at $DB_URL" >&2
  exit 1
fi

echo "Restoring from $DUMP ..."
psql "$DB_URL" --file="$DUMP" --quiet
echo "Done"

if [ -f "$DUMP_ENRICHMENT" ]; then
  echo "Restoring enrichment attempts from $DUMP_ENRICHMENT ..."
  gunzip -c "$DUMP_ENRICHMENT" | psql "$DB_URL" --quiet
  echo "Done"
fi
