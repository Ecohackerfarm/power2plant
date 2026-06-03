#!/bin/sh
# Pipeline: run remaining Wikidata passes while zh-Hans GBIF runs in background.
# GBIF passes run sequentially (one at a time, rate limiting).
# Within each locale: wikidata always completes before gbif starts.
set -e

export DATABASE_URL="${DATABASE_URL:-postgresql://power2plant:power2plant@172.22.0.3:5432/power2plant}"
SCRIPT="scripts/enrich/translate-names.ts"
LOG=/tmp/fill-progress-pipeline.log

log() { echo "[$(date)] $1" | tee -a "$LOG"; }

# ── zh-Hans Wikidata (must finish before zh-Hans GBIF) ──────────────────────
log "zh-Hans WIKIDATA start"
npx tsx "$SCRIPT" --locale zh-Hans --source wikidata > /tmp/fill-wikidata-zh-Hans.log 2>&1
log "zh-Hans WIKIDATA done"

# ── zh-Hans GBIF background + ar/hi/ru/ja Wikidata foreground ───────────────
log "zh-Hans GBIF start (background)"
npx tsx "$SCRIPT" --locale zh-Hans --source gbif > /tmp/fill-gbif-zh-Hans.log 2>&1 &
ZH_GBIF_PID=$!

for locale in ar hi ru ja; do
  log "$locale WIKIDATA start"
  npx tsx "$SCRIPT" --locale "$locale" --source wikidata > "/tmp/fill-wikidata-${locale}.log" 2>&1
  log "$locale WIKIDATA done"
done

log "Waiting for zh-Hans GBIF..."
wait $ZH_GBIF_PID
log "zh-Hans GBIF done"

# ── GBIF passes sequential (one at a time) ───────────────────────────────────
for locale in ar hi ru ja; do
  sleep 120
  log "$locale GBIF start"
  npx tsx "$SCRIPT" --locale "$locale" --source gbif > "/tmp/fill-gbif-${locale}.log" 2>&1
  log "$locale GBIF done"
done

log "ALL_DONE"
