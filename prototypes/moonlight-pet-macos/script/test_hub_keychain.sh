#!/bin/bash
set -euo pipefail
package_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/moonlight-hub-keychain.XXXXXX")"
service="app.moonlight.pet-preview.tests.$(uuidgen)"
cleanup() {
  if [[ -x "$test_dir/check" ]]; then "$test_dir/check" "$service" cleanup >/dev/null 2>&1 || true; fi
  rm -rf "$test_dir"
}
trap cleanup EXIT
cat > "$test_dir/Runner.swift" <<'SWIFT'
import Foundation
@main struct KeychainCheck {
    static func main() throws {
        let store = KeychainHubCredentialStore(service: CommandLine.arguments[1])
        let origin = "https://keychain-check.example.test"
        switch CommandLine.arguments[2] {
        case "write":
            try store.save(HubCredentials(username: "keychain-check", password: UUID().uuidString), origin: origin)
            print("PASS: isolated keychain write")
        case "read":
            guard let value = try store.load(origin: origin), value.username == "keychain-check", UUID(uuidString: value.password) != nil,
                  try store.load(origin: "https://another.example.test") == nil else { throw HubTransportError.credentialStorage }
            print("PASS: keychain survives process restart and separates origins")
        default:
            try store.remove(origin: origin)
            guard try store.load(origin: origin) == nil else { throw HubTransportError.credentialStorage }
            print("PASS: keychain deletion")
        }
    }
}
SWIFT
swiftc -parse-as-library \
  "$package_dir/Sources/MoonlightPetPreview/Support/HubCredentials.swift" \
  "$package_dir/Sources/MoonlightPetPreview/Support/HubTransport.swift" \
  "$test_dir/Runner.swift" -o "$test_dir/check"
/usr/bin/codesign --force --sign - --timestamp=none --identifier "$service" "$test_dir/check"
"$test_dir/check" "$service" write
"$test_dir/check" "$service" read
"$test_dir/check" "$service" cleanup
