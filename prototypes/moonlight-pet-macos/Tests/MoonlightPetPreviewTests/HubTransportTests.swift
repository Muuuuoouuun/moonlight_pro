import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(Network)
import Network
#endif

private final class MemoryHubCredentials: HubCredentialStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [String: HubCredentials] = [:]
    private var loads = 0
    var loadCount: Int { lock.lock(); defer { lock.unlock() }; return loads }
    func load(origin: String) throws -> HubCredentials? { lock.lock(); defer { lock.unlock() }; loads += 1; return items[origin] }
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

    func testPeerCapabilityRequiresExactVersionAndFlag() throws {
        let origin = "https://hub.example.test"
        let old = HubDesktopSession(origin: origin, session: nil, signedOut: false)
        expectEqual(HubDesktopPeer.classify(nil, origin: origin), .unavailable)
        expectEqual(HubDesktopPeer.classify(old, origin: origin), .unsupported)
        expectEqual(HubDesktopPeer.classify(verifiedSnapshot(old), origin: origin), .verified)
        expectEqual(HubDesktopPeer.classify(verifiedSnapshot(old), origin: "https://other.example.test"), .unavailable)
        for version in [nil, 1, 3] as [Int?] {
            var candidate = verifiedSnapshot(old); candidate.protocolVersion = version
            expectEqual(HubDesktopPeer.classify(candidate, origin: origin), .unsupported)
        }
        var candidate = verifiedSnapshot(old); candidate.capabilities = HubDesktopCapabilities(logoutIntent: false)
        expectEqual(HubDesktopPeer.classify(candidate, origin: origin), .unsupported)
        candidate.capabilities = nil
        expectEqual(HubDesktopPeer.classify(candidate, origin: origin), .unsupported)
    }

    func testUnsupportedPeerHoldsAutomaticRestoreButPreservesManualStandaloneLogin() async throws {
        let origin = "https://hub.example.test"
        for old in [HubDesktopSession(origin: origin, session: nil, signedOut: false),
                    HubDesktopSession(origin: origin, session: nil, signedOut: true),
                    HubDesktopSession(origin: origin, session: HubSavedSession(value: "old.signature", expiresAt: 4102444800))] {
            let store = MemoryHubCredentials()
            try store.save(HubCredentials(username: "operator", password: "old-synthetic"), origin: origin)
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [TransportURLProtocol.self]
            let bridge = PeerFixtureDesktopSession(old)
            let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
                credentialStore: store, desktopSession: bridge, sharedSession: { nil })
            var posts = 0, requests = 0
            TransportURLProtocol.handler = { request, response in
                requests += 1
                if request.httpMethod == "POST" {
                    posts += 1
                    response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=manual.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
                } else {
                    expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=manual.signature")
                    response.respond(json: "{\"status\":\"live\"}", headers: ["Set-Cookie": "com_moon_operator_session=rotated.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
                }
            }
            do { _ = try await client.sessionStatus(); recordFailure("Legacy peer cannot verify restore") }
            catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
            expectEqual(store.loadCount, 0); expectEqual(requests, 0)
            try await client.login(username: "operator", password: "new-synthetic")
            _ = try await client.request(path: "/api/hub/tasks")
            expectEqual(posts, 1)
            expectEqual(try store.load(origin: origin)?.password, "new-synthetic")
            expectEqual(await bridge.begins, 0); expectEqual(await bridge.writes, 0)
            do { try await client.clearSession(); recordFailure("Legacy logout cannot claim durable completion") }
            catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
            expectEqual(await bridge.logouts, 0)
            expectEqual(try store.load(origin: origin)?.password, "new-synthetic")
            do { try await client.logout(); recordFailure("Legacy logout cannot mutate an unverified peer") }
            catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
            expectEqual(await bridge.logouts, 0)
            expectEqual(posts, 1)
        }
    }

    func testVerifiedPeerCannotDowngradeDuringExplicitBegin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials(), bridge = PeerFixtureDesktopSession(verifiedSnapshot(HubDesktopSession(origin: origin, session: nil)))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
            credentialStore: store, desktopSession: bridge, sharedSession: { nil })
        var requests = 0
        TransportURLProtocol.handler = { _, response in requests += 1; response.respond(json: "{\"status\":\"authenticated\"}") }
        do { try await client.login(username: "operator", password: "synthetic"); recordFailure("Unverified begin must fail") }
        catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
        expectEqual(await bridge.begins, 1); expectEqual(requests, 0); expectEqual(store.loadCount, 0)
    }

    func testVerifiedPairedSessionIsFencedOnlyOnKnownDowngrade() async throws {
        let origin = "https://hub.example.test", store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "preserved-synthetic"), origin: origin)
        let paired = verifiedSnapshot(HubDesktopSession(origin: origin,
            session: HubSavedSession(value: "paired.signature", expiresAt: 4102444800)))
        let bridge = PeerFixtureDesktopSession(paired)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
            credentialStore: store, desktopSession: bridge, sharedSession: { nil })
        var requests = 0
        TransportURLProtocol.handler = { request, response in
            requests += 1
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=paired.signature")
            response.respond(json: "{\"status\":\"live\"}")
        }
        _ = try await client.request(path: "/api/hub/tasks")
        await bridge.set(nil) // Temporary absence keeps an already accepted session.
        _ = try await client.request(path: "/api/hub/tasks")
        expectEqual(requests, 2)
        await bridge.set(HubDesktopSession(origin: origin, session: paired.session))
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Known downgrade must fence paired cookie") }
        catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
        expectEqual(requests, 2); expectEqual(store.loadCount, 0)
        expectEqual(try store.load(origin: origin)?.password, "preserved-synthetic")
        expectEqual(await bridge.writes, 0); expectEqual(await bridge.logouts, 0)
    }

    func testAutomaticRestoreRequiresVerifiedPublicationAcknowledgement() async throws {
        let origin = "https://hub.example.test"
        let failures: [HubDesktopSession?] = [nil,
            HubDesktopSession(origin: origin, session: nil),
            verifiedSnapshot(HubDesktopSession(origin: origin, session: nil, signedOut: true, automaticLoginBlocked: true)),
            verifiedSnapshot(HubDesktopSession(origin: origin, session: HubSavedSession(value: "other.signature", expiresAt: 4102444800), signedOut: false))]
        for rejected in failures {
            let store = MemoryHubCredentials()
            try store.save(HubCredentials(username: "operator", password: "synthetic"), origin: origin)
            let gate = HeldSessionRead(rejected)
            let bridge = PeerFixtureDesktopSession(verifiedSnapshot(HubDesktopSession(origin: origin, session: nil, signedOut: false)), publicationGate: gate)
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [TransportURLProtocol.self]
            let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
                credentialStore: store, desktopSession: bridge, sharedSession: { nil })
            var posts = 0, reads = 0
            TransportURLProtocol.handler = { request, response in
                if request.httpMethod == "POST" {
                    posts += 1
                    response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=automatic.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
                } else {
                    reads += 1
                    expectNil(request.value(forHTTPHeaderField: "Cookie"))
                    response.respond(json: "{\"status\":\"anonymous\",\"configured\":true}")
                }
            }
            let restoring = Task { try await client.sessionStatus() }
            while !(await gate.started) { await Task.yield() }
            await gate.release() // A logout, downgrade, lost reply or different session wins.
            do { _ = try await restoring.value; recordFailure("Unconfirmed publication cannot accept automatic restore") }
            catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
            expectEqual(posts, 1); expectEqual(reads, 1)
            expectEqual(try store.load(origin: origin)?.password, "synthetic")
            _ = try await client.request(path: "/api/hub/tasks") // The rejected private cookie was cleared.
            expectEqual(posts, 1); expectEqual(reads, 2)
        }
    }

    func testVerifiedPeerAcceptsAutomaticPublication() async throws {
        let origin = "https://hub.example.test", store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "synthetic"), origin: origin)
        let bridge = PeerFixtureDesktopSession(verifiedSnapshot(HubDesktopSession(origin: origin, session: nil, signedOut: false)))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
            credentialStore: store, desktopSession: bridge, sharedSession: { nil })
        var posts = 0
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" {
                posts += 1
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=automatic.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
            } else {
                let status = request.value(forHTTPHeaderField: "Cookie") == nil ? "anonymous" : "authenticated"
                response.respond(json: "{\"status\":\"\(status)\",\"configured\":true}")
            }
        }
        let status = try await client.sessionStatus()
        expectTrue(status.isAuthenticated)
        expectEqual(posts, 1)
        expectEqual(try store.load(origin: origin)?.password, "synthetic")
    }

    func testDesktopSessionImportsLoginAndExplicitSignOutWithoutReauthenticating() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "test-password"), origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = MemoryDesktopSession()
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge, sharedSession: { nil })
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

    func testDurableDesktopLogoutPreservesCredentialsAndUnavailableBridgeAllowsManualLogin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        let credentials = HubCredentials(username: "operator", password: "synthetic-password")
        try store.save(credentials, origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = MemoryIntentDesktopSession()
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge, sharedSession: { nil })
        let intent = HubDesktopLogoutIntent(id: "synthetic-intent", installationId: "synthetic-installation", accountScope: "unknown/currentconnection",
            persistence: "persisted", localSession: "cleared", companion: "unconfirmed", ownedKeychain: "not-requested", remoteSession: "not-requested")
        await bridge.set(HubDesktopSession(origin: origin, session: nil, signedOut: true, automaticLoginBlocked: true, logoutIntent: intent))
        var posts = 0
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" { posts += 1 }
            response.respond(status: 401, json: "{\"status\":\"unauthorized\"}")
        }
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Expected signed out") } catch {}
        expectEqual(posts, 0)
        expectTrue(try store.load(origin: origin) != nil)
        await bridge.set(nil)
        let restarted = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge, sharedSession: { nil })
        do { _ = try await restarted.sessionStatus(); recordFailure("Expected unconfirmed bridge") }
        catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
        expectEqual(posts, 0)
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" {
                posts += 1
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=manual.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
            } else {
                expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=manual.signature")
                response.respond(json: "{\"status\":\"live\"}")
            }
        }
        try await restarted.login(username: "operator", password: "synthetic-password")
        _ = try await restarted.request(path: "/api/hub/tasks")
        expectEqual(posts, 1)
        expectNil(await bridge.read(origin: origin)) // No claim that the app intent was cleared.
    }

    func testOldLogoutAcknowledgementCannotEraseNewManualLogin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let gate = HeldSessionRead<HubDesktopSession>(nil)
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store,
            desktopSession: HeldLogoutDesktopSession(gate: gate), sharedSession: { nil })
        let oldLogout = Task { try await client.logout() }
        while !(await gate.started) { await Task.yield() }
        var posts = 0
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" {
                posts += 1
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=newer.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
            } else {
                expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=newer.signature")
                response.respond(json: "{\"status\":\"live\"}")
            }
        }
        try await client.login(username: "operator", password: "newer-password")
        await gate.release()
        do { try await oldLogout.value; recordFailure("Old logout must cancel") } catch is CancellationError {} catch { recordFailure("Wrong cancellation") }
        _ = try await client.request(path: "/api/hub/tasks")
        expectEqual(try store.load(origin: origin)?.password, "newer-password")
        expectEqual(posts, 1)
    }

    func testOldLoginAcceptanceCannotClearNewerLogin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = HeldAcceptanceDesktopSession(origin: origin)
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store,
            desktopSession: bridge, sharedSession: { nil })
        var posts = 0
        TransportURLProtocol.handler = { request, response in
            if request.httpMethod == "POST" {
                posts += 1
                let value = posts == 1 ? "older.signature" : "newer.signature"
                response.respond(json: "{\"status\":\"authenticated\"}", headers: ["Set-Cookie": "com_moon_operator_session=\(value); Path=/; Max-Age=3600; Secure; HttpOnly"])
            } else {
                expectEqual(request.value(forHTTPHeaderField: "Cookie"), "com_moon_operator_session=newer.signature")
                response.respond(json: "{\"status\":\"live\"}")
            }
        }
        let older = Task { try await client.login(username: "operator", password: "older-password") }
        while !(await bridge.waiting) { await Task.yield() }
        try await client.login(username: "operator", password: "newer-password")
        await bridge.release()
        do { try await older.value; recordFailure("Old login must cancel") } catch is CancellationError {} catch { recordFailure("Wrong cancellation") }
        _ = try await client.request(path: "/api/hub/tasks")
        expectEqual(try store.load(origin: origin)?.password, "newer-password")
    }

    func testDesktopNaturalExpiryKeepsKeychainAutoLogin() async throws {
        let origin = "https://hub.example.test"
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "test-password"), origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let bridge = MemoryDesktopSession()
        let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration, credentialStore: store, desktopSession: bridge, sharedSession: { nil })
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
        let loadsAfterManualFailure = store.loadCount
        for _ in 0..<2 {
            do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("A rejected manual login must not fall back to saved credentials") }
            catch { expectEqual(error as? HubTransportError, .unauthorized) }
        }
        expectEqual(logins, 1) // Explicit failure keeps this transport's automatic login disabled.
        expectEqual(store.loadCount, loadsAfterManualFailure)

        // A restarted transport may try the preserved credentials, but a rejected
        // automatic login must stop further attempts in that transport too.
        let restarted = try transport(store: store)
        for _ in 0..<2 {
            do { _ = try await restarted.request(path: "/api/hub/tasks"); recordFailure("Rejected saved credentials must fail") }
            catch { expectEqual(error as? HubTransportError, .unauthorized) }
        }
        expectEqual(logins, 2) // One manual attempt, then exactly one restart restoration.
        expectEqual(store.loadCount, loadsAfterManualFailure + 1)
        expectEqual(try store.load(origin: "https://hub.example.test"), saved)
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

    func testSharedSessionPreflightCannotSendAfterDisconnectOrSignOut() async throws {
        let origin = URL(string: "https://hub.example.test")!
        let snapshots: [HubSharedSession?] = [nil,
            HubSharedSession(origin: URL(string: "https://other.example.test")!, cookie: "other.signature"),
            HubSharedSession(origin: origin, cookie: "previous.signature")]
        for forget in [false, true] {
            for snapshot in snapshots {
                let gate = HeldSessionRead(snapshot)
                let configuration = URLSessionConfiguration.ephemeral
                configuration.protocolClasses = [TransportURLProtocol.self]
                let client = try HubTransport(baseURL: origin, configuration: configuration,
                    credentialStore: MemoryHubCredentials(), sharedSession: { await gate.read() })
                var requests = 0
                TransportURLProtocol.handler = { _, response in
                    requests += 1
                    response.respond(json: "{\"status\":\"live\"}")
                }
                let pending = Task { try await client.request(path: "/api/hub/journal", method: "POST", body: Data("{}".utf8)) }
                while !(await gate.started) { await Task.yield() }
                if forget { try await client.clearSession() } else { await client.disconnect() }
                await gate.release()
                do { _ = try await pending.value; recordFailure("An invalidated preflight must cancel before sending") }
                catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
                expectEqual(requests, 0)
                TransportURLProtocol.handler = { request, response in
                    expectNil(request.value(forHTTPHeaderField: "Cookie"))
                    response.respond(json: "{\"status\":\"live\"}")
                }
                _ = try await client.request(path: "/api/hub/tasks")
            }
        }
    }

    func testDesktopPreflightCannotSendAfterDisconnectOrSignOut() async throws {
        let origin = "https://hub.example.test"
        let saved = HubSavedSession(value: "previous.signature", expiresAt: Date().timeIntervalSince1970 + 86400)
        let snapshots: [HubDesktopSession?] = [nil,
            HubDesktopSession(origin: "https://other.example.test", session: saved),
            HubDesktopSession(origin: origin, session: saved)]
        for forget in [false, true] {
            for snapshot in snapshots {
                let gate = HeldSessionRead(snapshot)
                let configuration = URLSessionConfiguration.ephemeral
                configuration.protocolClasses = [TransportURLProtocol.self]
                let client = try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
                    credentialStore: MemoryHubCredentials(), desktopSession: HeldDesktopSession(gate: gate),
                    sharedSession: { nil })
                var requests = 0
                TransportURLProtocol.handler = { _, response in
                    requests += 1
                    response.respond(json: "{\"status\":\"live\"}")
                }
                let pending = Task { try await client.request(path: "/api/hub/journal", method: "POST", body: Data("{}".utf8)) }
                while !(await gate.started) { await Task.yield() }
                if forget { try await client.clearSession() } else { await client.disconnect() }
                await gate.release()
                do { _ = try await pending.value; recordFailure("An invalidated desktop preflight must not send") }
                catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
                expectEqual(requests, 0)
            }
        }
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
        return try HubTransport(baseURL: URL(string: address)!, configuration: configuration, credentialStore: store, sharedSession: { nil })
    }

    func testSharedLoginRotationLogoutAndOriginIsolation() async throws {
        let origin = URL(string: "https://hub.example.test")!
        let state = SharedSessionState(HubSharedSession(origin: origin, cookie: "first-session"))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        let client = try HubTransport(baseURL: origin, configuration: configuration, credentialStore: MemoryHubCredentials(), sharedSession: { await state.read() })
        var requests = 0
        var expectedCookie: String? = "com_moon_operator_session=first-session"
        TransportURLProtocol.handler = { request, protocolInstance in
            requests += 1
            expectEqual(request.httpMethod, "GET") // Never ask for another password.
            expectEqual(request.value(forHTTPHeaderField: "Cookie"), expectedCookie)
            protocolInstance.respond(json: "{\"status\":\"authenticated\",\"configured\":true}")
        }
        let status = try await client.sessionStatus()
        expectTrue(status.isAuthenticated)
        _ = try await client.request(path: "/api/hub/tasks")
        await state.set(HubSharedSession(origin: origin, cookie: "rotated-session"))
        expectedCookie = "com_moon_operator_session=rotated-session"
        _ = try await client.request(path: "/api/hub/tasks")
        await state.set(HubSharedSession(origin: origin, cookie: nil))
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("Hub logout must clear the native session") }
        catch { expectEqual(error as? HubTransportError, .unauthorized) }
        expectEqual(requests, 3) // Known logout performs no remote read/write.
        await state.set(HubSharedSession(origin: URL(string: "https://other.example.test")!, cookie: "other-session"))
        expectedCookie = nil
        _ = try await client.request(path: "/api/hub/tasks")
        expectEqual(requests, 4)
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
        #if canImport(Network)
        // Foundation traps when custom URLProtocol emits redirect callbacks on
        // this CLT runtime. Local listeners exercise the real URLSession delegate.
        let destination = try RedirectProbeServer(response: "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        let destinationPort = try await destination.start()
        defer { destination.stop() }
        let source = try RedirectProbeServer(response: "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://127.0.0.1:\(destinationPort)/receive\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        let sourcePort = try await source.start()
        defer { source.stop() }
        let client = try HubTransport(baseURL: URL(string: "http://127.0.0.1:\(sourcePort)")!, credentialStore: MemoryHubCredentials(), sharedSession: { nil })
        do { try await client.login(username: "test-operator", password: "test-password"); recordFailure("Redirect must fail") }
        catch { expectEqual(error as? HubTransportError, .redirectRejected) }
        expectEqual(source.requestCount, 1)
        expectEqual(destination.requestCount, 0)
        do { _ = try await client.request(path: "/api/hub/office/chat", method: "POST", body: Data("{}".utf8)); recordFailure("Office redirect must fail") }
        catch { expectEqual(error as? HubTransportError, .redirectRejected) }
        expectEqual(source.requestCount, 2)
        expectEqual(destination.requestCount, 0)
        #else
        print("SKIP: Darwin Network redirect listener (macOS required)")
        #endif
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

private actor SharedSessionState {
    private var value: HubSharedSession?
    init(_ value: HubSharedSession?) { self.value = value }
    func read() -> HubSharedSession? { value }
    func set(_ value: HubSharedSession?) { self.value = value }
}

#if canImport(Network)
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

#endif

private final class TestFailures: @unchecked Sendable {
    private let lock = NSLock()
    private var messages = [String]()
    func add(_ message: String) { lock.lock(); defer { lock.unlock() }; messages.append(message) }
    var all: [String] { lock.lock(); defer { lock.unlock() }; return messages }
}
private let testFailures = TestFailures()

private actor HeldSessionRead<Value: Sendable> {
    private let snapshot: Value?
    private var continuations: [CheckedContinuation<Value?, Never>] = []
    private var released = false
    private(set) var started = false
    var pendingReadCount: Int { continuations.count }
    init(_ snapshot: Value?) { self.snapshot = snapshot }
    func read() async -> Value? {
        if released { return nil }
        started = true
        return await withCheckedContinuation { continuations.append($0) }
    }
    func release() {
        released = true
        let waiting = continuations
        continuations.removeAll()
        for continuation in waiting { continuation.resume(returning: snapshot) }
    }
}

private struct HeldDesktopSession: HubDesktopSessionSharing {
    let gate: HeldSessionRead<HubDesktopSession>
    func read(origin: String) async -> HubDesktopSession? { await gate.read() }
    func write(_ session: HubSavedSession?, origin: String) async {}
    // Only the request preflight is held. The protocol default reads again after
    // writing logout, which would wait for a release scheduled after clearSession.
    func recordLogout(origin: String) async -> HubDesktopSession? {
        HubDesktopSession(origin: origin, session: nil, signedOut: true)
    }
}

private func testHeldSessionReadResumesEveryWaiter() async {
    let gate = HeldSessionRead("held")
    let first = Task { await gate.read() }
    let second = Task { await gate.read() }
    while await gate.pendingReadCount < 2 { await Task.yield() }
    await gate.release()
    expectEqual(await first.value, "held")
    expectEqual(await second.value, "held")
    expectEqual(await gate.pendingReadCount, 0)
    await gate.release() // Releasing twice must not resume any continuation twice.
    expectNil(await gate.read())
}

private struct HeldLogoutDesktopSession: HubDesktopSessionSharing {
    let gate: HeldSessionRead<HubDesktopSession>
    func read(origin: String) async -> HubDesktopSession? { nil }
    func write(_ session: HubSavedSession?, origin: String) async {}
    func recordLogout(origin: String) async -> HubDesktopSession? { await gate.read() }
}

private func verifiedSnapshot(_ value: HubDesktopSession) -> HubDesktopSession {
    var result = value
    result.protocolVersion = 2
    result.capabilities = HubDesktopCapabilities(logoutIntent: true)
    return result
}

private actor HeldAcceptanceDesktopSession: HubDesktopSessionSharing {
    nonisolated let supportsLogoutIntent = true
    let origin: String
    var count = 0
    var waiting = false
    var snapshot: HubDesktopSession?
    var continuation: CheckedContinuation<Void, Never>?
    init(origin: String) { self.origin = origin; snapshot = verifiedSnapshot(HubDesktopSession(origin: origin, session: nil)) }
    func read(origin: String) -> HubDesktopSession? { snapshot }
    func write(_ session: HubSavedSession?, origin: String) {}
    func beginLogin(origin: String) -> HubDesktopSession? {
        count += 1
        return verifiedSnapshot(HubDesktopSession(origin: origin, session: nil, signedOut: false, loginAttempt: String(count)))
    }
    func acceptLogin(_ session: HubSavedSession, attempt: String, origin: String) async -> HubDesktopSession? {
        let result = verifiedSnapshot(HubDesktopSession(origin: origin, session: session, signedOut: false))
        if attempt == "1" {
            waiting = true
            await withCheckedContinuation { continuation = $0 }
        } else { snapshot = result }
        return result
    }
    func release() { continuation?.resume(); continuation = nil }
}

private actor PeerFixtureDesktopSession: HubDesktopSessionSharing {
    nonisolated let supportsLogoutIntent = true
    var snapshot: HubDesktopSession?
    private(set) var begins = 0
    private(set) var writes = 0
    private(set) var logouts = 0
    let publicationGate: HeldSessionRead<HubDesktopSession>?
    init(_ snapshot: HubDesktopSession, publicationGate: HeldSessionRead<HubDesktopSession>? = nil) {
        self.snapshot = snapshot; self.publicationGate = publicationGate
    }
    func set(_ value: HubDesktopSession?) { snapshot = value }
    func read(origin: String) -> HubDesktopSession? { snapshot }
    func write(_ session: HubSavedSession?, origin: String) { writes += 1 }
    func publishSession(_ session: HubSavedSession, origin: String, epoch: String?) async -> HubDesktopSession? {
        if let publicationGate { return await publicationGate.read() }
        return verifiedSnapshot(HubDesktopSession(origin: origin, session: session, signedOut: false, sessionEpoch: epoch))
    }
    func beginLogin(origin: String) -> HubDesktopSession? {
        begins += 1
        return HubDesktopSession(origin: origin, session: nil, loginAttempt: "unsupported")
    }
    func recordLogout(origin: String) -> HubDesktopSession? { logouts += 1; return snapshot }
}

private actor MemoryIntentDesktopSession: HubDesktopSessionSharing {
    nonisolated let supportsLogoutIntent = true
    private var snapshot: HubDesktopSession?
    func set(_ value: HubDesktopSession?) { snapshot = value.map(verifiedSnapshot) }
    func read(origin: String) -> HubDesktopSession? { snapshot }
    func write(_ session: HubSavedSession?, origin: String) {}
}

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

// Opt-in Track D audit. Only URLProtocol and in-memory doubles are used.
// Native execution is intentionally separate from the established default suite.
private enum TrackDAudit {
    static let origin = "https://hub.example.test"
    static let epoch = "synthetic-current-epoch"
    static let old = HubSavedSession(value: "rejected.signature", expiresAt: 4102444800)
    static let freshValue = "accepted.signature"
    static func snapshot(session: HubSavedSession? = TrackDAudit.old, origin: String = TrackDAudit.origin,
                         epoch: String = TrackDAudit.epoch, signedOut: Bool = false) -> HubDesktopSession {
        var result = HubDesktopSession(origin: origin, session: session, signedOut: signedOut,
            automaticLoginBlocked: signedOut, sessionEpoch: epoch)
        if signedOut {
            result.logoutIntent = HubDesktopLogoutIntent(id: "synthetic-intent", installationId: "synthetic-installation",
                accountScope: "unknown/currentconnection", persistence: "persisted", localSession: "cleared",
                companion: "unconfirmed", ownedKeychain: "not-requested", remoteSession: "not-requested")
        }
        return verifiedSnapshot(result)
    }
    static var freshSnapshot: HubDesktopSession {
        snapshot(session: HubSavedSession(value: freshValue, expiresAt: 4102444800))
    }
    static func client(_ bridge: TrackDDesktopSession) throws -> (HubTransport, MemoryHubCredentials) {
        let store = MemoryHubCredentials()
        try store.save(HubCredentials(username: "operator", password: "synthetic-only"), origin: origin)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TransportURLProtocol.self]
        return (try HubTransport(baseURL: URL(string: origin)!, configuration: configuration,
            credentialStore: store, desktopSession: bridge, sharedSession: { nil }), store)
    }
    static func awaitGate(_ gate: HeldSessionRead<HubDesktopSession>) async -> Bool {
        let deadline = Date().addingTimeInterval(3)
        while !(await gate.started), Date() < deadline { await Task.yield() }
        return await gate.started
    }
    static func expectPreserved(_ store: MemoryHubCredentials) throws {
        expectEqual(try store.load(origin: origin), HubCredentials(username: "operator", password: "synthetic-only"))
    }
}

private enum TrackDPublicationReply: String, CaseIterable, Sendable {
    case echo, missing, wrongCookie, wrongEpoch, logout, wrongOrigin
}

private actor TrackDDesktopSession: HubDesktopSessionSharing {
    nonisolated let supportsLogoutIntent = true
    private let followup: HubDesktopSession?
    private let readGate: HeldSessionRead<HubDesktopSession>?
    private let publicationGate: HeldSessionRead<HubDesktopSession>?
    private let publicationReply: TrackDPublicationReply
    private(set) var reads = 0
    private(set) var published: [HubSavedSession] = []
    private(set) var publishedEpochs: [String?] = []
    init(followup: HubDesktopSession?, readGate: HeldSessionRead<HubDesktopSession>? = nil,
         publicationGate: HeldSessionRead<HubDesktopSession>? = nil,
         publicationReply: TrackDPublicationReply = .echo) {
        self.followup = followup; self.readGate = readGate; self.publicationGate = publicationGate
        self.publicationReply = publicationReply
    }
    func read(origin: String) async -> HubDesktopSession? {
        reads += 1
        if reads == 1 { return TrackDAudit.snapshot() }
        if reads == 2, let readGate { return await readGate.read() }
        return followup
    }
    func write(_ session: HubSavedSession?, origin: String) async { recordFailure("Audit must use acknowledged publication") }
    func publishSession(_ session: HubSavedSession, origin: String, epoch: String?) async -> HubDesktopSession? {
        published.append(session); publishedEpochs.append(epoch)
        if let publicationGate { return await publicationGate.read() }
        switch publicationReply {
        case .missing: return nil
        case .wrongCookie:
            let wrong = HubSavedSession(value: "different.signature", expiresAt: session.expiresAt)
            return verifiedSnapshot(HubDesktopSession(origin: origin, session: wrong, signedOut: false, sessionEpoch: epoch))
        case .wrongEpoch:
            return verifiedSnapshot(HubDesktopSession(origin: origin, session: session, signedOut: false, sessionEpoch: "different-epoch"))
        case .wrongOrigin:
            return verifiedSnapshot(HubDesktopSession(origin: "https://other.example.test", session: session, signedOut: false, sessionEpoch: epoch))
        case .logout: return TrackDAudit.snapshot(session: nil, signedOut: true)
        case .echo:
            return verifiedSnapshot(HubDesktopSession(origin: origin, session: session, signedOut: false, sessionEpoch: epoch))
        }
    }
}

private final class TrackDHTTP: @unchecked Sendable {
    private let lock = NSLock()
    private var loginCount = 0
    private var cookies: [String?] = []
    var logins: Int { lock.lock(); defer { lock.unlock() }; return loginCount }
    var readCookies: [String?] { lock.lock(); defer { lock.unlock() }; return cookies }
    func handle(_ request: URLRequest, _ response: TransportURLProtocol) {
        guard request.url?.host == "hub.example.test" else {
            recordFailure("Audit attempted a foreign HTTP destination")
            response.respond(status: 403, json: "{\"status\":\"forbidden\"}"); return
        }
        if request.url?.path == "/api/operator/session", request.httpMethod == "POST" {
            lock.lock(); loginCount += 1; lock.unlock()
            response.respond(json: "{\"status\":\"authenticated\"}", headers: [
                "Set-Cookie": "com_moon_operator_session=accepted.signature; Path=/; Max-Age=3600; Secure; HttpOnly"])
        } else {
            let cookie = request.value(forHTTPHeaderField: "Cookie")
            lock.lock(); cookies.append(cookie); lock.unlock()
            if cookie == "com_moon_operator_session=accepted.signature" { response.respond(json: "{\"status\":\"live\"}") }
            else { response.respond(status: 401, json: "{\"status\":\"unauthorized\"}") }
        }
    }
}

private func testTrackDUnchangedIntentPublishesFreshCookie() async throws {
    let bridge = TrackDDesktopSession(followup: TrackDAudit.snapshot())
    let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
    TransportURLProtocol.handler = { http.handle($0, $1) }
    do { expectEqual(try await client.request(path: "/api/hub/tasks").status, "live") }
    catch { recordFailure("Unchanged verified intent must retain the accepted fresh cookie: \(error)") }
    expectEqual(http.logins, 1)
    expectEqual(http.readCookies, ["com_moon_operator_session=rejected.signature", "com_moon_operator_session=accepted.signature"])
    expectEqual(await bridge.published.map(\.value), [TrackDAudit.freshValue])
    expectEqual(await bridge.publishedEpochs, [TrackDAudit.epoch])
    try TrackDAudit.expectPreserved(store)
    print("TRACE Track D unchanged intent: old=rejected.signature, expected fresh=accepted.signature, published=\(await bridge.published.map(\.value))")
}

private func testTrackDChangedIntentBlocksPublication() async throws {
    let cases: [(String, HubDesktopSession?, HubTransportError?)] = [
        ("logout", TrackDAudit.snapshot(session: nil, epoch: "synthetic-logout-epoch", signedOut: true), nil),
        ("epoch", TrackDAudit.snapshot(epoch: "synthetic-replacement-epoch"), nil),
        ("origin", TrackDAudit.snapshot(origin: "https://other.example.test"), .desktopSessionUnavailable),
        ("unavailable", nil, .desktopSessionUnavailable),
    ]
    for (name, snapshot, expected) in cases {
        let bridge = TrackDDesktopSession(followup: snapshot)
        let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
        TransportURLProtocol.handler = { http.handle($0, $1) }
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("\(name) must reject restoration") }
        catch is CancellationError { expectNil(expected) }
        catch {
            if let expected { expectEqual(error as? HubTransportError, expected) }
            else { recordFailure("\(name) expected cancellation, got \(error)") }
        }
        expectEqual(http.logins, 1)
        expectEqual(http.readCookies.count, 1) // The protected read is never replayed.
        expectEqual(await bridge.published.count, 0)
        try TrackDAudit.expectPreserved(store)
        print("TRACE Track D \(name): publication count=\(await bridge.published.count)")
    }
}

