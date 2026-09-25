import Foundation
import Network

private final class TransportURLProtocol: URLProtocol {
    static var handler: ((URLRequest, TransportURLProtocol) throws -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do { try Self.handler?(request, self) }
        catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
    func respond(status: Int = 200, json: String, headers: [String: String] = [:]) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

struct HubTransportTests {

    private func transport(_ address: String = "https://hub.example.test") throws -> HubTransport {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        return try HubTransport(baseURL: URL(string: address)!, configuration: configuration)
    }

    func testOnlyHTTPSAndExactHTTPLoopbackOriginsAreAccepted() throws {
        for address in ["https://hub.example.test", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"] {
            expectNoThrow(try transport(address))
        }
        for address in ["http://hub.example.test", "http://127.1:3000", "http://127.0.0.1.example.test", "https://user:pass@hub.example.test", "https://hub.example.test/base", "https://hub.example.test?token=secret", "https://hub.example.test#fragment", "file:///tmp/hub"] {
            expectThrows(try transport(address)) { expectEqual($0 as? HubTransportError, .rejectedURL) }
        }
    }

    func testRequestCarriesOriginOnlyForWritesAndNeverServerCredentials() async throws {
        let client = try transport()
        var methods = [String]()
        TransportURLProtocol.handler = { request, protocolInstance in
            methods.append(request.httpMethod!)
            expectNil(request.value(forHTTPHeaderField: "Authorization"))
            expectNil(request.value(forHTTPHeaderField: "x-com-moon-hub-secret"))
            expectEqual(request.value(forHTTPHeaderField: "Origin"), request.httpMethod == "GET" ? nil : "https://hub.example.test")
            protocolInstance.respond(json: "{\"status\":\"ok\",\"source\":\"supabase\"}")
        }
        for method in ["GET", "POST", "PATCH", "DELETE"] {
            _ = try await client.request(path: "/api/hub/tasks?limit=20", method: method, body: method == "GET" ? nil : Data("{}".utf8))
        }
        expectEqual(methods, ["GET", "POST", "PATCH", "DELETE"])
    }

    func testRejectsAbsolutePathsAndCrossOriginTargetsBeforeRequest() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { _, _ in recordFailure("Rejected URLs must never reach the network") }
        for path in ["https://other.example.test/api/hub/tasks", "//other.example.test/api/hub/tasks", "/api/../login", "/api/hub/tasks#fragment", "/dashboard/work/my"] {
            do { _ = try await client.request(path: path); recordFailure("Expected rejected URL") }
            catch { expectEqual(error as? HubTransportError, .rejectedURL) }
        }
    }

    func testHTTP200ErrorEnvelopeIsNeverReturnedAsEmptySuccess() async throws {
        let client = try transport()
        for json in ["{\"status\":\"error\",\"tasks\":[]}", "{\"status\":\"ok\",\"source\":\"error\",\"items\":[]}"] {
            TransportURLProtocol.handler = { _, protocolInstance in protocolInstance.respond(json: json) }
            do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Expected envelope error") }
            catch { expectEqual(error as? HubTransportError, .server(statusCode: 200)) }
        }
    }

    func testPreviewRemainsExplicitAndDoesNotBecomeLive() async throws {
        let client = try transport()
        for json in ["{\"status\":\"preview\"}", "{\"status\":\"ok\",\"source\":\"preview\"}"] {
            TransportURLProtocol.handler = { _, protocolInstance in protocolInstance.respond(json: json) }
            let response = try await client.request(path: "/api/hub/tasks")
            expectTrue(response.isPreview)
            expectEqual(response.data, Data(json.utf8))
        }
    }

    func testAuthenticationAndConfigurationFailuresAreDistinct() async throws {
        let client = try transport()
        for (status, json, expected) in [(401, "{\"status\":\"unauthorized\"}", HubTransportError.unauthorized), (503, "{\"status\":\"not-configured\"}", .unconfigured), (500, "{\"status\":\"error\"}", .server(statusCode: 500))] {
            TransportURLProtocol.handler = { _, protocolInstance in protocolInstance.respond(status: status, json: json) }
            do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Expected request failure") }
            catch { expectEqual(error as? HubTransportError, expected) }
        }
    }

    func testConflictIsDistinctFromAnUncertainServerFailure() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { _, protocolInstance in
            protocolInstance.respond(status: 409, json: "{\"status\":\"conflict\",\"error\":\"revision-conflict\"}")
        }
        do { _ = try await client.request(path: "/api/hub/journal", method: "POST", body: Data("{}".utf8)); recordFailure("Conflict must fail") }
        catch { expectEqual(error as? HubTransportError, .conflict) }
    }

    func testCanonicalOriginIdentityIsStableAcrossEquivalentInputs() throws {
        for address in ["https://HUB.example.test:443/", "https://hub.example.test"] {
            expectEqual(try HubTransport.validatedBaseURL(URL(string: address)!).absoluteString, "https://hub.example.test")
        }
        expectEqual(try HubTransport.validatedBaseURL(URL(string: "http://LOCALHOST:80/")!).absoluteString, "http://localhost")
    }

