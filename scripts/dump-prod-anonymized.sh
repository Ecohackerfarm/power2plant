#!/usr/bin/env bash
# Dump prod DB, restore to target env, anonymize all user PII.
# Run on the VPS directly (not via docker compose).
#
# Usage:
#   bash scripts/dump-prod-anonymized.sh [--target dev|staging]
#
# Defaults to --target dev.
# Reads DATABASE_URL from /opt/power2plant/{env}/.env for each env.

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

PROD_ENV="/opt/power2plant/prod/.env"
TARGET_ENV="/opt/power2plant/${TARGET}/.env"

if [[ ! -f "$PROD_ENV" ]]; then
  echo "Missing: $PROD_ENV"
  exit 1
fi
if [[ ! -f "$TARGET_ENV" ]]; then
  echo "Missing: $TARGET_ENV"
  exit 1
fi

# Parse DATABASE_URL from env file
parse_url() {
  grep -E '^DATABASE_URL=' "$1" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"'
}

PROD_URL=$(parse_url "$PROD_ENV")
TARGET_URL=$(parse_url "$TARGET_ENV")

if [[ -z "$PROD_URL" ]]; then
  echo "DATABASE_URL not found in $PROD_ENV"
  exit 1
fi
if [[ -z "$TARGET_URL" ]]; then
  echo "DATABASE_URL not found in $TARGET_ENV"
  exit 1
fi

echo "==> Dumping prod..."
DUMP_FILE=$(mktemp /tmp/p2p-prod-dump-XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

pg_dump "$PROD_URL" --no-owner --no-acl -f "$DUMP_FILE"
echo "    Dump: $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"

echo "==> Dropping and restoring ${TARGET} DB..."
# Extract connection parts for dropdb/createdb
TARGET_DBNAME=$(basename "$TARGET_URL" | cut -d? -f1)
TARGET_BASE_URL=$(echo "$TARGET_URL" | sed "s|/${TARGET_DBNAME}.*||")

psql "${TARGET_BASE_URL}/postgres" -c "DROP DATABASE IF EXISTS \"${TARGET_DBNAME}\";"
psql "${TARGET_BASE_URL}/postgres" -c "CREATE DATABASE \"${TARGET_DBNAME}\";"
psql "$TARGET_URL" -f "$DUMP_FILE" -q

echo "==> Anonymizing user PII..."
psql "$TARGET_URL" <<'SQL'
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

-- OAuth accounts: clear all tokens; keep accountId hashed for referential integrity
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

-- Research logs / prompts may contain user-entered crop queries — keep (not PII)
-- Feedback content: keep (anonymous in prod too)
SQL

echo "==> Done. ${TARGET} DB restored + anonymized."
echo "    Note: all sessions cleared — users can't log in with real credentials."
echo "    To create a test account: run the app and register fresh."
