#!/usr/bin/env bash
# Kept as a compatibility npm command. JavaScript is intentionally not bundled.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node --check "$ROOT/docs/js/app.js"
COMBINED="$(mktemp --suffix=.js)"
trap 'rm -f "$COMBINED"' EXIT
for module in "$ROOT"/docs/js/modules/*.js; do
  node --check "$module"
  cat "$module" >> "$COMBINED"
  printf '\n;\n' >> "$COMBINED"
done
# Classic scripts share a global lexical environment. Check their concatenation
# too, so duplicate top-level const/let declarations fail CI without creating a bundle.
node --check "$COMBINED"
printf '%s\n' 'JavaScript modules are loaded directly; no app.js bundle was produced.'
