#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-pet-activity-store.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
cat > "$output_dir/Runner.swift" <<'SWIFT'
import Foundation
@main struct PetActivityRunner {
    @MainActor static func main() async {
        do {
            print("PASS: Task completion checks (\(try await runTaskCompletionFeedbackTests()))")
            print("PASS: Pet activity and Council draft checks (\(try await runPetActivityStoreTests()))") }
        catch { print("FAIL: \(error)"); exit(1) }
    }
}
SWIFT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
  "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/HubActivityModels.swift" \
  "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/HubActivityAPI.swift" \
  "$src/Models/TaskCompletionFeedback.swift" "$src/Models/PetActivityStore.swift" "$src/Models/CouncilDraftStore.swift" \
  Tests/MoonlightPetPreviewTests/TaskCompletionFeedbackTests.swift Tests/MoonlightPetPreviewTests/PetActivityStoreTests.swift "$output_dir/Runner.swift"
"$output_dir/check"
