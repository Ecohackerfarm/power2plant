#!/usr/bin/env bash
# Restore staging DB from the pre-built anonymized dump file on every deploy.
# Falls back to db/seed.sql if no dump file exists yet (first-time setup).
#
# Called from staging-deploy.sh AFTER the DB container is healthy but BEFORE
# the app container starts, so prisma migrate deploy always runs against a
# clean known-good schema with no stuck migrations.
#
# Safe to run manually. Requires DEPLOY_USERNAME, PROJECT_PATH, STAGING_DUMP_FILE in env.
# To refresh the dump from prod, run staging-dump-refresh.sh (or wait for the daily timer).
set -euo pipefail

: "${DEPLOY_USERNAME:?not set — run scripts/server/setup.sh}"
: "${PROJECT_PATH:?not set — run scripts/server/setup.sh}"
: "${STAGING_DUMP_FILE:?not set — run scripts/server/setup.sh}"

cd "$PROJECT_PATH"

echo "[staging-seed] bootstrapping staging DB — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

for _ in $(seq 1 30); do
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    pg_isready -U power2plant -q && break
  sleep 1
done

if [[ -f "$STAGING_DUMP_FILE" ]]; then
  echo "[staging-seed] restoring from dump file: $STAGING_DUMP_FILE ($(du -sh "$STAGING_DUMP_FILE" | cut -f1))"
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    psql -U power2plant -d power2plant \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    psql -U power2plant -d power2plant < "$STAGING_DUMP_FILE"
else
  SEED_FILE="${PROJECT_PATH}/db/seed.sql"
  echo "[staging-seed] no dump file found — falling back to seed.sql"
  if [[ ! -f "$SEED_FILE" ]]; then
    echo "[staging-seed] $SEED_FILE missing — cannot bootstrap" >&2
    exit 1
  fi
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    psql -U power2plant -d power2plant \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    psql -U power2plant -d power2plant < "$SEED_FILE"
fi

echo "[staging-seed] done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