    func testTimeoutAndOfflineAreMappedWithoutRetriedWrites() async throws {
        let client = try transport()
        for (code, expected) in [(URLError.Code.timedOut, HubTransportError.timeout), (.notConnectedToInternet, .offline)] {
            var count = 0
            TransportURLProtocol.handler = { _, _ in count += 1; throw URLError(code) }
            do { _ = try await client.request(path: "/api/hub/tasks", method: "POST", body: Data("{}".utf8)); recordFailure("Expected transport failure") }
            catch { expectEqual(error as? HubTransportError, expected) }
            expectEqual(count, 1)
        }
    }

    func testSessionStatusDoesNotTreatAnonymousAsAnError() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { request, protocolInstance in
            expectEqual(request.url?.path, "/api/operator/session")
            protocolInstance.respond(json: "{\"status\":\"anonymous\",\"configured\":true,\"reason\":\"missing-cookie\"}")
        }
        let session = try await client.sessionStatus()
        expectFalse(session.isAuthenticated)
        expectTrue(session.configured)
        expectEqual(session.reason, "missing-cookie")
    }

    func testLoginRequiresAuthenticatedEnvelopeAndCookiesStayPrivate() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { request, protocolInstance in
            expectEqual(request.httpMethod, "POST")
            expectEqual(request.url?.path, "/api/operator/session")
            expectEqual(request.value(forHTTPHeaderField: "Origin"), "https://hub.example.test")
            protocolInstance.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=test-session; Path=/; HttpOnly; Secure; SameSite=Lax"])
        }
        try await client.login(username: "test-operator", password: "test-password")
        TransportURLProtocol.handler = { request, protocolInstance in
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=test-session")
            protocolInstance.respond(json: "{\"status\":\"ok\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
        let otherClient = try transport()
        TransportURLProtocol.handler = { request, protocolInstance in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            protocolInstance.respond(json: "{\"status\":\"ok\"}")
        }
        _ = try await otherClient.request(path: "/api/hub/tasks")
        await client.clearSession()
        _ = try await client.request(path: "/api/hub/tasks")
    }

    func testRedirectResponsesAreRejectedInsteadOfFollowingLocation() async throws {
        let client = try transport()
        var requests = 0
        TransportURLProtocol.handler = { _, protocolInstance in
            requests += 1
            protocolInstance.respond(status: 307, json: "{}", headers: ["Location": "https://other.example.test/receive"])
        }
        do { try await client.login(username: "test-operator", password: "test-password"); recordFailure("Redirect must fail") }
        catch { expectEqual(error as? HubTransportError, .redirectRejected) }
        expectEqual(requests, 1)
    }

    func testRedirectDelegateRefusesToReplayLoginToAnotherOrigin() async throws {
        // Foundation traps when custom URLProtocol emits redirect callbacks on
        // this CLT runtime. Local listeners exercise the real URLSession delegate.
        let destination = try RedirectProbeServer(response: "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        let destinationPort = try await destination.start()
        defer { destination.stop() }
        let source = try RedirectProbeServer(response: "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://127.0.0.1:\(destinationPort)/receive\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        let sourcePort = try await source.start()
        defer { source.stop() }
        let client = try HubTransport(baseURL: URL(string: "http://127.0.0.1:\(sourcePort)")!)
        do { try await client.login(username: "test-operator", password: "test-password"); recordFailure("Redirect must fail") }
        catch { expectEqual(error as? HubTransportError, .redirectRejected) }
        expectEqual(source.requestCount, 1)
        expectEqual(destination.requestCount, 0)
    }

    func testMalformedAndUnauthenticatedSuccessEnvelopesAreRejected() async throws {
        let client = try transport()
        for json in ["<html>Login</html>", "[]", "{\"status\":\"ok\"}", "{\"status\":\"authenticated\",\"source\":\"preview\"}"] {
            TransportURLProtocol.handler = { _, protocolInstance in protocolInstance.respond(json: json) }
            do { try await client.login(username: "test-operator", password: "test-password"); recordFailure("A login must explicitly authenticate") }
            catch { expectEqual(error as? HubTransportError, .invalidResponse) }
        }
    }

    func testLogoutClearsPrivateCookiesEvenWhenServerIsOffline() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { _, protocolInstance in
            protocolInstance.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=test-session; Path=/; HttpOnly; Secure"])
        }
        try await client.login(username: "test-operator", password: "test-password")
        TransportURLProtocol.handler = { _, _ in throw URLError(.notConnectedToInternet) }
        do { try await client.logout(); recordFailure("Expected offline logout") }
        catch { expectEqual(error as? HubTransportError, .offline) }
        TransportURLProtocol.handler = { request, protocolInstance in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            protocolInstance.respond(json: "{\"status\":\"ok\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
    }
}

private final class RedirectProbeServer: @unchecked Sendable {
    private let listener: NWListener
    private let response: Data
    private let queue = DispatchQueue(label: "moonlight.transport.redirect-check")
    private let lock = NSLock()
    private var received = 0
    var requestCount: Int { lock.lock(); defer { lock.unlock() }; return received }

    init(response: String) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        self.response = Data(response.utf8)
    }

    func start() async throws -> UInt16 {
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            connection.start(queue: self.queue)
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] _, _, _, _ in
                guard let self else { connection.cancel(); return }
                self.lock.lock(); self.received += 1; self.lock.unlock()
                connection.send(content: self.response, completion: .contentProcessed { _ in connection.cancel() })
            }
        }
        return try await withCheckedThrowingContinuation { continuation in
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    self.listener.stateUpdateHandler = nil
                    continuation.resume(returning: self.listener.port!.rawValue)
                case .failed(let error):
                    self.listener.stateUpdateHandler = nil
                    continuation.resume(throwing: error)
                default: break
                }
            }
            listener.start(queue: queue)
        }
    }

    func stop() { listener.cancel() }
}

