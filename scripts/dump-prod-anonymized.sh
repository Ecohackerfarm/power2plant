#!/usr/bin/env bash
# Dump prod DB, restore to target env, anonymize all user PII.
# Uses docker exec — no host-level postgres client needed.
# Run on the VPS directly as root or docker-capable user.
#
# Usage:
#   bash scripts/dump-prod-anonymized.sh [--target dev|staging]
#
# Defaults to --target dev.

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

PROD_DB_CONTAINER="power2plant-prod-db-1"
TARGET_DB_CONTAINER="power2plant-${TARGET}-db-1"

# DB name and user are the same across all envs
DB_NAME="power2plant"
DB_USER="power2plant"

echo "==> Dumping prod (${PROD_DB_CONTAINER})..."
DUMP_FILE=$(mktemp /tmp/p2p-prod-dump-XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

docker exec "$PROD_DB_CONTAINER" \
  pg_dump -U "$DB_USER" --no-owner --no-acl "$DB_NAME" \
  > "$DUMP_FILE"

echo "    Dump size: $(du -sh "$DUMP_FILE" | cut -f1)"

echo "==> Dropping and restoring ${TARGET} DB (${TARGET_DB_CONTAINER})..."
docker exec "$TARGET_DB_CONTAINER" \
  psql -U "$DB_USER" postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
docker exec "$TARGET_DB_CONTAINER" \
  psql -U "$DB_USER" postgres -c "CREATE DATABASE \"${DB_NAME}\";"
docker exec -i "$TARGET_DB_CONTAINER" \
  psql -U "$DB_USER" -d "$DB_NAME" -q < "$DUMP_FILE"

echo "==> Anonymizing user PII..."
docker exec "$TARGET_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
-- Users: name, email, image
UPDATE "user"
SET
  name  = 'User ' || substring(id, 1, 6),
  email = 'user-' || substring(id, 1, 8) || '@example.com',
  image = NULL;

-- Billing info: all address fields
UPDATE user_billing_info
SET
  "companyName" = NULL,
  street        = '1 Test Street',
  city          = 'Testtown',
  zip           = '00000',
  "vatId"       = NULL;

-- Sessions: drop all (tokens + ip)
DELETE FROM session;

-- OAuth accounts: clear all tokens; hash accountId
UPDATE account
SET
  "accountId"             = 'anon-' || md5("accountId"),
  "accessToken"           = NULL,
  "refreshToken"          = NULL,
  "idToken"               = NULL,
  "password"              = NULL,
  "accessTokenExpiresAt"  = NULL,
  "refreshTokenExpiresAt" = NULL;

-- API tokens: clear
DELETE FROM "UserApiToken";

-- Verification tokens: clear
DELETE FROM verification;
SQL

echo "==> Done. ${TARGET} DB restored + anonymized."
echo "    Sessions cleared — register a fresh account to log in."
