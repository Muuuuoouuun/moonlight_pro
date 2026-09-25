#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-hub-activity.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
cat > "$output_dir/Runner.swift" <<'SWIFT'
import Foundation
@main struct ActivityRunner {
    static func main() async {
        do { print("PASS: Hub activity API contract checks (\(try await runHubActivityContractTests()))") }
        catch { print("FAIL: \(error)"); exit(1) }
    }
}
SWIFT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
  "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/HubActivityModels.swift" \
  "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/HubActivityAPI.swift" \
  Tests/MoonlightPetPreviewTests/HubActivityContractTests.swift "$output_dir/Runner.swift"
"$output_dir/check"
