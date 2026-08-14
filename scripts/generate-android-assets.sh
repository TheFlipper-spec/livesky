#!/usr/bin/env bash
set -euo pipefail

# Regenerates branded Android launcher, notification and splash resources from
# the canonical PWA icon. Requires ImageMagick's `convert` command.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/docs/icons/icon-512.png"
RES="$ROOT/android/app/src/main/res"

if ! command -v convert >/dev/null 2>&1; then
  echo "ImageMagick is required (missing: convert)." >&2
  exit 1
fi
if [[ ! -f "$SOURCE" || ! -d "$RES" ]]; then
  echo "Missing source icon or Android project." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Isolate the white wind mark for adaptive and monochrome notification icons.
convert "$SOURCE" \
  \( +clone -colorspace Gray -level 74%,100% \) \
  -alpha off -compose CopyOpacity -composite \
  -fill white -colorize 100 "$TMP/foreground.png"

# Keep legacy icons tidy on launchers which do not apply their own mask.
convert "$SOURCE" -alpha set \
  \( -size 512x512 xc:none -fill white -draw 'roundrectangle 0,0 511,511 112,112' \) \
  -compose DstIn -composite "$TMP/legacy.png"
convert "$SOURCE" -alpha set \
  \( -size 512x512 xc:none -fill white -draw 'circle 256,256 256,1' \) \
  -compose DstIn -composite "$TMP/round.png"

DENSITIES=(mdpi hdpi xhdpi xxhdpi xxxhdpi)
LEGACY_SIZES=(48 72 96 144 192)
FOREGROUND_SIZES=(108 162 216 324 432)
NOTIFICATION_SIZES=(24 36 48 72 96)
SPLASH_SCALES=(1 1.5 2 3 4)
PORT_SIZES=("320x480" "480x800" "720x1280" "960x1600" "1280x1920")
LAND_SIZES=("480x320" "800x480" "1280x720" "1600x960" "1920x1280")

for i in "${!DENSITIES[@]}"; do
  density="${DENSITIES[$i]}"
  legacy="${LEGACY_SIZES[$i]}"
  foreground="${FOREGROUND_SIZES[$i]}"
  notification="${NOTIFICATION_SIZES[$i]}"

  mkdir -p "$RES/mipmap-$density" "$RES/drawable-$density"
  convert "$TMP/legacy.png" -filter Lanczos -resize "${legacy}x${legacy}" -strip "$RES/mipmap-$density/ic_launcher.png"
  convert "$TMP/round.png" -filter Lanczos -resize "${legacy}x${legacy}" -strip "$RES/mipmap-$density/ic_launcher_round.png"
  convert "$TMP/foreground.png" -filter Lanczos -resize "${foreground}x${foreground}" -strip "$RES/mipmap-$density/ic_launcher_foreground.png"

  # Android status-bar icons are white alpha masks on a transparent 24dp canvas.
  glyph=$((notification * 5 / 6))
  convert "$TMP/foreground.png" -trim +repage -filter Lanczos -resize "${glyph}x${glyph}" \
    -gravity center -background none -extent "${notification}x${notification}" -strip \
    "$RES/drawable-$density/ic_stat_livesky.png"

  # Full-screen fallback splash used on pre-Android-12 devices.
  icon_size=$(awk -v scale="${SPLASH_SCALES[$i]}" 'BEGIN { printf "%d", 160 * scale }')
  convert -size "${PORT_SIZES[$i]}" gradient:'#0a1020-#05070f' \
    \( "$TMP/legacy.png" -filter Lanczos -resize "${icon_size}x${icon_size}" \) \
    -gravity center -compose over -composite -depth 8 -strip "$RES/drawable-port-$density/splash.png"
  convert -size "${LAND_SIZES[$i]}" gradient:'#0a1020-#05070f' \
    \( "$TMP/legacy.png" -filter Lanczos -resize "${icon_size}x${icon_size}" \) \
    -gravity center -compose over -composite -depth 8 -strip "$RES/drawable-land-$density/splash.png"
done

# Base drawable fallback.
convert -size 480x320 gradient:'#0a1020-#05070f' \
  \( "$TMP/legacy.png" -filter Lanczos -resize 160x160 \) \
  -gravity center -compose over -composite -depth 8 -strip "$RES/drawable/splash.png"

echo "Android assets generated from docs/icons/icon-512.png"
