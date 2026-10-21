import Foundation

private func require(_ condition: Bool, _ label: String) throws {
    if !condition { throw NSError(domain: "OfficeMeetingPageTests", code: 1, userInfo: [NSLocalizedDescriptionKey: label]) }
}
private struct Vectors: Decodable {
    struct Case: Decodable { let name: String; let valid: Bool; let now: Double; let pages: [String]; let payload: String? }
    let version: Int; let id: UUID; let scope: String; let requestID: UUID; let message: String; let revision: Int
    let now: Double; let cases: [Case]; let legacy: String; let receipt: String
}
private func bytes(_ value: String) throws -> Data {
    guard let result = Data(base64Encoded: value) else { throw OfficeMeetingReadError.invalidPage }; return result
}
private actor PageTransport: HubTransporting {
    struct Call: Sendable { let path: String; let method: String; let body: Data? }
    var queued: [Data]
    private(set) var calls: [Call] = []
    private var revision = 0
    private var failAfter: Int?
    private let emptyError: HubTransportError
    private let identity = UUID()
    init(_ data: [Data], failAfter: Int? = nil, emptyError: HubTransportError = .offline) { queued = data; self.failAfter = failAfter; self.emptyError = emptyError }
    func request(path: String, method: String, body: Data?) async throws -> HubResponse {
        calls.append(Call(path: path, method: method, body: body))
        if calls.count == failAfter { revision += 1 }
        guard !queued.isEmpty else { throw emptyError }
        let data = queued.removeFirst()
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        return HubResponse(data: data, status: object["status"] as? String, source: object["source"] as? String)
    }
    func beginOfficeOperation() async throws -> HubOfficeOperation? {
        HubOfficeOperation(transportID: identity, generation: 0, authenticationRevision: revision)
    }
    func validateOfficeOperation(_ operation: HubOfficeOperation?) async throws {
        try Task.checkCancellation()
        guard operation?.transportID == identity, operation?.authenticationRevision == revision else { throw CancellationError() }
    }
    func officeRequest(path: String, method: String, body: Data?, operation: HubOfficeOperation?, deadline: Date) async throws -> HubResponse {
        try await validateOfficeOperation(operation)
        let response = try await request(path: path, method: method, body: body)
        try await validateOfficeOperation(operation)
        return response
    }
    func sessionStatus() async throws -> HubSessionStatus { HubSessionStatus(isAuthenticated: true, configured: true, reason: nil) }
    func login(username: String, password: String) async throws {}
    func logout() async throws { revision += 1 }
    func clearSession() async throws { revision += 1 }
    func disconnect() async { revision += 1 }
}

