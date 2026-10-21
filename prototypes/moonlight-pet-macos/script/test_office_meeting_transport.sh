#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-meeting-transport.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
 "$src/Support/HubCredentials.swift" "$src/Support/HubTransport.swift" \
 Tests/MoonlightPetPreviewTests/OfficeMeetingTransportTests.swift
"$output_dir/check"
