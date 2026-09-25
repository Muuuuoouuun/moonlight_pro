import Foundation

private struct ActivityCheckFailure: Error, CustomStringConvertible {
    let description: String
}
private func activityCheck(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw ActivityCheckFailure(description: message) }
}
private func activityRejects(_ message: String, _ operation: () async throws -> HubInquiryPage) async throws {
    do { _ = try await operation() }
    catch is ActivityCheckFailure { throw ActivityCheckFailure(description: "Script failed: \(message)") }
    catch { return }
    throw ActivityCheckFailure(description: message)
}

private actor ActivityScript: HubTransporting {
    private let response: HubResponse?
    private let error: HubTransportError?
    private var calls: [(String, String, Data?)] = []
    init(_ object: [String: Any]) throws {
        response = HubResponse(data: try JSONSerialization.data(withJSONObject: object), status: object["status"] as? String, source: object["source"] as? String)
        error = nil
    }
    init(error: HubTransportError) { response = nil; self.error = error }
    func request(path: String, method: String, body: Data?) async throws -> HubResponse {
        calls.append((path, method, body))
        if let error { throw error }
        guard let response else { throw ActivityCheckFailure(description: "Missing script response") }
        return response
    }
    func requests() -> [(String, String, Data?)] { calls }
    func sessionStatus() async throws -> HubSessionStatus { HubSessionStatus(isAuthenticated: true, configured: true, reason: nil) }
    func login(username: String, password: String) async throws {}
    func logout() async throws {}
    func clearSession() async {}
}

private func inquiryRow(id: UUID = UUID(), sequence: Int64 = 4) -> [String: Any] {
    ["id": id.uuidString, "subject": "문의 계약 검증", "kind": "support", "status": "new", "classification": "inquiry",
     "sources": ["gmail"], "unread": true, "last_inbound_seq": sequence, "last_read_seq": 1,
     "updated_at": "2026-09-25T01:02:03.123456+00:00", "received_at": "2026-09-25T01:02:00Z"]
}
private func inquiryPage(_ rows: [[String: Any]], count: Int? = nil, status: String = "live", source: String = "supabase") -> [String: Any] {
    ["status": status, "source": source, "rows": rows, "unreadCount": count ?? rows.count]
}

