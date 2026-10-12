import Foundation
import Network

private final class MemoryHubCredentials: HubCredentialStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String: HubCredentials] = [:]
    func load(origin: String) throws -> HubCredentials? { lock.lock(); defer { lock.unlock() }; return items[origin] }
    func save(_ credentials: HubCredentials, origin: String) throws { lock.lock(); defer { lock.unlock() }; items[origin] = credentials }
    func remove(origin: String) throws { lock.lock(); defer { lock.unlock() }; items[origin] = nil }
}

private func transportBody(_ request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open(); defer { stream.close() }
    var result = Data(), bytes = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
        let count = stream.read(&bytes, maxLength: bytes.count)
        guard count > 0 else { break }
        result.append(contentsOf: bytes.prefix(count))
    }
    return result
}

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

    func testDesktopSessionImportsLoginAndExplicitSignOutWithoutReauthenticating() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "test-password"), origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = MemoryDesktopSession()
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge)
        let saved = HubSavedSession(value: "desktop.signature", expiresAt: Date().timeIntervalSince1970 + 86400)
        await bridge.set(HubDesktopSession(origin: origin, session: saved))
        TransportURLProtocol.handler = { request, response in
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=desktop.signature")
            response.respond(json: "{\"status\":\"live\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
        await bridge.set(nil)
        _ = try await client.request(path: "/api/hub/tasks")
        await bridge.set(HubDesktopSession(origin: "https://other.example.test", session: nil, signedOut: true))
        _ = try await client.request(path: "/api/hub/tasks")
        await bridge.set(HubDesktopSession(origin: origin, session: nil, signedOut: true))
        TransportURLProtocol.handler = { request, response in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            expectEqual(request.url?.path, "/api/hub/tasks") // Never POST saved credentials after explicit shell logout.
            response.respond(status: 401, json: "{\"status\":\"unauthorized\"}")
        }
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Signed-out shell must require login") }
        catch { expectEqual(error as? HubTransportError, .unauthorized) }
        expectNil(try store.load(origin: origin))
        TransportURLProtocol.handler = { _, response in
            response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=native.signature; Path=/; Max-Age=2592000; Secure; HttpOnly"])
        }
        try await client.login(username: "operator", password: "test-password")
        let exported = await bridge.read(origin: origin)
        expectEqual(exported?.session?.value, "native.signature")
        try await client.clearSession()
        let cleared = await bridge.read(origin: origin)
        expectNil(cleared?.session)
    }

    func testDesktopNaturalExpiryKeepsKeychainAutoLogin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "test-password"), origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = MemoryDesktopSession()
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge)
        await bridge.set(HubDesktopSession(origin: origin, session: nil, signedOut: false))
        var logins = 0
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" && request.url?.path == "/api/operator/session" {
                logins += 1
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=renewed.signature; Path=/; Max-Age=2592000; Secure; HttpOnly"])
            } else if request.value(forHTTPHeaderField: "Cookie") == "com_moon_operator_session=renewed.signature" {
                response.respond(json: "{\"status\":\"live\"}")
            } else { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
        }
        _ = try await client.request(path: "/api/hub/tasks")
        expectEqual(logins, 1)
        expectTrue(try store.load(origin: origin) != nil)
    }

    func testRestartRestoresLoginOnlyForTheSavedOrigin() async throws {
        let store = MemoryHubCredentials()
        let first = try transport(store: store)
        TransportURLProtocol.handler = { _, response in
            response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=first; Path=/; HttpOnly; Secure"])
        }
        try await first.login(username: "test-operator", password: "test-password")
        let reopened = try transport("https://HUB.example.test:443/", store: store)
        var logins = 0
        TransportURLProtocol.handler = { request, response in
            if request.url!.path == "/api/operator/session" {
                logins += 1
                expectEqual(request.url!.host, "hub.example.test")
                let credentials = try JSONDecoder().decode(HubCredentials.self, from: transportBody(request)!)
                expectEqual(credentials, HubCredentials(username: "test-operator", password: "test-password"))
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=restored; Path=/; HttpOnly; Secure"])
            } else if request.value(forHTTPHeaderField: "Cookie") == "com_moon_operator_session=restored" {
                response.respond(json: "{\"status\":\"live\"}")
            } else { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
        }
        expectEqual(try await reopened.request(path: "/api/hub/tasks").status, "live")
        let other = try transport("https://other.example.test", store: store)
        do { _ = try await other.request(path: "/api/hub/tasks"); recordFailure("Another origin must require its own login") }
        catch { expectEqual(error as? HubTransportError, .unauthorized) }
        expectEqual(logins, 1)
    }

    func testRejectedLoginNeverReplacesAcceptedCredentialsOrLoops() async throws {
        let store = MemoryHubCredentials()
        let saved = HubCredentials(username: "accepted", password: "test-only")
        try store.save(saved, origin: "https://hub.example.test")
        let client = try transport(store: store)
        var logins = 0
        TransportURLProtocol.handler = { request, response in
            if request.url!.path == "/api/operator/session" { logins += 1 }
            response.respond(status: 401, json: "{\"status\":\"unauthorized\"}")
        }
        do { try await client.login(username: "incorrect", password: "wrong"); recordFailure("Rejected credentials must fail") }
        catch { expectEqual(error as? HubTransportError, .unauthorized) }
        expectEqual(try store.load(origin: "https://hub.example.test"), saved)
        for _ in 0..<2 {
            do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Expired saved credentials must fail") }
            catch { expectEqual(error as? HubTransportError, .unauthorized) }
        }
        expectEqual(logins, 2) // one manual login, one automatic attempt
    }

    func testUncertainWritesAndModelGenerationAreNeverAutomaticallyReplayed() async throws {
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "accepted", password: "test-only"), origin: "https://hub.example.test")
        let client = try transport(store: store)
        for path in ["/api/hub/journal", "/api/hub/office/chat"] {
            for code in [URLError.Code.timedOut, .userAuthenticationRequired] {
                var count = 0
                TransportURLProtocol.handler = { _, _ in count += 1; throw URLError(code) }
                do { _ = try await client.request(path: path, method: "POST", body: Data("{}".utf8)); recordFailure("Network error must fail") }
                catch {}
                expectEqual(count, 1)
            }
        }
        var count = 0
        TransportURLProtocol.handler = { _, response in count += 1; response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
        do { _ = try await client.request(path: "/api/hub/office/chat", method: "POST", body: Data("{}".utf8)); recordFailure("Model call must not replay") }
        catch { expectEqual(error as? HubTransportError, .unauthorized) }
        expectEqual(count, 1)
    }

    func testLateResponseCannotRestoreCookiesAfterSignOut() async throws {
        let client = try transport()
        let gate = HeldResponseGate()
        TransportURLProtocol.handler = { _, response in gate.hold(response) }
        let pending = Task { try await client.request(path: "/api/hub/tasks") }
        while !gate.started { await Task.yield() }
        try await client.clearSession()
        gate.release()
        do { _ = try await pending.value; recordFailure("A pre-logout response must be discarded") }
        catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
        TransportURLProtocol.handler = { request, response in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            response.respond(json: "{\"status\":\"live\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
    }

    func testDisconnectCancelsAuthenticationButKeepsAcceptedCredentials() async throws {
        for forget in [false, true] {
            let store = MemoryHubCredentials()
            try store.save(HubCredentials(username: "accepted", password: "test-only"), origin: "https://hub.example.test")
            let client = try transport(store: store)
            let gate = HeldLoginGate()
            TransportURLProtocol.handler = { request, response in gate.handle(request, response) }
            let pending = Task { try await client.request(path: "/api/hub/journal", method: "POST", body: Data("{}".utf8)) }
            while !gate.started { await Task.yield() }
            if forget { try await client.clearSession() } else { await client.disconnect() }
            do { _ = try await pending.value; recordFailure("Disconnected automatic login must not replay the memo") }
            catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
            expectEqual(gate.memoRequests, 1)
            expectEqual(try store.load(origin: "https://hub.example.test") == nil, forget)
            TransportURLProtocol.handler = { request, response in
                expectNil(request.value(forHTTPHeaderField: "Cookie"))
                response.respond(status: 401, json: "{\"status\":\"unauthorized\"}")
            }
            do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Disconnected transport must stay anonymous") }
            catch { expectEqual(error as? HubTransportError, .unauthorized) }
        }
    }

    func testSimultaneousReadsShareOneAutomaticLogin() async throws {
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "accepted", password: "test-only"), origin: "https://hub.example.test")
        let client = try transport(store: store)
        let gate = AutomaticLoginGate()
        TransportURLProtocol.handler = { request, response in gate.handle(request, response) }
        async let tasks = client.request(path: "/api/hub/tasks")
        async let calendar = client.request(path: "/api/calendar/google/event")
        let results = try await (tasks, calendar)
        expectEqual(results.0.status, "live")
        expectEqual(results.1.status, "live")
        expectEqual(gate.loginCount, 1)
    }

    func testExpiredSessionAuthenticatesOnceAndReplaysIdenticalMemoCommand() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { _, response in
            response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=old; Path=/; HttpOnly; Secure"])
        }
        try await client.login(username: "test-operator", password: "test-password")
        let body = Data("{\"requestId\":\"stable-request\",\"body\":\"보존할 메모\"}".utf8)
        var paths = [String]()
        TransportURLProtocol.handler = { request, response in
            paths.append(request.url!.path)
            if request.url!.path == "/api/operator/session" {
                expectEqual(request.value(forHTTPHeaderField: "Origin"), "https://hub.example.test")
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=new; Path=/; HttpOnly; Secure"])
            } else {
                expectEqual(transportBody(request), body)
                if paths.count == 1 { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
                else {
                    expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=new")
                    response.respond(json: "{\"status\":\"saved\"}")
                }
            }
        }
        let result = try await client.request(path: "/api/hub/journal", method: "POST", body: body)
        expectEqual(result.status, "saved")
        expectEqual(paths, ["/api/hub/journal", "/api/operator/session", "/api/hub/journal"])
    }

    private func transport(_ address: String = "https://hub.example.test", store: any HubCredentialStoring = MemoryHubCredentials()) throws -> HubTransport {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        return try HubTransport(baseURL: URL(string: address)!, configuration: configuration, credentialStore: store)
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

    func testOnlyExactOfficeChatPOSTReceivesLongerTimeouts() async throws {
        let client = try transport()
        let routes: [(String, String, TimeInterval, TimeInterval)] = [
            ("/api/hub/office/chat", "POST", 60, 70),
            ("/api/hub/office/meetings/11111111-1111-4111-8111-111111111111/turns", "POST", 60, 70),
            ("/api/hub/office/meetings/11111111-1111-4111-8111-111111111111/turns", "GET", 20, 45),
            ("/api/hub/office/meetings/not-a-meeting/turns", "POST", 20, 45),
            ("/api/hub/office/chat", "post", 60, 70),
            ("/api/hub/office/chat", "GET", 20, 45),
            ("/api/hub/office/chat", "PATCH", 20, 45),
            ("/api/hub/office/chat?scope=personal", "POST", 20, 45),
            ("/api/hub/office/chat?", "POST", 20, 45),
            ("/api/hub/office/chat/", "POST", 20, 45),
            ("/api/hub/office/chat-extra", "POST", 20, 45),
            ("/api/hub/office/ch%61t", "POST", 20, 45),
            ("/api/hub/office/assignment", "POST", 20, 45),
            ("/api/hub/tasks", "POST", 20, 45),
        ]
        for (path, method, requestLimit, resourceLimit) in routes {
            let intervals = await client.timeoutIntervals(path: path, method: method)
            expectEqual(intervals.request, requestLimit)
            expectEqual(intervals.resource, resourceLimit)
            TransportURLProtocol.handler = { request, protocolInstance in
                expectEqual(request.timeoutInterval, requestLimit)
                protocolInstance.respond(json: "{\"status\":\"ok\"}")
            }
            _ = try await client.request(path: path, method: method, body: method == "GET" ? nil : Data("{}".utf8))
        }
    }

    func testOfficeChatSharesOnlyItsClientsPrivateAuthentication() async throws {
        let client = try transport()
        TransportURLProtocol.handler = { _, protocolInstance in
            protocolInstance.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=test-session; Path=/; HttpOnly; Secure"])
        }
        try await client.login(username: "test-operator", password: "test-password")
        TransportURLProtocol.handler = { request, protocolInstance in
            expectEqual(request.timeoutInterval, 60)
            expectEqual(request.value(forHTTPHeaderField: "Origin"), "https://hub.example.test")
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=test-session")
            expectNil(request.value(forHTTPHeaderField: "Authorization"))
            expectNil(request.value(forHTTPHeaderField: "x-com-moon-hub-secret"))
            protocolInstance.respond(json: "{\"status\":\"generated\"}", headers: ["Set-Cookie": "com_moon_operator_session=updated-session; Path=/; HttpOnly; Secure"])
        }
        _ = try await client.request(path: "/api/hub/office/chat", method: "POST", body: Data("{}".utf8))
        TransportURLProtocol.handler = { request, protocolInstance in
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=updated-session")
            protocolInstance.respond(json: "{\"status\":\"ok\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
        try await client.clearSession()
        let otherClient = try transport()
        TransportURLProtocol.handler = { request, protocolInstance in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            protocolInstance.respond(status: 401, json: "{\"status\":\"unauthorized\"}")
        }
        for instance in [client, otherClient] {
            do { _ = try await instance.request(path: "/api/hub/office/chat", method: "POST", body: Data("{}".utf8)); recordFailure("Expected authentication failure") }
            catch { expectEqual(error as? HubTransportError, .unauthorized) }
        }
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
        for path in ["/api/hub/tasks", "/api/hub/office/chat"] {
            for (code, expected) in [(URLError.Code.timedOut, HubTransportError.timeout), (.notConnectedToInternet, .offline)] {
                var count = 0
                TransportURLProtocol.handler = { _, _ in count += 1; throw URLError(code) }
                do { _ = try await client.request(path: path, method: "POST", body: Data("{}".utf8)); recordFailure("Expected transport failure") }
                catch { expectEqual(error as? HubTransportError, expected) }
                expectEqual(count, 1)
            }
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
        try await client.clearSession()
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
        do { _ = try await client.request(path: "/api/hub/office/chat", method: "POST", body: Data("{}".utf8)); recordFailure("Office redirect must fail") }
        catch { expectEqual(error as? HubTransportError, .redirectRejected) }
        expectEqual(source.requestCount, 2)
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
        let store = MemoryHubCredentials()
        let client = try transport(store: store)
        TransportURLProtocol.handler = { _, protocolInstance in
            protocolInstance.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=test-session; Path=/; HttpOnly; Secure"])
        }
        try await client.login(username: "test-operator", password: "test-password")
        TransportURLProtocol.handler = { _, _ in throw URLError(.notConnectedToInternet) }
        do { try await client.logout(); recordFailure("Expected offline logout") }
        catch { expectEqual(error as? HubTransportError, .offline) }
        expectNil(try store.load(origin: "https://hub.example.test"))
        TransportURLProtocol.handler = { request, protocolInstance in
            expectNil(request.value(forHTTPHeaderField: "Cookie"))
            protocolInstance.respond(json: "{\"status\":\"ok\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
        _ = try await transport(store: store).request(path: "/api/hub/tasks")
    }
}

private final class HeldResponseGate: @unchecked Sendable {
    private let lock = NSLock()
    private var response: TransportURLProtocol?
    var started: Bool { lock.lock(); defer { lock.unlock() }; return response != nil }
    func hold(_ response: TransportURLProtocol) { lock.lock(); self.response = response; lock.unlock() }
    func release() {
        lock.lock(); let response = self.response; self.response = nil; lock.unlock()
        response?.respond(json: "{\"status\":\"live\"}", headers: ["Set-Cookie": "com_moon_operator_session=stale; Path=/; HttpOnly; Secure"])
    }
}

private final class HeldLoginGate: @unchecked Sendable {
    private let lock = NSLock()
    private var login: TransportURLProtocol?
    private var memos = 0
    var started: Bool { lock.lock(); defer { lock.unlock() }; return login != nil }
    var memoRequests: Int { lock.lock(); defer { lock.unlock() }; return memos }
    func handle(_ request: URLRequest, _ response: TransportURLProtocol) {
        lock.lock()
        let isLogin = request.url!.path == "/api/operator/session"
        if isLogin { login = response } else { memos += 1 }
        lock.unlock()
        if !isLogin { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
    }
}

private final class AutomaticLoginGate: @unchecked Sendable {
    private let lock = NSLock()
    private var rejectedReads = 0
    private var logins = 0
    private var waitingLogin: TransportURLProtocol?
    var loginCount: Int { lock.lock(); defer { lock.unlock() }; return logins }
    func handle(_ request: URLRequest, _ response: TransportURLProtocol) {
        if request.value(forHTTPHeaderField: "Cookie") == "com_moon_operator_session=restored" {
            response.respond(json: "{\"status\":\"live\"}"); return
        }
        lock.lock()
        let isLogin = request.url!.path == "/api/operator/session"
        if isLogin { logins += 1; waitingLogin = response }
        else { rejectedReads += 1 }
        let ready = rejectedReads == 2 ? waitingLogin : nil
        if ready != nil { waitingLogin = nil }
        lock.unlock()
        if !isLogin { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
        ready?.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=restored; Path=/; HttpOnly; Secure"])
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

private actor MemoryDesktopSession: HubDesktopSessionSharing {
    private var snapshot: HubDesktopSession?
    func set(_ value: HubDesktopSession?) { snapshot = value }
    func read(origin: String) -> HubDesktopSession? { snapshot }
    func write(_ session: HubSavedSession?, origin: String) { snapshot = HubDesktopSession(origin: origin, session: session, signedOut: session == nil) }
}
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
            ("desktop login import and sign-out without reauthentication", tests.testDesktopSessionImportsLoginAndExplicitSignOutWithoutReauthenticating),
            ("desktop natural expiry preserves Keychain auto login", tests.testDesktopNaturalExpiryKeepsKeychainAutoLogin),
            ("restart restores only the saved origin", tests.testRestartRestoresLoginOnlyForTheSavedOrigin),
            ("rejected credentials are neither saved nor retried forever", tests.testRejectedLoginNeverReplacesAcceptedCredentialsOrLoops),
            ("uncertain writes and model generation never replay", tests.testUncertainWritesAndModelGenerationAreNeverAutomaticallyReplayed),
            ("late responses cannot restore logout cookies", tests.testLateResponseCannotRestoreCookiesAfterSignOut),
            ("disconnect cancels authentication without losing origin credentials", tests.testDisconnectCancelsAuthenticationButKeepsAcceptedCredentials),
            ("concurrent reads share automatic login", tests.testSimultaneousReadsShareOneAutomaticLogin),
            ("expired session renews without changing memo", tests.testExpiredSessionAuthenticatesOnceAndReplaysIdenticalMemoCommand),
            ("origin validation", { try tests.testOnlyHTTPSAndExactHTTPLoopbackOriginsAreAccepted() }),
            ("write headers", tests.testRequestCarriesOriginOnlyForWritesAndNeverServerCredentials),
            ("exact Office chat timeout budget", tests.testOnlyExactOfficeChatPOSTReceivesLongerTimeouts),
            ("Office chat shared private authentication", tests.testOfficeChatSharesOnlyItsClientsPrivateAuthentication),
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
