#!/bin/bash
set -e

DB_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@localhost:5432/power2plant}"
OUT="$(dirname "$0")/seed.sql"

if ! pg_isready -d "$DB_URL" -q 2>/dev/null; then
  echo "ERROR: Database not reachable at $DB_URL" >&2
  exit 1
fi

echo "Dumping database to $OUT ..."

pg_dump "$DB_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file="$OUT"

LINES=$(wc -l < "$OUT")
SIZE=$(du -sh "$OUT" | cut -f1)
echo "Done — $SIZE, $LINES lines"
