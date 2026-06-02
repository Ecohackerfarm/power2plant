#!/bin/sh
set -e

# Produces two seed files:
#   db/seed.sql                          — schema + canonical plant data
#   db/seed-enrichment-attempts.sql.gz   — CropEnrichmentAttempt rows (gzipped; never diffed)
# Auth and per-user garden tables are schema-only so no personal data is committed.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
[ -f "$ROOT_DIR/.env" ] && . "$ROOT_DIR/.env"

DB_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@localhost:5432/power2plant}"
OUT="$SCRIPT_DIR/seed.sql"
OUT_ENRICHMENT="$SCRIPT_DIR/seed-enrichment-attempts.sql.gz"

if ! pg_isready -d "$DB_URL" -q; then
  echo "ERROR: Database not reachable at $DB_URL" >&2
  exit 1
fi

echo "Dumping canonical plant data to $OUT ..."

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
  --exclude-table-data='public."CropEnrichmentAttempt"' \
  --file="$OUT"

echo "Done — $(du -sh "$OUT" | cut -f1), $(wc -l < "$OUT") lines"

echo "Dumping CropEnrichmentAttempt to $OUT_ENRICHMENT ..."

pg_dump "$DB_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --table='public."CropEnrichmentAttempt"' \
  --data-only \
  | gzip > "$OUT_ENRICHMENT"

echo "Done — $(du -sh "$OUT_ENRICHMENT" | cut -f1)"
