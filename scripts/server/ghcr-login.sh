#!/usr/bin/env bash
# Authenticate the deploy user to ghcr.io so `docker compose pull` can fetch the
# private power2plant images. Reads GHCR_USER / GHCR_TOKEN from the project .env.
#
# No-op when GHCR_TOKEN is unset — e.g. if the ghcr package is later made public,
# pulls work without auth and no token is needed.
#
# DEPLOY_USERNAME and PROJECT_PATH are inherited from the calling deploy script.
set -euo pipefail

: "${DEPLOY_USERNAME:?not set — run scripts/server/setup.sh to reinstall the service unit}"
: "${PROJECT_PATH:?not set — run scripts/server/setup.sh to reinstall the service unit}"

GHCR_USER=$(grep -E '^GHCR_USER=' "${PROJECT_PATH}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
GHCR_TOKEN=$(grep -E '^GHCR_TOKEN=' "${PROJECT_PATH}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)

if [[ -n "${GHCR_TOKEN}" ]]; then
  printf '%s' "$GHCR_TOKEN" | sudo -u "$DEPLOY_USERNAME" docker login ghcr.io -u "${GHCR_USER:-x}" --password-stdin
fi
