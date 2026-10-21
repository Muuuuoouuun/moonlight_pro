#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-meeting-pages.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
 "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/OfficeRoleCatalog.generated.swift" "$src/Models/OfficeDiscussionModels.swift" "$src/Models/OfficeChatModels.swift" "$src/Models/OfficeConversationModels.swift" \
 "$src/Models/OfficeMeetingModels.swift" "$src/Models/OfficeChatStore.swift" "$src/Models/CouncilDraftStore.swift" \
 "$src/Support/HubCredentials.swift" "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/OfficeMeetingPages.swift" "$src/Support/HubOfficeAPI.swift" \
 Tests/MoonlightPetPreviewTests/OfficeMeetingPageTests.swift
# Generate expiring vectors after compilation, including on a slow cold Mac.
# Only synthetic server protocol data; no Hub, bridge, model or Keychain.
node script/office_meeting_page_vectors.mjs "$output_dir/vectors.json"
"$output_dir/check" "$output_dir/vectors.json"