private func testTrackDPublicationAcknowledgementMustMatch() async throws {
    // A matching fresh follow-up snapshot isolates publication fences from the
    // stale-cookie hypothesis; no acceptance condition is relaxed.
    for reply in TrackDPublicationReply.allCases where reply != .echo {
        let name = reply.rawValue
        let bridge = TrackDDesktopSession(followup: TrackDAudit.freshSnapshot, publicationReply: reply)
        let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
        TransportURLProtocol.handler = { http.handle($0, $1) }
        do { _ = try await client.request(path: "/api/hub/tasks"); recordFailure("\(name) publication must fail closed") }
        catch { expectEqual(error as? HubTransportError, .desktopSessionUnavailable) }
        expectEqual(await bridge.published.map(\.value), [TrackDAudit.freshValue])
        expectEqual(http.logins, 1); expectEqual(http.readCookies.count, 1)
        try TrackDAudit.expectPreserved(store)
    }
}

private func testTrackDDisconnectDiscardsLateIntentRead() async throws {
    let gate = HeldSessionRead(TrackDAudit.snapshot())
    let bridge = TrackDDesktopSession(followup: TrackDAudit.snapshot(), readGate: gate)
    let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
    TransportURLProtocol.handler = { http.handle($0, $1) }
    let pending = Task { try await client.request(path: "/api/hub/tasks") }
    expectTrue(await TrackDAudit.awaitGate(gate))
    await client.disconnect()
    await gate.release()
    do { _ = try await pending.value; recordFailure("Disconnected intent lookup must cancel") }
    catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
    expectEqual(await bridge.published.count, 0)
    expectEqual(http.logins, 1); expectEqual(http.readCookies.count, 1)
    try TrackDAudit.expectPreserved(store)
}

