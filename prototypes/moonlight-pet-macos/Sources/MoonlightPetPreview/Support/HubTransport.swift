import Foundation

struct HubResponse: Sendable {
    let data: Data
    let status: String?
    let source: String?
    var isPreview: Bool { status == "preview" || source == "preview" }
    init(data: Data, status: String? = nil, source: String? = nil) {
        self.data = data
        self.status = status
        self.source = source
    }
}

struct HubSessionStatus: Sendable {
    let isAuthenticated: Bool
    let configured: Bool
    let reason: String?
}

protocol HubTransporting: Sendable {
    func request(path: String, method: String, body: Data?) async throws -> HubResponse
    func sessionStatus() async throws -> HubSessionStatus
    func login(username: String, password: String) async throws
    func logout() async throws
    func clearSession() async
}

enum HubTransportError: Error, Equatable, LocalizedError {
    case unauthorized, unconfigured, offline, timeout, rejectedURL, redirectRejected, invalidResponse, conflict
    case server(statusCode: Int)
    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Hub 로그인이 필요합니다. 계정과 비밀번호를 확인해 주세요."
        case .unconfigured: return "Hub 서버에 운영자 로그인 설정이 아직 없습니다."
        case .offline: return "Hub에 연결하지 못했습니다. 네트워크와 Hub 주소를 확인해 주세요."
        case .timeout: return "Hub 응답이 늦어지고 있습니다. 저장 여부를 확인한 뒤 다시 시도해 주세요."
        case .rejectedURL: return "Hub 주소는 HTTPS 또는 이 Mac의 localhost 주소로 입력해 주세요. 경로나 계정 정보는 넣을 수 없습니다."
        case .redirectRejected: return "Hub가 다른 주소로 이동을 요청했습니다. 설정에서 최종 Hub 주소를 확인해 주세요."
        case .invalidResponse: return "Hub 응답을 확인하지 못했습니다. 저장 완료로 처리하지 않았습니다."
        case .conflict: return "Hub에서 내용이 바뀌었습니다. 현재 입력을 보관했으니 최신 내용을 확인해 주세요."
        case .server(let statusCode): return "Hub 요청을 처리하지 못했습니다. (응답 \(statusCode))"
        }
    }
}

