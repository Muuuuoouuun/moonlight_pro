import Foundation

private func require(_ value: Bool, _ label: String) throws {
    if !value { throw NSError(domain: "OfficeMeetingTransportTests", code: 1, userInfo: [NSLocalizedDescriptionKey: label]) }
}
private final class MemoryCredentials: HubCredentialStoring, @unchecked Sendable {
    func load(origin: String) throws -> HubCredentials? { nil }
    func save(_ credentials: HubCredentials, origin: String) throws {}
    func remove(origin: String) throws {}
}
private final class OfficeURLProtocol: URLProtocol {
    static var handler: ((URLRequest, OfficeURLProtocol) throws -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do { try Self.handler?(request, self) }
        catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
    func respond(_ data: Data, headers: [String: String] = [:]) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
private actor ImportedSession: HubDesktopSessionSharing {
    private var value = "synthetic.one"
    func replace() { value = "synthetic.two" }
    func read(origin: String) async -> HubDesktopSession? {
        HubDesktopSession(origin: origin, session: HubSavedSession(value: value, expiresAt: Date().timeIntervalSince1970 + 3600))
    }
    func write(_ session: HubSavedSession?, origin: String) async {}
}
private actor HeldPublish: HubDesktopSessionSharing {
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var isPublishing = false
    func read(origin: String) async -> HubDesktopSession? {
        HubDesktopSession(origin: origin, session: HubSavedSession(value: "synthetic.before", expiresAt: Date().timeIntervalSince1970 + 3600))
    }
    func write(_ session: HubSavedSession?, origin: String) async {
        isPublishing = true
        await withCheckedContinuation { continuation = $0 }
    }
    func release() { continuation?.resume(); continuation = nil }
}
private final class StartedSignal: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func mark() { lock.lock(); value = true; lock.unlock() }
    var started: Bool { lock.lock(); defer { lock.unlock() }; return value }
}
private func makeTransport(bridge: (any HubDesktopSessionSharing)? = nil) throws -> HubTransport {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [OfficeURLProtocol.self]
    return try HubTransport(baseURL: URL(string: "https://native.synthetic.test")!, configuration: configuration,
                            credentialStore: MemoryCredentials(), desktopSession: bridge, sharedSession: { nil })
}
private let meetingPath = "/api/hub/office/meetings/10000000-0000-4000-8000-000000000001?readVersion=1&scope=personal"
private let sessionJSON = Data("{\"status\":\"authenticated\",\"configured\":true}".utf8)

@main private enum OfficeMeetingTransportTests {
    static func main() async throws {
        // Each fixture replaces URLSession and both credential/desktop sources.
        // No live home descriptor, Keychain, DNS, account or socket is involved.
        var officeCalls = 0
        let exact = Data(("{\"status\":\"ready\",\"padding\":\"" + String(repeating: "x", count: 262_144 - 31) + "\"}").utf8)
        try require(exact.count == 262_144, "exact envelope fixture size")
        OfficeURLProtocol.handler = { request, response in
            if request.url?.path == "/api/operator/session" { response.respond(sessionJSON); return }
            officeCalls += 1
            try require(request.value(forHTTPHeaderField: "x-office-read-version") == "1", "narrow negotiation header")
            response.respond(exact)
        }
        let client = try makeTransport()
        let operation = try await client.beginOfficeOperation()
        let response = try await client.officeRequest(path: meetingPath, method: "GET", body: nil, operation: operation, deadline: Date().addingTimeInterval(5))
        try require(response.data == exact && officeCalls == 1, "bounded streaming accepts full boundary")
        for oversizedLength in [false, true] {
            OfficeURLProtocol.handler = { _, response in
                response.respond(oversizedLength ? Data("{\"status\":\"ready\"}".utf8) : exact + Data([32]),
                                 headers: oversizedLength ? ["Content-Length": "262145"] : [:])
            }
            do {
                _ = try await client.officeRequest(path: meetingPath, method: "GET", body: nil, operation: operation, deadline: Date().addingTimeInterval(5))
                throw OfficeChatTransportFailure.expectedRejection
            } catch HubTransportError.invalidResponse {}
        }
        // Generic legacy transport still sends its original full response and
        // no negotiation header; upgrading this native reader changes no peer.
        OfficeURLProtocol.handler = { request, response in
            try require(request.value(forHTTPHeaderField: "x-office-read-version") == nil, "legacy request remains unchanged")
            response.respond(exact + Data([32]))
        }
        let legacy = try await client.request(path: meetingPath.components(separatedBy: "?")[0])
        try require(legacy.data.count == 262_145, "legacy full response compatibility")
        await client.disconnect()
        do {
            _ = try await client.officeRequest(path: meetingPath, method: "GET", body: nil, operation: operation, deadline: Date().addingTimeInterval(5))
            throw OfficeChatTransportFailure.expectedRejection
        } catch is CancellationError {}
        let bridge = ImportedSession(), imported = try makeTransport(bridge: bridge)
        OfficeURLProtocol.handler = { _, response in response.respond(sessionJSON) }
        let pinned = try await imported.beginOfficeOperation()
        await bridge.replace()
        var dispatched = false
        OfficeURLProtocol.handler = { _, _ in dispatched = true }
        do {
            _ = try await imported.officeRequest(path: meetingPath, method: "GET", body: nil, operation: pinned, deadline: Date().addingTimeInterval(5))
            throw OfficeChatTransportFailure.expectedRejection
        } catch is CancellationError {}
        try require(!dispatched, "imported authentication replacement fences next request")
        let publishing = HeldPublish(), publisher = try makeTransport(bridge: publishing)
        OfficeURLProtocol.handler = { _, response in response.respond(sessionJSON) }
        let publishToken = try await publisher.beginOfficeOperation()
        OfficeURLProtocol.handler = { _, response in
            response.respond(Data("{\"status\":\"ready\"}".utf8), headers: ["Set-Cookie": "com_moon_operator_session=synthetic.after; Path=/; Max-Age=3600; Secure; HttpOnly"])
        }
        let late = Task { try await publisher.officeRequest(path: meetingPath, method: "GET", body: nil,
            operation: publishToken, deadline: Date().addingTimeInterval(5)) }
        while !(await publishing.isPublishing) { await Task.yield() }
        await publisher.disconnect(); await publishing.release()
        do { _ = try await late.value; throw OfficeChatTransportFailure.expectedRejection } catch is CancellationError {}
        OfficeURLProtocol.handler = { _, response in response.respond(sessionJSON) }
        let cancelClient = try makeTransport(), cancelToken = try await cancelClient.beginOfficeOperation()
        let started = StartedSignal()
        OfficeURLProtocol.handler = { _, _ in started.mark() } // Deliberately never delivers headers.
        let waiting = Task { try await cancelClient.officeRequest(path: meetingPath, method: "GET", body: nil,
            operation: cancelToken, deadline: Date().addingTimeInterval(5)) }
        while !started.started { await Task.yield() }
        waiting.cancel()
        do { _ = try await waiting.value; throw OfficeChatTransportFailure.expectedRejection } catch is CancellationError {}
        print("Office native transport: bounded stream/header/legacy/auth fence/cancellation checks passed")
    }
}
private enum OfficeChatTransportFailure: Error { case expectedRejection }
