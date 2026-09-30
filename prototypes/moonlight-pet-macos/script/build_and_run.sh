#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
case "$MODE" in
  run|--debug|debug|--logs|logs|--telemetry|telemetry|--verify|verify|--install|--build-only|--glass-lab|--desktop-refraction) ;;
  *) echo "Unknown mode: $MODE" >&2; exit 2 ;;
esac
APP_NAME="MoonlightPetPreview"
BUNDLE_ID="app.moonlight.pet-preview"
# Material studies have their own executable/bundle identity. Iterating the
# lab must not replace or stop the screen-recording-authorized desktop app.
if [[ "$MODE" == "--glass-lab" ]]; then
  APP_NAME="MoonlightGlassLab"
  BUNDLE_ID="app.moonlight.glass-lab"
fi
MIN_SYSTEM_VERSION="14.0"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/dist/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/$APP_NAME"

SWIFT_SDK="${MOONLIGHT_SWIFT_SDK:-}"
if [[ -z "$SWIFT_SDK" && "$(xcode-select -p)" == */CommandLineTools && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk ]]; then
  # The current CLT compiler cannot load the SwiftUI macros in the adjacent 27 SDK.
  SWIFT_SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
fi
SDK_ARGS=(--sdk "${SWIFT_SDK:-$(xcrun --sdk macosx --show-sdk-path)}")
swift build -j 2 --package-path "$ROOT_DIR" "${SDK_ARGS[@]}"
BUILD_DIR="$(swift build --package-path "$ROOT_DIR" "${SDK_ARGS[@]}" --show-bin-path)"
BUILD_BINARY="$BUILD_DIR/MoonlightPetPreview"
RESOURCE_BUNDLE="$BUILD_DIR/MoonlightPetPreview_MoonlightPetPreview.bundle"

if [[ ! -d "$RESOURCE_BUNDLE" ]]; then
  echo "missing SwiftPM resource bundle: $RESOURCE_BUNDLE" >&2
  exit 1
fi

STAGED_BUNDLE="$ROOT_DIR/dist/.staging-$$/$APP_NAME.app"
APP_CONTENTS="$STAGED_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/$APP_NAME"
trap 'rm -rf "$ROOT_DIR/dist/.staging-$$"' EXIT
mkdir -p "$APP_CONTENTS/MacOS" "$APP_CONTENTS/Resources"
cp "$BUILD_BINARY" "$APP_BINARY"
cp -R "$RESOURCE_BUNDLE" "$APP_CONTENTS/Resources/"
chmod +x "$APP_BINARY"
cat > "$APP_CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>$APP_NAME</string>
<key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
<key>CFBundleName</key><string>$APP_NAME</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>$MIN_SYSTEM_VERSION</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST

# Sign the assembled bundle: the Swift linker signature does not bind Info.plist
# or resources and fails strict bundle verification. A real development identity
# can be supplied to preserve TCC identity across code changes.
/usr/bin/codesign --force --sign "${MOONLIGHT_CODE_SIGN_IDENTITY:--}" --timestamp=none \
  --identifier "$BUNDLE_ID" "$STAGED_BUNDLE"
/usr/bin/codesign --verify --strict --verbose=2 "$STAGED_BUNDLE"

if [[ "$MODE" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  APP_BUNDLE="$HOME/Applications/$APP_NAME.app"
fi
if [[ "$MODE" != "--build-only" ]]; then
  # Stop only after the new bundle builds and verifies; a compiler failure leaves
  # the working pet untouched. Drafts are already autosaved by AppModel.
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
  for attempt in {1..30}; do
    pgrep -x "$APP_NAME" >/dev/null || break
    sleep 0.1
  done
  if pgrep -x "$APP_NAME" >/dev/null; then
    echo "The existing pet did not stop; keeping the installed app." >&2
    exit 1
  fi
fi
if [[ -d "$APP_BUNDLE" ]]; then
  BACKUP_BUNDLE="${APP_BUNDLE%.app}.previous.app"
  rm -rf "$BACKUP_BUNDLE"
  mv "$APP_BUNDLE" "$BACKUP_BUNDLE"
fi
mv "$STAGED_BUNDLE" "$APP_BUNDLE"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

open_app() { /usr/bin/open -n "$APP_BUNDLE"; }

case "$MODE" in
  run) open_app ;;
  --desktop-refraction) /usr/bin/open -n "$APP_BUNDLE" --args --desktop-refraction ;;
  --glass-lab) /usr/bin/open -n "$APP_BUNDLE" --args --glass-lab ;;
  --debug|debug) lldb -- "$APP_BINARY" ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify|--install)
    open_app
    sleep 1
    # Signing changes the executable bytes; the Mach-O build UUID must match.
    [[ "$(/usr/bin/dwarfdump --uuid "$BUILD_BINARY" | awk '{print $2}')" == \
       "$(/usr/bin/dwarfdump --uuid "$APP_BINARY" | awk '{print $2}')" ]]
    RUNNING_PIDS="$(pgrep -x "$APP_NAME")"
    [[ "$(printf '%s\n' "$RUNNING_PIDS" | wc -l | tr -d ' ')" == "1" ]]
    [[ "$(ps -p "$RUNNING_PIDS" -o command=)" == "$APP_BINARY" ]]
    echo "Verified running build: $APP_BINARY (pid $RUNNING_PIDS)"
    ;;
  --build-only) echo "Built and verified: $APP_BUNDLE" ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify|--install|--build-only|--glass-lab|--desktop-refraction]" >&2
    exit 2
    ;;
esac
