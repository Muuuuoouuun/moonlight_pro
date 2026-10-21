import Foundation

@main
struct HubDesktopSessionTests {
    static func main() async throws {
        let mode = CommandLine.arguments[1]
        let target = CommandLine.arguments[2]
        if mode == "bridge" {
            let bridge = HubDesktopSessionBridge(directory: target)
            let origin = "https://hub.example.test"
            guard let initial = await bridge.read(origin: origin), initial.session == nil,
                  HubDesktopPeer.classify(initial, origin: origin) == .verified else { throw Failure.check }
            let saved = HubSavedSession(value: "native.signature", expiresAt: Date().timeIntervalSince1970 + 3600)
            await bridge.write(saved, origin: origin)
            guard let shared = await bridge.read(origin: origin), shared.session == saved else { throw Failure.check }
            guard await bridge.read(origin: "https://other.example.test") == nil else { throw Failure.check }
            await bridge.write(nil, origin: origin)
            guard let cleared = await bridge.read(origin: origin), cleared.session == nil else { throw Failure.check }
        } else if mode == "legacy-rejection" {
            let bridge = HubDesktopSessionBridge(directory: target)
            let origin = CommandLine.arguments[3]
            let initial = await bridge.read(origin: origin)
            guard HubDesktopPeer.classify(initial, origin: origin) == .unsupported,
                  let saved = initial?.session else { throw Failure.check }
            await bridge.write(HubSavedSession(value: "unaccepted.signature", expiresAt: saved.expiresAt), origin: origin)
            guard await bridge.recordLogout(origin: origin) == nil,
                  let unchanged = await bridge.read(origin: origin), unchanged.session == saved,
                  unchanged.signedOut == false else { throw Failure.check }
        }
        print("PASS \(mode)")
    }
    enum Failure: Error { case check }
}