private final class TestFailures: @unchecked Sendable {
    private let lock = NSLock()
    private var messages = [String]()
    func add(_ message: String) { lock.lock(); defer { lock.unlock() }; messages.append(message) }
    var all: [String] { lock.lock(); defer { lock.unlock() }; return messages }
}
private let testFailures = TestFailures()
private func recordFailure(_ message: String, file: StaticString = #fileID, line: UInt = #line) {
    testFailures.add("\(file):\(line): \(message)")
}
private func expectEqual<T: Equatable>(_ actual: T, _ expected: T, file: StaticString = #fileID, line: UInt = #line) {
    if actual != expected { recordFailure("Expected \(expected), got \(actual)", file: file, line: line) }
}
private func expectNil<T>(_ actual: T?, file: StaticString = #fileID, line: UInt = #line) {
    if actual != nil { recordFailure("Expected nil", file: file, line: line) }
}
private func expectTrue(_ actual: Bool, file: StaticString = #fileID, line: UInt = #line) {
    if !actual { recordFailure("Expected true", file: file, line: line) }
}
private func expectFalse(_ actual: Bool, file: StaticString = #fileID, line: UInt = #line) {
    if actual { recordFailure("Expected false", file: file, line: line) }
}
private func expectNoThrow<T>(_ expression: @autoclosure () throws -> T, file: StaticString = #fileID, line: UInt = #line) {
    do { _ = try expression() } catch { recordFailure("Unexpected error: \(error)", file: file, line: line) }
}
private func expectThrows<T>(_ expression: @autoclosure () throws -> T, file: StaticString = #fileID, line: UInt = #line, check: (Error) -> Void) {
    do { _ = try expression(); recordFailure("Expected an error", file: file, line: line) } catch { check(error) }
}

@main
private struct HubTransportTestRunner {
    static func main() async {
        let tests = HubTransportTests()
        let cases: [(String, () async throws -> Void)] = [
            ("origin validation", { try tests.testOnlyHTTPSAndExactHTTPLoopbackOriginsAreAccepted() }),
            ("write headers", tests.testRequestCarriesOriginOnlyForWritesAndNeverServerCredentials),
            ("path isolation", tests.testRejectsAbsolutePathsAndCrossOriginTargetsBeforeRequest),
            ("error envelopes", tests.testHTTP200ErrorEnvelopeIsNeverReturnedAsEmptySuccess),
            ("preview provenance", tests.testPreviewRemainsExplicitAndDoesNotBecomeLive),
            ("authentication errors", tests.testAuthenticationAndConfigurationFailuresAreDistinct),
            ("conflict classification", tests.testConflictIsDistinctFromAnUncertainServerFailure),
            ("stable origin identity", { try tests.testCanonicalOriginIdentityIsStableAcrossEquivalentInputs() }),
            ("network failure without replay", tests.testTimeoutAndOfflineAreMappedWithoutRetriedWrites),
            ("session status", tests.testSessionStatusDoesNotTreatAnonymousAsAnError),
            ("private session cookies", tests.testLoginRequiresAuthenticatedEnvelopeAndCookiesStayPrivate),
            ("redirect rejection", tests.testRedirectResponsesAreRejectedInsteadOfFollowingLocation),
            ("redirect delegate", tests.testRedirectDelegateRefusesToReplayLoginToAnotherOrigin),
            ("malformed authentication responses", tests.testMalformedAndUnauthenticatedSuccessEnvelopesAreRejected),
            ("offline logout clears session", tests.testLogoutClearsPrivateCookiesEvenWhenServerIsOffline),
        ]
        for (name, test) in cases {
            let previousFailures = testFailures.all.count
            do { try await test() } catch { recordFailure("\(name): unexpected \(error)") }
            print("\(testFailures.all.count == previousFailures ? "PASS" : "FAIL") \(name)")
            TransportURLProtocol.handler = nil
        }
        for failure in testFailures.all { print(failure) }
        print("\(cases.count) transport checks; \(testFailures.all.count) failures")
        if !testFailures.all.isEmpty { exit(1) }
    }
}
