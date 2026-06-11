#!/usr/bin/env bash
# Запуск AVD ShadowTube (Android 14, Pixel 6, Play Store).
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

AVD="${1:-ShadowTube_Pixel_6}"

if ! avdmanager list avd 2>/dev/null | grep -q "Name: $AVD"; then
  echo "AVD '$AVD' not found. Create with:"
  echo "  avdmanager create avd -n ShadowTube_Pixel_6 -k 'system-images;android-34;google_apis_playstore;arm64-v8a' -d pixel_6"
  exit 1
fi

echo "Starting emulator: $AVD"
exec emulator -avd "$AVD" -gpu host "$@"
