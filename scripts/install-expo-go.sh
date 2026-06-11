#!/usr/bin/env bash
# Expo Go SDK 56 → эмулятор/устройство через adb (без Play Store / Google sign-in).
set -euo pipefail

SDK="${EXPO_GO_SDK:-56}"
VERSION="${EXPO_GO_VERSION:-56.0.1}"
APK_URL="https://github.com/expo/expo-go-releases/releases/download/Expo-Go-${VERSION}/Expo-Go-${VERSION}.apk"
APK="/tmp/Expo-Go-${VERSION}.apk"

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

if ! command -v adb >/dev/null; then
  echo "adb not found. Install: brew install --cask android-platform-tools"
  exit 1
fi

if ! adb devices | grep -qE 'device$'; then
  echo "No adb device. Start emulator: pnpm emulator"
  exit 1
fi

echo "Downloading Expo Go SDK ${SDK} (${VERSION})…"
curl -fL "$APK_URL" -o "$APK"
file "$APK" | grep -q 'Android package' || {
  echo "Download failed — not an APK. URL: $APK_URL"
  exit 1
}

echo "Installing on $(adb devices | awk 'NR==2{print $1}')…"
adb install -r "$APK"
echo "Done. Open Expo Go on the emulator."
