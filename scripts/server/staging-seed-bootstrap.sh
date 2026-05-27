#!/usr/bin/env bash
# Idempotently bootstrap staging DB — either from a non-user prod dump or seed.sql.
#
# Controlled by STAGING_DATA_SOURCE in staging .env:
#   prod  — pg_dump prod DB (excludes auth/user-garden tables), restore to staging
#   seed  — restore from db/seed.sql (default)
#
# Sentinel file on the staging volume prevents re-seeding on subsequent deploys.
# To reseed, delete the sentinel and redeploy.
#
# Called automatically from staging-deploy.sh; safe to run manually too.
# Expects DEPLOY_USERNAME, PROJECT_PATH (staging path), and PROD_PATH in env.
set -euo pipefail

: "${DEPLOY_USERNAME:?}"
: "${PROJECT_PATH:?}"
: "${PROD_PATH:?}"

cd "$PROJECT_PATH"

VOLUME_DATA_DIR=""
STAGING_DATA_SOURCE=""
if [[ -f .env ]]; then
  VOLUME_DATA_DIR=$(grep -E '^VOLUME_DATA_DIR=' .env | cut -d= -f2- | tr -d '"' || true)
  STAGING_DATA_SOURCE=$(grep -E '^STAGING_DATA_SOURCE=' .env | cut -d= -f2- | tr -d '"' || true)
fi
: "${VOLUME_DATA_DIR:?VOLUME_DATA_DIR not set in $PROJECT_PATH/.env}"
STAGING_DATA_SOURCE="${STAGING_DATA_SOURCE:-seed}"

SENTINEL="${VOLUME_DATA_DIR}/seeded.marker"

if [[ -f "$SENTINEL" ]]; then
  echo "[staging-seed] sentinel present at $SENTINEL — skipping"
  exit 0
fi

echo "[staging-seed] sentinel absent — bootstrapping (mode: ${STAGING_DATA_SOURCE})"

sudo -u "$DEPLOY_USERNAME" docker compose stop app

for _ in $(seq 1 30); do
  if sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
       pg_isready -U power2plant -q; then
    break
  fi
  sleep 1
done

sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
  psql -U power2plant -d power2plant \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

if [[ "$STAGING_DATA_SOURCE" == "prod" ]]; then
  echo "[staging-seed] dumping non-user data from prod..."
  sudo -u "$DEPLOY_USERNAME" docker compose \
    --project-directory "$PROD_PATH" \
    exec -T db \
    pg_dump -U power2plant power2plant \
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
  | sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
      psql -U power2plant -d power2plant
else
  SEED_FILE="${PROJECT_PATH}/db/seed.sql"
  if [[ ! -f "$SEED_FILE" ]]; then
    echo "[staging-seed] $SEED_FILE missing — cannot bootstrap" >&2
    exit 1
  fi
  sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
    psql -U power2plant -d power2plant < "$SEED_FILE"
fi

touch "$SENTINEL"
sudo -u "$DEPLOY_USERNAME" docker compose start app
echo "[staging-seed] done — sentinel written to $SENTINEL"
