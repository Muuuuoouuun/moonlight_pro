#!/bin/bash
set -euo pipefail

package_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-hub-transport.XXXXXX")"
trap 'rm -rf "$test_dir"' EXIT

# Foundation-only checks also run with Command Line Tools installations that
# lack XCTest or a working Swift Testing runtime. No app or live records run.
swiftc -parse-as-library \
  "$package_dir/Sources/MoonlightPetPreview/Support/HubTransport.swift" \
  "$package_dir/Tests/MoonlightPetPreviewTests/HubTransportTests.swift" \
  -o "$test_dir/HubTransportTests"
"$test_dir/HubTransportTests"
