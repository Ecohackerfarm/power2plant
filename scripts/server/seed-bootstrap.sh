#!/usr/bin/env bash
# Idempotently seed the prod DB from db/seed.sql on a fresh volume.
#
# Discriminator: a sentinel file on the persistent volume. Present → already
# seeded, exit no-op. Absent → fresh DB, restore from db/seed.sql.
# Once prod is live, real data diverges from db/seed.sql, and the sentinel
# prevents this script from ever clobbering it. To intentionally reseed
# (e.g. after a volume loss + recovery decision), delete the sentinel.
#
# Called automatically from deploy.sh; safe to run manually too.
# Expects DEPLOY_USERNAME and PROJECT_PATH in env (deploy.sh provides both).
set -euo pipefail

: "${DEPLOY_USERNAME:?not set — set DEPLOY_USERNAME or run via deploy.sh}"
: "${PROJECT_PATH:?not set — set PROJECT_PATH or run via deploy.sh}"

cd "$PROJECT_PATH"

# VOLUME_DATA_DIR is the volume root for db data — sentinel lives one level up
# from postgres/ so postgres never sees it.
if [[ -f .env ]]; then
  VOLUME_DATA_DIR=$(grep -E '^VOLUME_DATA_DIR=' .env | cut -d= -f2- | tr -d '"')
fi
: "${VOLUME_DATA_DIR:?VOLUME_DATA_DIR not set in $PROJECT_PATH/.env}"

SENTINEL="${VOLUME_DATA_DIR}/seeded.marker"
SEED_FILE="${PROJECT_PATH}/db/seed.sql"

if [[ -f "$SENTINEL" ]]; then
  echo "[seed] sentinel present at $SENTINEL — skipping"
  exit 0
fi

if [[ ! -f "$SEED_FILE" ]]; then
  echo "[seed] $SEED_FILE missing — cannot bootstrap" >&2
  exit 1
fi

echo "[seed] sentinel absent — bootstrapping from $SEED_FILE"

# Stop app to avoid races during the schema reset
sudo -u "$DEPLOY_USERNAME" docker compose stop app

# Wait until db is healthy (compose start above doesn't gate on this)
for _ in $(seq 1 30); do
  if sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
       pg_isready -U power2plant -q; then
    break
  fi
  sleep 1
done

# Wipe the schema — seed.sql includes schema + data + migration history,
# so it must land on an empty public schema.
sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
  psql -U power2plant -d power2plant \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

# Load seed
sudo -u "$DEPLOY_USERNAME" docker compose exec -T db \
  psql -U power2plant -d power2plant < "$SEED_FILE"

# Mark seeded (must succeed before we start the app; if the touch fails we
# refuse to claim victory)
touch "$SENTINEL"

# Restart app — prisma migrate deploy now sees seed.sql's migration history
# and no-ops; new migrations added since the dump will apply on top.
sudo -u "$DEPLOY_USERNAME" docker compose start app

echo "[seed] done — sentinel written to $SENTINEL"
