#!/usr/bin/env bash
# Refresh the staging dump file: restore prod → anonymize → pg_dump to STAGING_DUMP_FILE.
# Run daily via systemd timer (power2plant-staging-dump-refresh.timer).
# Safe to run manually: bash staging-dump-refresh.sh
#
# Requires DEPLOY_USERNAME, PROJECT_PATH (staging), STAGING_DUMP_FILE in env.
# setup.sh injects all three via Environment= in the service unit.
set -euo pipefail

: "${DEPLOY_USERNAME:?not set — run scripts/server/setup.sh}"
: "${PROJECT_PATH:?not set — run scripts/server/setup.sh}"
: "${STAGING_DUMP_FILE:?not set — run scripts/server/setup.sh}"

echo "[staging-dump-refresh] starting — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Step 1: full prod → staging restore + PII anonymization.
# Use staging's own copy of the script — both repos are the same codebase.
# dump-prod-anonymized.sh uses hardcoded /opt/power2plant/ paths internally,
# so calling it from PROJECT_PATH works regardless of what PROD_PATH is set to.
bash "${PROJECT_PATH}/scripts/dump-prod-anonymized.sh" --target staging

# Step 2: pg_dump the now-clean anonymized staging DB → save to dump file
mkdir -p "$(dirname "$STAGING_DUMP_FILE")"
sudo -u "$DEPLOY_USERNAME" docker compose -f "${PROJECT_PATH}/docker-compose.yml" \
  run --rm -T scripts \
  sh -c 'pg_dump "${DATABASE_URL%%\?*}" --no-owner --no-acl' \
  > "$STAGING_DUMP_FILE"

echo "[staging-dump-refresh] saved to $STAGING_DUMP_FILE ($(du -sh "$STAGING_DUMP_FILE" | cut -f1))"
echo "[staging-dump-refresh] done — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