@main private enum OfficeMeetingPageTests {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { throw OfficeMeetingReadError.invalidPage }
        let vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        try require(vectors.version == 1, "vector version")
        for item in vectors.cases {
            var assembly = OfficeMeetingPageAssembly(id: vectors.id, scope: .personal)
            var result: Data?, failed = false
            do {
                for wire in item.pages { result = try assembly.accept(bytes(wire), now: Date(timeIntervalSince1970: item.now / 1000)) }
                if result == nil { failed = true }
            } catch { failed = true }
            try require(failed != item.valid, "Swift protocol vector: \(item.name)")
            if item.valid {
                try require(result == bytes(item.payload!), "exact UTF8 full payload: \(item.name)")
                try require(assembly.verifiedPages == item.pages.count && assembly.nextCursor == nil, "finite final cursor")
            }
        }
        let good = vectors.cases.first { $0.name == "large-single-turn-full-fields" }!
        let pages = try good.pages.map(bytes)
        let transport = PageTransport(pages), api = HubAPI(transport: transport)
        let detail = try await api.officeMeeting(id: vectors.id, scope: .personal)
        try require(detail.originalData == bytes(good.payload!), "API retains complete original fields")
        try require(detail.historyComplete == true && detail.restoration?.pageCount == pages.count, "API exposes verified completion")
        let calls = await transport.calls
        try require(calls.count == pages.count, "one GET per finite page")
        for call in calls {
            let query = URLComponents(string: call.path)!.queryItems!
            try require(call.method == "GET" && query.contains(URLQueryItem(name: "scope", value: "personal"))
                        && query.contains(URLQueryItem(name: "readVersion", value: "1")), "explicit scoped negotiation on every page")
        }
        let legacy = try bytes(vectors.legacy)
        let oldAPI = HubAPI(transport: PageTransport([legacy]))
        let old = try await oldAPI.officeMeeting(id: vectors.id, scope: .personal)
        try require(old.originalData == legacy && old.historyComplete == true && old.restoration == nil, "complete bounded old-server compatibility")
        for source in ["preview", "error"] {
            var body = try JSONSerialization.jsonObject(with: legacy) as! [String: Any]
            body["source"] = source
            let bytes = try JSONSerialization.data(withJSONObject: body)
            do {
                try OfficeMeetingPageAssembly.validateBody(bytes, id: vectors.id.uuidString.lowercased(), scope: "personal")
                throw OfficeChatError.invalidResponse
            } catch OfficeMeetingReadError.invalidPage {}
        }
        let receiptTransport = PageTransport([try bytes(vectors.receipt)] + pages)
        let recovered = try await HubAPI(transport: receiptTransport).sendOfficeMeeting(id: vectors.id, scope: .personal,
            requestID: vectors.requestID, revision: vectors.revision, message: vectors.message)
        try require(recovered.originalData == detail.originalData, "write receipt GET reconstructs existing result")
        let recoveryCalls = await receiptTransport.calls
        try require(recoveryCalls.first?.method == "POST" && recoveryCalls.dropFirst().allSatisfy { $0.method == "GET" }, "receipt never resends command")
        let original = try JSONSerialization.jsonObject(with: recoveryCalls[0].body!) as! [String: Any]
        try require(original["requestId"] as? String == vectors.requestID.uuidString.lowercased()
                    && original["expectedRevision"] as? Int == vectors.revision && original["message"] as? String == vectors.message, "original command identity")
        let failedRead = PageTransport([try bytes(vectors.receipt), pages[0]])
        do {
            _ = try await HubAPI(transport: failedRead).sendOfficeMeeting(id: vectors.id, scope: .personal,
                requestID: vectors.requestID, revision: vectors.revision, message: vectors.message)
            throw OfficeMeetingReadError.invalidPage
        } catch OfficeChatError.unconfirmed {}
        try require(await failedRead.calls.filter { $0.method == "POST" }.count == 1, "incomplete recovery never regenerates")
        for readError in [HubTransportError.unauthorized, .unconfigured, .server(statusCode: 400), .server(statusCode: 404)] {
            let stage = PageTransport([try bytes(vectors.receipt)], emptyError: readError)
            do {
                _ = try await HubAPI(transport: stage).sendOfficeMeeting(id: vectors.id, scope: .personal,
                    requestID: vectors.requestID, revision: vectors.revision, message: vectors.message)
                throw OfficeMeetingReadError.invalidPage
            } catch OfficeChatError.unconfirmed {}
            try require(await stage.calls.filter { $0.method == "POST" }.count == 1, "accepted write plus failed GET remains unconfirmed")
        }
        var creation = try JSONSerialization.jsonObject(with: bytes(vectors.receipt)) as! [String: Any]
        creation.removeValue(forKey: "requestId"); creation["outcome"] = "ready"
        let creationReceipt = try JSONSerialization.data(withJSONObject: creation)
        for readError in [HubTransportError.unauthorized, .server(statusCode: 400), .server(statusCode: 404)] {
            let stage = PageTransport([creationReceipt], emptyError: readError)
            do {
                _ = try await HubAPI(transport: stage).createOfficeMeeting(id: vectors.id, title: "합성 회의", scope: .personal, owner: .eevee, sourceTaskID: nil)
                throw OfficeMeetingReadError.invalidPage
            } catch OfficeChatError.unconfirmed {}
            try require(await stage.calls.filter { $0.method == "POST" }.count == 1, "accepted creation plus failed GET never recreates")
        }
        let preview = Data("{\"status\":\"preview\"}".utf8)
        for create in [false, true] {
            let stage = PageTransport([create ? creationReceipt : (try bytes(vectors.receipt)), preview])
            do {
                if create { _ = try await HubAPI(transport: stage).createOfficeMeeting(id: vectors.id, title: "합성 회의", scope: .personal, owner: .eevee, sourceTaskID: nil) }
                else { _ = try await HubAPI(transport: stage).sendOfficeMeeting(id: vectors.id, scope: .personal, requestID: vectors.requestID, revision: vectors.revision, message: vectors.message) }
                throw OfficeMeetingReadError.invalidPage
            } catch OfficeChatError.unconfirmed {}
        }
        let rotated = PageTransport(pages, failAfter: 1)
        do { _ = try await HubAPI(transport: rotated).officeMeeting(id: vectors.id, scope: .personal); throw OfficeMeetingReadError.invalidPage }
        catch is CancellationError {}
        try require(await rotated.calls.count == 1, "auth replacement fences later pages")
        let rotatedWrite = PageTransport([try bytes(vectors.receipt)] + pages, failAfter: 1)
        do {
            _ = try await HubAPI(transport: rotatedWrite).sendOfficeMeeting(id: vectors.id, scope: .personal,
                requestID: vectors.requestID, revision: vectors.revision, message: vectors.message)
            throw OfficeMeetingReadError.invalidPage
        } catch is CancellationError {}
        try require(await rotatedWrite.calls.count == 1, "auth replacement fences POST-to-GET recovery")
        let cancelledAPI = HubAPI(transport: PageTransport(pages))
        let cancelled = Task { try Task.checkCancellation(); return try await cancelledAPI.officeMeeting(id: vectors.id, scope: .personal) }
        cancelled.cancel()
        do { _ = try await cancelled.value; throw OfficeMeetingReadError.invalidPage } catch is CancellationError {}
        _ = try await HubAPI(transport: PageTransport(pages)).officeMeeting(id: vectors.id, scope: .personal)
        let budget = OfficeMeetingReadBudget()
        let a = try await budget.acquire(), b = try await budget.acquire(), c = try await budget.acquire()
        do { _ = try await budget.acquire(); throw OfficeMeetingReadError.invalidPage } catch OfficeMeetingReadError.resourceLimit {}
        try await budget.reserve(OfficeMeetingPageLimits.totalBytes, for: a)
        do { try await budget.reserve(1, for: b); throw OfficeMeetingReadError.invalidPage } catch OfficeMeetingReadError.resourceLimit {}
        await budget.release(a); try await budget.reserve(OfficeMeetingPageLimits.totalBytes, for: b)
        await budget.release(b); await budget.release(c)
        do {
            let _: Int = try await OfficeMeetingDeadline.run(seconds: 0.01) { _ in try await Task.sleep(nanoseconds: 1_000_000_000); return 1 }
            throw OfficeMeetingReadError.invalidPage
        } catch OfficeMeetingReadError.timeout {}
        print("Office native paging: \(vectors.cases.count) protocol vectors + scoped API/receipt/fence/budget/cancellation checks passed")
    }
}
