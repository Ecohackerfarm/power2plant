#!/bin/bash
set -e

CMD="${1:-up}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

case "$CMD" in
  up)
    $COMPOSE up -d
    ;;
  down)
    $COMPOSE down
    ;;
  build)
    $COMPOSE down
    $COMPOSE build
    $COMPOSE up -d
    ;;
  rebuild)
    $COMPOSE down
    $COMPOSE build --no-cache
    $COMPOSE up -d
    ;;
  *)
    echo "Usage: $0 {up|down|build|rebuild}"
    exit 1
    ;;
esac