private func testTrackDDisconnectDiscardsLatePublicationReply() async throws {
    let gate = HeldSessionRead(TrackDAudit.freshSnapshot)
    let bridge = TrackDDesktopSession(followup: TrackDAudit.freshSnapshot, publicationGate: gate)
    let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
    TransportURLProtocol.handler = { http.handle($0, $1) }
    let pending = Task { try await client.request(path: "/api/hub/tasks") }
    expectTrue(await TrackDAudit.awaitGate(gate))
    await client.disconnect()
    await gate.release()
    do { _ = try await pending.value; recordFailure("Disconnected publication reply must cancel") }
    catch is CancellationError {} catch { recordFailure("Expected cancellation, got \(error)") }
    expectEqual(await bridge.published.map(\.value), [TrackDAudit.freshValue])
    expectEqual(http.readCookies.count, 1)
    try TrackDAudit.expectPreserved(store)
}

private func testTrackDCallerCancellationDoesNotReturnProtectedData() async throws {
    let gate = HeldSessionRead(TrackDAudit.freshSnapshot)
    let bridge = TrackDDesktopSession(followup: TrackDAudit.freshSnapshot, readGate: gate)
    let (client, store) = try TrackDAudit.client(bridge), http = TrackDHTTP()
    TransportURLProtocol.handler = { http.handle($0, $1) }
    let pending = Task { try await client.request(path: "/api/hub/tasks") }
    expectTrue(await TrackDAudit.awaitGate(gate))
    pending.cancel()
    await gate.release()
    do { _ = try await pending.value; recordFailure("A canceled caller must not receive protected data") }
    catch is CancellationError {} catch { recordFailure("Expected caller cancellation, got \(error)") }
    // Automatic login is coalesced across callers. This case does not invent a
    // policy that canceling one waiter cancels authentication needed by another.
    for session in await bridge.published { expectEqual(session.value, TrackDAudit.freshValue) }
    expectEqual(http.logins, 1)
    try TrackDAudit.expectPreserved(store)
    print("TRACE Track D canceled caller: publications=\(await bridge.published.count), protected HTTP reads=\(http.readCookies.count)")
}

