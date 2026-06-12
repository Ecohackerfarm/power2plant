#!/usr/bin/env bash
# Dump prod DB → restore to target env → anonymize user PII.
# All DB ops run inside each env's scripts container via docker compose.
# Run on the VPS host from any directory.
#
# Usage:
#   bash /opt/power2plant/prod/scripts/dump-prod-anonymized.sh [--target dev|staging]

set -euo pipefail

TARGET="dev"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ "$TARGET" != "dev" && "$TARGET" != "staging" ]]; then
  echo "Invalid target: $TARGET (must be dev or staging)"
  exit 1
fi

PROD_DIR="/opt/power2plant/prod"
TARGET_DIR="/opt/power2plant/${TARGET}"

DUMP_FILE=$(mktemp /tmp/p2p-prod-dump-XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

echo "==> Dumping prod via scripts container..."
# DATABASE_URL is set in the container env — pg_dump reads it directly
docker compose -f "${PROD_DIR}/docker-compose.yml" \
  run --rm -T scripts \
  sh -c 'pg_dump "$DATABASE_URL" --no-owner --no-acl' \
  > "$DUMP_FILE"

echo "    Dump size: $(du -sh "$DUMP_FILE" | cut -f1)"

echo "==> Restoring to ${TARGET}..."
# Drop + recreate DB via the target scripts container (connect to postgres maintenance DB)
docker compose -f "${TARGET_DIR}/docker-compose.yml" \
  run --rm scripts \
  sh -c 'psql "${DATABASE_URL%/*}/postgres" -c "DROP DATABASE IF EXISTS power2plant;"'

docker compose -f "${TARGET_DIR}/docker-compose.yml" \
  run --rm scripts \
  sh -c 'psql "${DATABASE_URL%/*}/postgres" -c "CREATE DATABASE power2plant;"'

docker compose -f "${TARGET_DIR}/docker-compose.yml" \
  run --rm -T scripts \
  sh -c 'psql "$DATABASE_URL" -q' \
  < "$DUMP_FILE"

echo "==> Anonymizing user PII..."
docker compose -f "${TARGET_DIR}/docker-compose.yml" \
  run --rm scripts \
  sh -c 'psql "$DATABASE_URL"' \
  <<'SQL'
UPDATE "user"
SET
  name  = 'User ' || substring(id, 1, 6),
  email = 'user-' || substring(id, 1, 8) || '@example.com',
  image = NULL;

UPDATE user_billing_info
SET
  "companyName" = NULL,
  street        = '1 Test Street',
  city          = 'Testtown',
  zip           = '00000',
  "vatId"       = NULL;

DELETE FROM session;

UPDATE account
SET
  "accountId"             = 'anon-' || md5("accountId"),
  "accessToken"           = NULL,
  "refreshToken"          = NULL,
  "idToken"               = NULL,
  "password"              = NULL,
  "accessTokenExpiresAt"  = NULL,
  "refreshTokenExpiresAt" = NULL;

DELETE FROM "UserApiToken";
DELETE FROM verification;
SQL

echo "==> Done. ${TARGET} DB restored + anonymized."
echo "    Sessions cleared — register a fresh account to log in."
