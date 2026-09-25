#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-hub-domain.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
  "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/HubStore.swift" \
  "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" \
  Tests/MoonlightPetPreviewTests/HubAPIContractTests.swift Tests/MoonlightPetPreviewTests/HubDomainTests.swift
"$output_dir/check" "$@"
