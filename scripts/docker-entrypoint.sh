#!/bin/sh
set -e

# Replace NEXT_PUBLIC_ placeholder strings baked at build time with runtime
# env var values. Allows a single generic image to serve any environment.
_replace() {
  find /app/.next/static /app/.next/server -name "*.js" \
    -exec sed -i "s|${1}|${2}|g" {} +
}

_replace "__NEXT_PUBLIC_APP_URL__"                "${NEXT_PUBLIC_APP_URL:-}"
_replace "__NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY__" "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}"
_replace "__NEXT_PUBLIC_KOFI_URL__"               "${NEXT_PUBLIC_KOFI_URL:-}"

prisma migrate deploy
exec node server.js