/// A fixed-origin client. Authentication belongs to the Hub operator session;
/// credentials and session cookies are never placed in defaults, disk, or logs.
actor HubTransport: HubTransporting {
    private let baseURL: URL
    private let origin: String
    private let session: URLSession
    private let officeChatSession: URLSession
    private let cookies: HTTPCookieStorage

    init(baseURL: URL, configuration: URLSessionConfiguration = .ephemeral) throws {
        let validated = try Self.validatedBaseURL(baseURL)
        self.baseURL = validated
        self.origin = validated.absoluteString

        // Start fresh even when the caller injects a test protocol. A supplied
        // configuration must not introduce shared credentials, cookies or cache.
        let privateConfiguration = URLSessionConfiguration.ephemeral
        privateConfiguration.protocolClasses = configuration.protocolClasses
        privateConfiguration.timeoutIntervalForRequest = min(max(configuration.timeoutIntervalForRequest, 1), 20)
        privateConfiguration.timeoutIntervalForResource = min(max(configuration.timeoutIntervalForResource, 1), 45)
        privateConfiguration.urlCache = nil
        privateConfiguration.urlCredentialStorage = nil
        privateConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
        privateConfiguration.httpShouldSetCookies = true
        guard let privateCookies = privateConfiguration.httpCookieStorage else { throw HubTransportError.invalidResponse }
        self.cookies = privateCookies
        self.session = URLSession(configuration: privateConfiguration, delegate: HubSessionDelegate(), delegateQueue: nil)

        // Office runs generation and review before returning one response (Hub: 60 seconds).
        // Keep the same private authentication jar; ordinary CRUD retains its smaller budget.
        guard let officeConfiguration = privateConfiguration.copy() as? URLSessionConfiguration else {
            throw HubTransportError.invalidResponse
        }
        officeConfiguration.timeoutIntervalForRequest = 60
        officeConfiguration.timeoutIntervalForResource = 70
        officeConfiguration.httpCookieStorage = privateCookies
        self.officeChatSession = URLSession(configuration: officeConfiguration, delegate: HubSessionDelegate(), delegateQueue: nil)
    }

    deinit {
        session.invalidateAndCancel()
        officeChatSession.invalidateAndCancel()
    }

    private func sessionForRequest(path: String, method: String) -> URLSession {
        path == "/api/hub/office/chat" && method.uppercased() == "POST" ? officeChatSession : session
    }

    // Read-only diagnostics expose the configured budget, never the session or its credentials.
    func timeoutIntervals(path: String, method: String = "GET") -> (request: TimeInterval, resource: TimeInterval) {
        let selected = sessionForRequest(path: path, method: method)
        return (selected.configuration.timeoutIntervalForRequest, selected.configuration.timeoutIntervalForResource)
    }

    func request(path: String, method: String = "GET", body: Data? = nil) async throws -> HubResponse {
        let url = try requestURL(path)
        let method = method.uppercased()
        guard ["GET", "POST", "PATCH", "DELETE"].contains(method) else { throw HubTransportError.rejectedURL }
        let selectedSession = sessionForRequest(path: path, method: method)
        var request = URLRequest(url: url, timeoutInterval: selectedSession.configuration.timeoutIntervalForRequest)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            request.setValue(origin, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        // Make cookie handling explicit so the same rules apply to URLProtocol
        // tests and actual HTTP responses. The jar is private and memory-only.
        let eligibleCookies = (cookies.cookies(for: url) ?? []).filter {
            (!$0.isSecure || url.scheme == "https") && ($0.expiresDate.map { $0 > Date() } ?? true)
        }
        for (key, value) in HTTPCookie.requestHeaderFields(with: eligibleCookies) { request.setValue(value, forHTTPHeaderField: key) }

        let data: Data
        let response: URLResponse
        do { (data, response) = try await selectedSession.data(for: request) }
        catch is CancellationError { throw CancellationError() }
        catch let error as URLError {
            switch error.code {
            case .cancelled: throw CancellationError()
            case .timedOut: throw HubTransportError.timeout
            case .userAuthenticationRequired, .userCancelledAuthentication: throw HubTransportError.unauthorized
            default: throw HubTransportError.offline
            }
        }
        guard let http = response as? HTTPURLResponse, let responseURL = http.url,
              Self.sameOrigin(responseURL, baseURL) else { throw HubTransportError.invalidResponse }
        guard !(300..<400).contains(http.statusCode) else { throw HubTransportError.redirectRejected }
        let envelope = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let status = envelope?["status"] as? String
        let source = envelope?["source"] as? String
        if status == "not-configured" || envelope?["error"] as? String == "operator-login-not-configured" {
            throw HubTransportError.unconfigured
        }
        if [401, 403].contains(http.statusCode) || status == "unauthorized" || status == "forbidden" {
            throw HubTransportError.unauthorized
        }
        if http.statusCode == 409 { throw HubTransportError.conflict }
        guard (200..<300).contains(http.statusCode), status != "error", source != "error" else {
            throw HubTransportError.server(statusCode: http.statusCode)
        }
        guard envelope != nil || http.statusCode == 204 else { throw HubTransportError.invalidResponse }

        var headers = [String: String]()
        for (key, value) in http.allHeaderFields {
            if let key = key as? String, let value = value as? String { headers[key] = value }
        }
        cookies.setCookies(HTTPCookie.cookies(withResponseHeaderFields: headers, for: url), for: url, mainDocumentURL: baseURL)
        return HubResponse(data: data, status: status, source: source)
    }

    func sessionStatus() async throws -> HubSessionStatus {
        let response = try await request(path: "/api/operator/session")
        guard let object = try JSONSerialization.jsonObject(with: response.data) as? [String: Any],
              let configured = object["configured"] as? Bool,
              response.status == "authenticated" || response.status == "anonymous" else {
            throw HubTransportError.invalidResponse
        }
        return HubSessionStatus(isAuthenticated: response.status == "authenticated", configured: configured, reason: object["reason"] as? String)
    }

    func login(username: String, password: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["username": username, "password": password])
        let response = try await request(path: "/api/operator/session", method: "POST", body: body)
        guard response.status == "authenticated", !response.isPreview else { throw HubTransportError.invalidResponse }
    }

    func logout() async throws {
        // Erase local authentication even if the server is temporarily offline.
        defer { clearSession() }
        let response = try await request(path: "/api/operator/session", method: "POST", body: Data("{\"action\":\"logout\"}".utf8))
        guard response.status == "logged_out", !response.isPreview else { throw HubTransportError.invalidResponse }
    }

    func clearSession() {
        for cookie in cookies.cookies ?? [] { cookies.deleteCookie(cookie) }
    }

    static func validatedBaseURL(_ url: URL) throws -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(), let host = components.host?.lowercased(), !host.isEmpty,
              components.user == nil, components.password == nil, components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              components.port.map({ (1...65535).contains($0) }) ?? true,
              scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)) else {
            throw HubTransportError.rejectedURL
        }
        components.scheme = scheme
        components.host = host
        components.path = ""
        if (scheme == "https" && components.port == 443) || (scheme == "http" && components.port == 80) { components.port = nil }
        guard let normalized = components.url else { throw HubTransportError.rejectedURL }
        return normalized
    }

    private func requestURL(_ path: String) throws -> URL {
        guard path.hasPrefix("/api/"), !path.contains("\\"),
              let components = URLComponents(string: path), components.scheme == nil, components.host == nil,
              components.fragment == nil,
              !components.path.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }),
              let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              Self.sameOrigin(url, baseURL) else { throw HubTransportError.rejectedURL }
        return url
    }

    private static func sameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        func port(_ url: URL) -> Int { url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80) }
        return lhs.scheme?.lowercased() == rhs.scheme?.lowercased()
            && lhs.host?.lowercased() == rhs.host?.lowercased() && port(lhs) == port(rhs)
    }
}

private final class HubSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            completionHandler(.performDefaultHandling, nil)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
