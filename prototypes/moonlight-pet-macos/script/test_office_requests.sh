#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
src=Sources/MoonlightPetPreview
for required in "$src/Models/OfficeRequestModels.swift" "$src/Models/OfficeRequestStore.swift" "$src/Support/HubOfficeRequestsAPI.swift"; do
  if [[ ! -f "$required" ]]; then
    echo "FAIL: Office request data layer is missing: $required"
    exit 1
  fi
done
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-office-requests.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
cat > "$output_dir/Runner.swift" <<'SWIFT'
import Foundation
@main struct OfficeRequestsRunner {
    @MainActor static func main() async {
        do {
            let contract = try await runOfficeRequestContractTests()
            let store = try await runOfficeRequestStoreTests()
            print("PASS: Office requests contract checks (\(contract)); store checks (\(store))")
        } catch { print("FAIL: \(error)"); exit(1) }
    }
}
SWIFT
swiftc -parse-as-library -o "$output_dir/check" \
 "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/OfficeRoleCatalog.generated.swift" \
 "$src/Models/OfficeDiscussionModels.swift" "$src/Models/OfficeChatModels.swift" "$src/Models/OfficeConversationModels.swift" \
 "$src/Models/OfficeRequestModels.swift" "$src/Models/OfficeRequestStore.swift" \
 "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/HubOfficeRequestsAPI.swift" \
 Tests/MoonlightPetPreviewTests/OfficeRequestContractTests.swift \
 Tests/MoonlightPetPreviewTests/OfficeRequestStoreTests.swift "$output_dir/Runner.swift"
"$output_dir/check"
