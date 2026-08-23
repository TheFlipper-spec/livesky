#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/js/app.js"
MODULES=(
  01-core.js
  02-weather-data.js
  03-rendering.js
  04-chart.js
  05-hourly-alerts.js
  06-air.js
  07-effects.js
  08-search-modals.js
  09-lifecycle.js
  10-map-radar.js
)
{
  printf '%s\n' '/* Generated from docs/js/modules/*.js — edit the modules, then run npm run build:js. */'
  for module in "${MODULES[@]}"; do
    cat "$ROOT/docs/js/modules/$module"
  done
} > "$OUT"
