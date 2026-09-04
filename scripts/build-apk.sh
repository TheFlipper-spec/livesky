#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="debug"
for arg in "$@"; do
  case "$arg" in
    --release|release)
      MODE="release"
      ;;
    --debug|debug)
      MODE="debug"
      ;;
  esac
done

echo "=================================================="
echo "  LiveSky Weather — Android APK Build ($MODE)     "
echo "=================================================="

echo "==> [1/4] Verifying dependencies & running smoke tests..."
if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# Run smoke test & syntax checks
npm test
npm run build:js

echo "==> [2/4] Syncing web assets into Android project (Capacitor)..."
npm run cap:sync

echo "==> [3/4] Configuring Java / Gradle environment..."
cd "$ROOT/android"
chmod +x ./gradlew

# Auto-detect Java 21 if available on host or in standard paths
if [ -n "${JAVA_HOME_21_X64:-}" ] && [ -x "$JAVA_HOME_21_X64/bin/java" ]; then
  export JAVA_HOME="$JAVA_HOME_21_X64"
elif [ -z "${JAVA_HOME:-}" ]; then
  for candidate in \
    "/usr/lib/jvm/java-21-openjdk-amd64" \
    "/usr/lib/jvm/temurin-21-jdk-amd64" \
    "/usr/lib/jvm/java-21-openjdk" \
    "/opt/hostedtoolcache/Java_Temurin-Hotspot_jdk/21"* \
    "/usr/lib/jvm/default-java"; do
    if [ -d "$candidate" ] && [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

echo "==> [4/4] Compiling APK ($MODE)..."
if [[ "$MODE" == "release" ]]; then
  ./gradlew assembleRelease --stacktrace
  APK_PATH="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug --stacktrace
  APK_PATH="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
fi

echo "=================================================="
if [ -f "$APK_PATH" ]; then
  echo "✅ BUILD SUCCESSFUL!"
  echo "APK file generated at: $APK_PATH"
  ls -lh "$APK_PATH"
else
  echo "Build completed. Check android/app/build/outputs/apk/ for output."
fi
echo "=================================================="