func runHubActivityContractTests() async throws -> Int {
    var count = 0
    do {
        let id = UUID(), script = try ActivityScript(inquiryPage([inquiryRow(id: id)], count: 42))
        let service: any HubActivityServing = HubAPI(transport: script)
        let page = try await service.inquiries()
        try activityCheck(page.unreadCount == 42 && page.inquiries.count == 1, "Exact unread count must remain independent of bounded row preview")
        let item = page.inquiries[0], requests = await script.requests()
        try activityCheck(requests.count == 1 && requests[0].0 == "/api/hub/inquiries?filter=unread&pageSize=25" && requests[0].1 == "GET" && requests[0].2 == nil, "Inquiry notifications must only read the authenticated existing route")
        try activityCheck(item.id == id.uuidString.lowercased() && item.title == "문의 계약 검증" && item.subtitle == "지원 문의 · 메일", "Inquiry projection must use actual title, type and channel")
        try activityCheck(item.updatedAt != nil && item.token == "inquiry:\(id.uuidString.lowercased()):4", "Inquiry identity must track inbound message sequence")
        try activityCheck(item.path == "/dashboard/revenue/inquiries?inquiry=\(id.uuidString.lowercased())", "Deep link must be built from canonical UUID")
        count += 1
    }
    do {
        let script = try ActivityScript(inquiryPage([]))
        let page = try await HubAPI(transport: script).inquiries()
        try activityCheck(page.inquiries.isEmpty && page.unreadCount == 0, "Only confirmed live zero is an empty inbox")
        count += 1
    }
    do {
        for status in ["preview", "partial", "error", "unknown"] {
            let script = try ActivityScript(inquiryPage([], status: status))
            try await activityRejects("Unconfirmed \(status) cannot become empty success") { try await HubAPI(transport: script).inquiries() }
        }
        for source in ["preview", "error", "unknown"] {
            let script = try ActivityScript(inquiryPage([], source: source))
            try await activityRejects("Unconfirmed source \(source) cannot become live success") { try await HubAPI(transport: script).inquiries() }
        }
        let script = try ActivityScript(inquiryPage([], status: "preview"))
        do { _ = try await HubAPI(transport: script).inquiries(); throw ActivityCheckFailure(description: "Expected distinct preview error") }
        catch HubDataError.preview {}
        count += 1
    }
    do {
        for error in [HubTransportError.unauthorized, .offline, .server(statusCode: 200)] {
            let script = ActivityScript(error: error)
            do { _ = try await HubAPI(transport: script).inquiries(); throw ActivityCheckFailure(description: "Transport error swallowed") }
            catch let result as HubTransportError { try activityCheck(result == error, "Auth/network/error-envelope state must propagate without an invented count") }
        }
        count += 1
    }
    do {
        let id = UUID(), first = inquiryRow(id: id)
        var edited = first
        edited["updated_at"] = "2026-09-25T02:03:04Z"
        edited["subject"] = "분류 수정 뒤 제목"
        edited["kind"] = "sales"
        var readEdited = first
        readEdited["last_read_seq"] = 2
        let tokens = try await [first, edited, readEdited, inquiryRow(id: id, sequence: 5)].asyncInquiryTokens()
        try activityCheck(tokens[0] == tokens[1] && tokens[0] == tokens[2] && tokens[0] != tokens[3], "Only a new inbound message may retrigger an inquiry notification")
        count += 1
    }
    do {
        let badIds = ["https://elsewhere.test/", "../settings", UUID().uuidString + "&next=https://elsewhere.test", "not-a-uuid"]
        for id in badIds {
            var row = inquiryRow(); row["id"] = id
            let script = try ActivityScript(inquiryPage([row]))
            try await activityRejects("Untrusted ID must never become a navigation target") { try await HubAPI(transport: script).inquiries() }
        }
        var row = inquiryRow()
        row["href"] = "https://elsewhere.test/"
        row["source_url"] = "file:///private/ignored"
        let script = try ActivityScript(inquiryPage([row]))
        let item = try await HubAPI(transport: script).inquiries().inquiries[0]
        try activityCheck(item.path.hasPrefix("/dashboard/revenue/inquiries?inquiry=") && !item.path.contains("elsewhere"), "Server URLs must not influence the fixed Hub deep link")
        count += 1
    }
    do {
        let original = inquiryRow()
        let mutations: [(String, Any)] = [("unread", false), ("last_inbound_seq", 0), ("last_inbound_seq", 9_007_199_254_740_992 as Int64), ("last_read_seq", -1), ("last_read_seq", 4), ("subject", " \n "), ("status", "closed"), ("classification", "ignored"), ("updated_at", "invalid-date")]
        for (field, value) in mutations {
            var row = original; row[field] = value
            let script = try ActivityScript(inquiryPage([row]))
            try await activityRejects("Malformed inquiry \(field) must not create a notice") { try await HubAPI(transport: script).inquiries() }
        }
        let duplicate = try ActivityScript(inquiryPage([original, original]))
        try await activityRejects("Duplicate inquiry IDs must fail closed") { try await HubAPI(transport: duplicate).inquiries() }
        for invalidCount in [-1, 0] {
            let script = try ActivityScript(inquiryPage([original], count: invalidCount))
            try await activityRejects("Invalid exact unread count must not be shown") { try await HubAPI(transport: script).inquiries() }
        }
        let tooMany = try ActivityScript(inquiryPage((0..<26).map { _ in inquiryRow() }))
        try await activityRejects("Unexpected oversized page violates preview bound") { try await HubAPI(transport: tooMany).inquiries() }
        count += 1
    }
    do {
        var row = inquiryRow()
        row.removeValue(forKey: "updated_at")
        let fallback = try await HubAPI(transport: ActivityScript(inquiryPage([row]))).inquiries().inquiries[0]
        try activityCheck(fallback.updatedAt == ISO8601DateFormatter().date(from: "2026-09-25T01:02:00Z"), "Received timestamp may supply missing display date")
        row.removeValue(forKey: "received_at")
        let undated = try await HubAPI(transport: ActivityScript(inquiryPage([row]))).inquiries().inquiries[0]
        try activityCheck(undated.updatedAt == nil, "Unknown date must remain unknown")
        count += 1
    }
    return count
}

private extension Array where Element == [String: Any] {
    func asyncInquiryTokens() async throws -> [String] {
        var result: [String] = []
        for row in self {
            let script = try ActivityScript(inquiryPage([row]))
            let page = try await HubAPI(transport: script).inquiries()
            result.append(page.inquiries[0].token)
        }
        return result
    }
}
