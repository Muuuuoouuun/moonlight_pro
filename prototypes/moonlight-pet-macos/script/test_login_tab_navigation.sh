#!/usr/bin/env bash
set -euo pipefail
package_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-login-tab.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT
sdk="${MOONLIGHT_SWIFT_SDK:-}"
if [[ -z "$sdk" && "$(xcode-select -p)" == */CommandLineTools && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk ]]; then
  sdk=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
fi
swiftc -sdk "${sdk:-$(xcrun --sdk macosx --show-sdk-path)}" -parse-as-library \
  "$package_dir/Sources/MoonlightPetPreview/Support/LoginTabNavigation.swift" \
  "$package_dir/Tests/MoonlightPetPreviewTests/LoginTabNavigationTests.swift" -o "$test_dir/check"
"$test_dir/check"
