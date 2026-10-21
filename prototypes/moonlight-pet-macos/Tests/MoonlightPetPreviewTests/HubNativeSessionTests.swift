import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private struct UnusedMemoryCredentials: HubCredentialStoring {
    func load(origin: String) throws -> HubCredentials? { nil }
    func save(_ credentials: HubCredentials, origin: String) throws { preconditionFailure("Unexpected synthetic credential save") }
    func remove(origin: String) throws { preconditionFailure("Unexpected synthetic credential removal") }
}

private final class SharedSessionProtocol: URLProtocol {
    static var expectedCookie = "com_moon_operator_session=first-session"
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        precondition(request.value(forHTTPHeaderField: "Cookie") == Self.expectedCookie, "Shared session was not applied")
        precondition(request.value(forHTTPHeaderField: "Authorization") == nil, "Local capability leaked to Hub")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{\"status\":\"authenticated\",\"configured\":true}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

@main private struct NativeSessionRunner {
    static func main() async throws {
        let descriptor = URL(fileURLWithPath: CommandLine.arguments[1])
        let bridge = NativeHubSessionBridge(descriptorURL: descriptor)
        let origin = URL(string: "https://hub.example.test")!
        let initial = await withTaskGroup(of: HubSharedSession?.self, returning: [HubSharedSession?].self) { group in
            for _ in 0..<20 { group.addTask { await bridge.read() } }
            var values: [HubSharedSession?] = []
            for await value in group { values.append(value) }
            return values
        }
        precondition(initial.count == 20 && initial.allSatisfy { $0 == HubSharedSession(origin: origin, cookie: "first-session") },
                     "Concurrent startup reads must share a validated session")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SharedSessionProtocol.self]
        let client = try HubTransport(baseURL: origin, configuration: configuration,
            credentialStore: UnusedMemoryCredentials(), sharedSession: { await bridge.read() })
        let authenticated = try await client.sessionStatus()
        precondition(authenticated.isAuthenticated, "Hub session must authenticate without another login")
        try await Task.sleep(for: .milliseconds(1100))
        let loggedOut = await bridge.read()
        precondition(loggedOut?.cookie == nil && loggedOut?.origin == origin, "Hub logout must reach the native client")
        do {
            _ = try await client.request(path: "/api/hub/tasks")
            fatalError("Logged-out session must not read Hub")
        } catch { precondition(error as? HubTransportError == .unauthorized) }
        try await Task.sleep(for: .milliseconds(1100))
        SharedSessionProtocol.expectedCookie = "com_moon_operator_session=rotated-session"
        _ = try await client.request(path: "/api/hub/tasks")

        let insecure = descriptor.deletingLastPathComponent().appendingPathComponent("insecure.json")
        try Data(contentsOf: descriptor).write(to: insecure)
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: insecure.path)
        let rejected = await NativeHubSessionBridge(descriptorURL: insecure).read()
        precondition(rejected == nil, "World-readable capabilities must be rejected")
        let symlink = descriptor.deletingLastPathComponent().appendingPathComponent("symlink.json")
        try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: descriptor)
        let rejectedLink = await NativeHubSessionBridge(descriptorURL: symlink).read()
        precondition(rejectedLink == nil, "Symlinked capabilities must be rejected")
        let invalid = descriptor.deletingLastPathComponent().appendingPathComponent("invalid.json")
        try JSONSerialization.data(withJSONObject: ["url": "https://hub.example.test/session", "token": String(repeating: "a", count: 64)]).write(to: invalid)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: invalid.path)
        let rejectedEndpoint = await NativeHubSessionBridge(descriptorURL: invalid).read()
        precondition(rejectedEndpoint == nil, "Local capability must never be sent to an external endpoint")
        print("PASS: Hub shell → native session sharing, 20 concurrent reads coalesced, session confirmation, logout/login, descriptor isolation")
    }
}
