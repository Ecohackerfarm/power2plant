#!/usr/bin/env bash
# Restore an environment's DB from prod (dump → anonymize), then for staging
# also save the anonymized DB to STAGING_DUMP_FILE for use by future deploys.
#
# Usage (manual):  bash staging-dump-refresh.sh [--target staging|dev]
# Usage (systemd): called by power2plant-staging-dump-refresh.service (target=staging)
#
# When run manually PROJECT_PATH, DEPLOY_USERNAME, and STAGING_DUMP_FILE are
# auto-derived from the script location and file ownership — no env setup needed.
set -euo pipefail

TARGET="staging"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target=*) TARGET="${1#--target=}"; shift ;;
    --target)   TARGET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ "$TARGET" != "staging" && "$TARGET" != "dev" ]]; then
  echo "Invalid target: $TARGET (must be staging or dev)" >&2
  exit 1
fi

# Always derive PROJECT_PATH from script location — ignore any inherited env var
# since it may point to a different repo (e.g. prod's PROJECT_PATH in the shell).
# Script lives at <repo>/scripts/server/ so repo root is two levels up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"

# DEPLOY_USERNAME and STAGING_DUMP_FILE: use env if set, else sensible defaults.
DEPLOY_USERNAME="${DEPLOY_USERNAME:-$(stat -c '%U' "$PROJECT_PATH")}"
STAGING_DUMP_FILE="${STAGING_DUMP_FILE:-$(dirname "$PROJECT_PATH")/backups/staging-latest.sql}"

echo "[dump-refresh] starting — target=${TARGET} — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Step 1: full prod → target restore + PII anonymization.
bash "${PROJECT_PATH}/scripts/dump-prod-anonymized.sh" --target "$TARGET"

# Step 1b: restart the app container so its existing startup command
# (`prisma migrate deploy && node server.js`, see Dockerfile CMD) re-applies
# any migrations the restored dump doesn't have yet. The restore above can
# regress the schema below what's already deployed (prod may lag staging),
# so this is required after every restore, not just on a real deploy.
sudo -u "$DEPLOY_USERNAME" docker compose -f "${PROJECT_PATH}/docker-compose.yml" restart app

echo "[dump-refresh] waiting for app to report healthy (migrate deploy in progress)..."
for _ in $(seq 1 60); do
  status="$(sudo -u "$DEPLOY_USERNAME" docker compose -f "${PROJECT_PATH}/docker-compose.yml" ps app --format '{{.Health}}')"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
if [[ "$status" != "healthy" ]]; then
  echo "[dump-refresh] app did not become healthy after restart — check 'docker compose logs app' for migrate errors" >&2
  exit 1
fi

# Step 1c: optionally force a known admin login into the restored DB.
# Done HERE, after the app restart applied pending migrations, because
# set-admin-credentials.ts uses the typed Prisma client and needs the full
# current schema — the prod dump restored above can lag staging. Runs before
# step 2 so the known password is baked into the saved staging dump.
read_env() { grep -E "^${1}=" "${PROJECT_PATH}/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true; }
DUMP_ADMIN_PASSWORD=$(read_env DUMP_ADMIN_PASSWORD)
ADMIN_EMAILS=$(read_env ADMIN_EMAILS)
[[ -z "$ADMIN_EMAILS" ]] && ADMIN_EMAILS=$(read_env ADMIN_EMAIL)
if [[ -n "$DUMP_ADMIN_PASSWORD" && -n "$ADMIN_EMAILS" ]]; then
  echo "[dump-refresh] setting known admin login for: ${ADMIN_EMAILS}"
  sudo -u "$DEPLOY_USERNAME" docker compose -f "${PROJECT_PATH}/docker-compose.yml" \
    run --rm -T \
    -e ADMIN_EMAILS="$ADMIN_EMAILS" \
    -e DUMP_ADMIN_PASSWORD="$DUMP_ADMIN_PASSWORD" \
    scripts npx tsx scripts/set-admin-credentials.ts
fi

# Step 2 (staging only): pg_dump the anonymized staging DB → save for deploys.
if [[ "$TARGET" == "staging" ]]; then
  mkdir -p "$(dirname "$STAGING_DUMP_FILE")"
  sudo -u "$DEPLOY_USERNAME" docker compose -f "${PROJECT_PATH}/docker-compose.yml" \
    run --rm -T scripts \
    sh -c 'pg_dump "${DATABASE_URL%%\?*}" --no-owner --no-acl' \
    > "$STAGING_DUMP_FILE"
  echo "[dump-refresh] saved to $STAGING_DUMP_FILE ($(du -sh "$STAGING_DUMP_FILE" | cut -f1))"
fi

echo "[dump-refresh] done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
