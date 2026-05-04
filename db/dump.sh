#!/bin/sh
set -e

# Produces db/seed.sql — a spin-up snapshot for new contributors. Schema for
# every table is included, but data is dumped only for the canonical plant
# datasets (Crop / CropRelationship / their sources). Auth and per-user
# garden tables stay empty so we never commit personal data.

DB_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@localhost:5432/power2plant}"
OUT="$(dirname "$0")/seed.sql"

if ! pg_isready -d "$DB_URL" -q; then
  echo "ERROR: Database not reachable at $DB_URL" >&2
  exit 1
fi

echo "Dumping plant data to $OUT (user-generated tables: schema only) ..."

pg_dump "$DB_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --exclude-table-data='public."user"' \
  --exclude-table-data='public.session' \
  --exclude-table-data='public.account' \
  --exclude-table-data='public.verification' \
  --exclude-table-data='public."UserGarden"' \
  --exclude-table-data='public."Bed"' \
  --exclude-table-data='public."Planting"' \
  --file="$OUT"

LINES=$(wc -l < "$OUT")
SIZE=$(du -sh "$OUT" | cut -f1)
echo "Done — $SIZE, $LINES lines"