@main
private struct HubTransportTestRunner {
    static func main() async {
        let tests = HubTransportTests()
        let baselineCases: [(String, () async throws -> Void)] = [
            ("held session fixture resumes every waiter", testHeldSessionReadResumesEveryWaiter),
            ("peer capability requires exact version and flag", { try tests.testPeerCapabilityRequiresExactVersionAndFlag() }),
            ("unsupported peer preserves manual standalone login", tests.testUnsupportedPeerHoldsAutomaticRestoreButPreservesManualStandaloneLogin),
            ("verified peer rejects downgraded begin", tests.testVerifiedPeerCannotDowngradeDuringExplicitBegin),
            ("known peer downgrade fences paired session", tests.testVerifiedPairedSessionIsFencedOnlyOnKnownDowngrade),
            ("automatic restore requires verified publication acknowledgement", tests.testAutomaticRestoreRequiresVerifiedPublicationAcknowledgement),
            ("verified peer accepts automatic publication", tests.testVerifiedPeerAcceptsAutomaticPublication),
            ("desktop login import and sign-out without reauthentication", tests.testDesktopSessionImportsLoginAndExplicitSignOutWithoutReauthenticating),
            ("old logout acknowledgement preserves newer login", tests.testOldLogoutAcknowledgementCannotEraseNewManualLogin),
            ("old login acceptance preserves newer login", tests.testOldLoginAcceptanceCannotClearNewerLogin),
            ("durable logout preserves credentials and manual standalone login", tests.testDurableDesktopLogoutPreservesCredentialsAndUnavailableBridgeAllowsManualLogin),
            ("desktop natural expiry preserves Keychain auto login", tests.testDesktopNaturalExpiryKeepsKeychainAutoLogin),
            ("restart restores only the saved origin", tests.testRestartRestoresLoginOnlyForTheSavedOrigin),
            ("rejected credentials are neither saved nor retried forever", tests.testRejectedLoginNeverReplacesAcceptedCredentialsOrLoops),
            ("uncertain writes and model generation never replay", tests.testUncertainWritesAndModelGenerationAreNeverAutomaticallyReplayed),
            ("late responses cannot restore logout cookies", tests.testLateResponseCannotRestoreCookiesAfterSignOut),
            ("shared bridge preflight cannot send after disconnect/sign-out", tests.testSharedSessionPreflightCannotSendAfterDisconnectOrSignOut),
            ("desktop bridge preflight cannot send after disconnect/sign-out", tests.testDesktopPreflightCannotSendAfterDisconnectOrSignOut),
            ("disconnect cancels authentication without losing origin credentials", tests.testDisconnectCancelsAuthenticationButKeepsAcceptedCredentials),
            ("concurrent reads share automatic login", tests.testSimultaneousReadsShareOneAutomaticLogin),
            ("expired session renews without changing memo", tests.testExpiredSessionAuthenticatesOnceAndReplaysIdenticalMemoCommand),
            ("shared login rotation/logout/origin isolation", tests.testSharedLoginRotationLogoutAndOriginIsolation),
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
        let auditCases: [(String, () async throws -> Void)] = [
            ("Track D unchanged intent publishes only fresh cookie", testTrackDUnchangedIntentPublishesFreshCookie),
            ("Track D changed logout/epoch/origin blocks publication", testTrackDChangedIntentBlocksPublication),
            ("Track D publication acknowledgement matches cookie/epoch/origin", testTrackDPublicationAcknowledgementMustMatch),
            ("Track D disconnect discards late intent read", testTrackDDisconnectDiscardsLateIntentRead),
            ("Track D disconnect discards late publication reply", testTrackDDisconnectDiscardsLatePublicationReply),
            ("Track D caller cancellation cannot return protected data", testTrackDCallerCancellationDoesNotReturnProtectedData),
            ("Track D explicit failure never falls back; restart retries once", tests.testRejectedLoginNeverReplacesAcceptedCredentialsOrLoops),
            ("Track D late HTTP response cannot restore sign-out cookies", tests.testLateResponseCannotRestoreCookiesAfterSignOut),
            ("Track D disconnect cancels pending auth without replay", tests.testDisconnectCancelsAuthenticationButKeepsAcceptedCredentials),
        ]
        let cases = CommandLine.arguments.contains("--audit-stale-cookie") ? auditCases : baselineCases
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
