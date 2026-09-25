#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
output_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-office-chat.XXXXXX")"
trap 'rm -rf "$output_dir"' EXIT
cat > "$output_dir/Runner.swift" <<'SWIFT'
import Foundation
@main struct OfficeContractRunner {
    static func main() async {
        do { print("PASS: Office chat API contract checks (\(try await runOfficeChatContractTests()))") }
        catch { print("FAIL: \(error)"); exit(1) }
    }
}
SWIFT
src=Sources/MoonlightPetPreview
swiftc -parse-as-library -o "$output_dir/check" \
  "$src/Models/LocalTask.swift" "$src/Models/HubModels.swift" "$src/Models/OfficeChatModels.swift" \
  "$src/Support/HubTransport.swift" "$src/Support/HubAPI.swift" "$src/Support/HubOfficeAPI.swift" \
  Tests/MoonlightPetPreviewTests/OfficeChatContractTests.swift "$output_dir/Runner.swift"
"$output_dir/check"
