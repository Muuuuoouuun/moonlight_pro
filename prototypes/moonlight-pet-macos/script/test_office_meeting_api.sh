#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-office-meeting.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
 "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/OfficeRoleCatalog.generated.swift" "$src/Models/OfficeDiscussionModels.swift" "$src/Models/OfficeChatModels.swift" "$src/Models/OfficeConversationModels.swift" "$src/Models/OfficeChatStore.swift" "$src/Models/CouncilDraftStore.swift" \
 "$src/Models/OfficeMeetingModels.swift" "$src/Support/HubCredentials.swift" "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" \
 "$src/Support/HubOfficeAPI.swift" Tests/MoonlightPetPreviewTests/OfficeMeetingContractTests.swift
"$output_dir/check"
