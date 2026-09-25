#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-office-chat.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
 "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" \
 "$src/Models/OfficeChatModels.swift" "$src/Models/OfficeChatStore.swift" \
 "$src/Models/CouncilDraftStore.swift" \
 "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/HubOfficeAPI.swift" \
 Tests/MoonlightPetPreviewTests/OfficeChatStoreTests.swift
"$output_dir/check"
