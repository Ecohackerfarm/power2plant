#!/usr/bin/env bash
# Dump prod DB → restore to target env → anonymize user PII.
# All DB ops run inside each env's scripts container via docker compose.
# Run on the VPS host from any directory.
#
# Usage:
#   bash /opt/power2plant/prod/scripts/dump-prod-anonymized.sh [--target dev|staging]
#
# Users whose email matches ADMIN_EMAIL or TEST_USER_EMAIL in the target .env
# are preserved as-is (name, email, sessions, tokens all kept).

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

PROD_COMPOSE="/opt/power2plant/prod/docker-compose.yml"
TARGET_COMPOSE="/opt/power2plant/${TARGET}/docker-compose.yml"
TARGET_ENV="/opt/power2plant/${TARGET}/.env"

# Read a value from an env file
read_env() { grep -E "^${1}=" "$2" | head -1 | cut -d= -f2- | tr -d '"' || true; }

# Emails to preserve unchanged (single-quote-escaped for SQL)
sq() { echo "$1" | sed "s/'/''/g"; }
PRESERVED_EMAILS=()
ADMIN_EMAIL=$(read_env ADMIN_EMAIL "$TARGET_ENV")
TEST_USER_EMAIL=$(read_env TEST_USER_EMAIL "$TARGET_ENV")
# Optional: force a known admin login into the restored DB (see set-admin-credentials.ts)
DUMP_ADMIN_PASSWORD=$(read_env DUMP_ADMIN_PASSWORD "$TARGET_ENV")
[[ -n "$ADMIN_EMAIL" ]]      && PRESERVED_EMAILS+=("'$(sq "$ADMIN_EMAIL")'")
[[ -n "$TEST_USER_EMAIL" ]]  && PRESERVED_EMAILS+=("'$(sq "$TEST_USER_EMAIL")'")

if [[ ${#PRESERVED_EMAILS[@]} -gt 0 ]]; then
  PRESERVE_IN="($(IFS=,; echo "${PRESERVED_EMAILS[*]}"))"
  echo "    Preserving users: ${PRESERVED_EMAILS[*]}"
else
  PRESERVE_IN="(NULL)"  # matches nothing — anonymize everyone
fi

DUMP_FILE=$(mktemp /tmp/p2p-prod-dump-XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

# sed expression: swap /power2plant (+ any query string) for /postgres
MAINT_SED='s|/power2plant[^/]*$|/postgres|'

echo "==> Dumping prod..."
# Strip ?schema=... — pg_dump doesn't accept URL query params
docker compose -f "$PROD_COMPOSE" run --rm -T scripts \
  sh -c 'pg_dump "${DATABASE_URL%%\?*}" --no-owner --no-acl' \
  > "$DUMP_FILE"
echo "    Dump size: $(du -sh "$DUMP_FILE" | cut -f1)"

echo "==> Restoring to ${TARGET}..."
# Kill active connections so DROP DATABASE doesn't block
docker compose -f "$TARGET_COMPOSE" run --rm scripts \
  sh -c "MAINT=\$(echo \"\$DATABASE_URL\" | sed '$MAINT_SED'); psql \"\$MAINT\" -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='power2plant' AND pid<>pg_backend_pid();\""

# WITH (FORCE) handles any connections that reconnected (Postgres 13+)
docker compose -f "$TARGET_COMPOSE" run --rm scripts \
  sh -c "MAINT=\$(echo \"\$DATABASE_URL\" | sed '$MAINT_SED'); psql \"\$MAINT\" -c 'DROP DATABASE IF EXISTS power2plant WITH (FORCE);'"

docker compose -f "$TARGET_COMPOSE" run --rm scripts \
  sh -c "MAINT=\$(echo \"\$DATABASE_URL\" | sed '$MAINT_SED'); psql \"\$MAINT\" -c 'CREATE DATABASE power2plant;'"

docker compose -f "$TARGET_COMPOSE" run --rm -T scripts \
  sh -c 'psql "${DATABASE_URL%%\?*}" -q' \
  < "$DUMP_FILE"

echo "==> Anonymizing user PII (preserving ${PRESERVE_IN})..."
docker compose -f "$TARGET_COMPOSE" run --rm -T scripts \
  sh -c 'psql "${DATABASE_URL%%\?*}"' \
  <<SQL
UPDATE "user"
SET
  name  = 'User ' || substring(id, 1, 6),
  email = 'user-' || substring(id, 1, 8) || '@example.com',
  image = NULL
WHERE email NOT IN ${PRESERVE_IN};

UPDATE user_billing_info
SET
  "companyName" = NULL,
  street        = '1 Test Street',
  city          = 'Testtown',
  zip           = '00000',
  "vatId"       = NULL
WHERE "userId" NOT IN (SELECT id FROM "user" WHERE email IN ${PRESERVE_IN});

DELETE FROM session
WHERE "userId" NOT IN (SELECT id FROM "user" WHERE email IN ${PRESERVE_IN});

UPDATE account
SET
  "accountId"             = 'anon-' || md5("accountId"),
  "accessToken"           = NULL,
  "refreshToken"          = NULL,
  "idToken"               = NULL,
  "password"              = NULL,
  "accessTokenExpiresAt"  = NULL,
  "refreshTokenExpiresAt" = NULL
WHERE "userId" NOT IN (SELECT id FROM "user" WHERE email IN ${PRESERVE_IN});

DELETE FROM "UserApiToken"
WHERE "userId" NOT IN (SELECT id FROM "user" WHERE email IN ${PRESERVE_IN});

DELETE FROM verification
WHERE identifier NOT IN ${PRESERVE_IN};
SQL

if [[ -n "$DUMP_ADMIN_PASSWORD" && -n "$ADMIN_EMAIL" ]]; then
  echo "==> Setting known admin login for ${ADMIN_EMAIL}..."
  docker compose -f "$TARGET_COMPOSE" run --rm -T \
    -e ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e DUMP_ADMIN_PASSWORD="$DUMP_ADMIN_PASSWORD" \
    scripts npx tsx scripts/set-admin-credentials.ts
fi

echo "==> Done. ${TARGET} DB restored + anonymized."
[[ ${#PRESERVED_EMAILS[@]} -eq 0 ]] && echo "    All sessions cleared — register a fresh account to log in." \
  || echo "    Preserved users can log in normally. All other sessions cleared."
