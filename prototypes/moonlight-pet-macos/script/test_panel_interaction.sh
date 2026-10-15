#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-panel-interaction.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
swiftc -parse-as-library -o "$output_dir/check" \
  Sources/MoonlightPetPreview/Support/PanelInteraction.swift \
  Tests/MoonlightPetPreviewTests/PanelInteractionTests.swift
"$output_dir/check"
