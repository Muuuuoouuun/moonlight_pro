import Foundation

struct OfficeRequestCheckFailure: Error, CustomStringConvertible { let description: String }
func requestCheck(_ value: Bool, _ message: String) throws {
    if !value { throw OfficeRequestCheckFailure(description: message) }
}
private func rejectsRequest(_ expected: OfficeRequestError, _ message: String,
                            _ operation: () async throws -> Void) async throws {
    do { try await operation() }
    catch let error as OfficeRequestError {
        try requestCheck(error == expected, "Wrong request error: \(message): \(error)")
        return
    }
    throw OfficeRequestCheckFailure(description: message)
}
private func rejectsRequest(_ message: String, _ operation: () async throws -> Void) async throws {
    try await rejectsRequest(.invalidResponse, message, operation)
}

private actor RequestContractTransport: HubTransporting {
    let response: HubResponse
    private(set) var calls: [(String, String, Data?)] = []
    init(_ object: [String: Any], status: String? = nil, source: String? = nil) throws {
        response = HubResponse(data: try JSONSerialization.data(withJSONObject: object),
                               status: status ?? object["status"] as? String, source: source ?? object["source"] as? String)
    }
    func request(path: String, method: String, body: Data?) async throws -> HubResponse {
        calls.append((path, method, body)); return response
    }
    func sessionStatus() async throws -> HubSessionStatus { .init(isAuthenticated: true, configured: true, reason: nil) }
    func login(username: String, password: String) async throws {}
    func logout() async throws {}
    func clearSession() async {}
    func disconnect() async {}
}

func requestRow(id: UUID = UUID(), stamp: String = "2026-10-03T00:00:00.000Z", scope: String = "personal", state: String = "generated") -> [String: Any] {
    ["requestId": id.uuidString.lowercased(), "intent": "weekly_report", "scope": scope,
     "originRef": ["periodStart": "2026-09-21", "periodEnd": "2026-09-27", "timezone": "Asia/Seoul"],
     "ownerId": "vaporeon", "mode": "draft", "participants": [String](), "createdAt": stamp,
     "status": state, "state": state, "expired": state == "expired"]
}
private func requestEnvelope(_ items: [[String: Any]]) -> [String: Any] {
    ["status": "ready", "source": "live", "items": items, "hasMore": false, "nextCursor": NSNull()]
}
private func receiptEnvelope(_ row: [String: Any]) -> [String: Any] {
    var value = row
    value["result"] = ["version": "2026-09-21.v1", "requestId": row["requestId"]!, "ownerId": row["ownerId"]!,
                       "mode": row["mode"]!, "participants": row["participants"]!, "scope": row["scope"]!,
                       "status": "generated", "resultRevision": 1,
                       "artifact": ["kind": "markdown", "body": "확인한 범위의 결과 🌙\n두 번째 줄"]]
    value["persistence"] = ["persisted": true]
    value["resultRevision"] = 1
    value["application"] = NSNull()
    return value
}

func requestSummary(id: UUID = UUID(), scope: OfficeRequestScope = .personal, state: OfficeRequestState = .generated,
                    date: Date = Date(timeIntervalSince1970: 1_790_985_600)) throws -> OfficeRequestSummary {
    try OfficeRequestSummary(id: id, intent: .weeklyReport, scope: scope, owner: .vaporeon, createdAt: date,
                             origin: .weekly(periodStart: "2026-09-21", periodEnd: "2026-09-27", timezone: "Asia/Seoul"),
                             mode: .draft, participants: [], state: state, expired: state == .expired)
}

func runOfficeRequestContractTests() async throws -> Int {
    var count = 0
    let id = UUID(), row = requestRow(id: UUID())
    let transport = try RequestContractTransport(requestEnvelope([row]))
    let page = try await HubAPI(transport: transport).officeInbox(scope: .personal, cursor: nil)
    let summary = page.items[0]
    let calls = await transport.calls
    let components = URLComponents(string: calls[0].0)
    try requestCheck(calls.count == 1 && calls[0].1 == "GET" && calls[0].2 == nil, "Inbox only performs one read")
    try requestCheck(components?.path == "/api/hub/office/inbox" && components?.queryItems == [URLQueryItem(name: "scope", value: "personal"), URLQueryItem(name: "limit", value: "20")], "Inbox uses selected scope and bounded limit")
    try requestCheck(summary.intent == .weeklyReport && summary.owner == .vaporeon && summary.scope == .personal, "Workflow metadata retains authority")
    try requestCheck(summary.title == "주간 정리" && summary.statusLabel == "결과 도착" && summary.isReadable && !summary.originLabel.isEmpty, "Generated result is readable, not task completion")
    try requestCheck(OfficeRequestScope.allCases.map(\.rawValue) == ["personal", "classin"], "Workflow excludes all scope")
    count += 1

    for mode in ["chat", "answer", "review", "council"] {
        var compatibleRow = row; compatibleRow["mode"] = mode
        if mode == "council" { compatibleRow["participants"] = ["vaporeon", "flareon"] }
        let compatiblePage = try await HubAPI(transport: RequestContractTransport(requestEnvelope([compatibleRow]))).officeInbox(scope: .personal, cursor: nil)
        let compatibleDetail = try await HubAPI(transport: RequestContractTransport(receiptEnvelope(compatibleRow))).officeReceipt(compatiblePage.items[0])
        try requestCheck(compatibleDetail.request.mode.rawValue == mode && compatibleDetail.body != nil, "Persisted workflow mode \(mode) survives exact receipt matching")
        var differentMode = receiptEnvelope(compatibleRow), generated = differentMode["result"] as! [String: Any]
        generated["mode"] = mode == "chat" ? "answer" : "chat"; differentMode["result"] = generated
        try await rejectsRequest("Legacy answer cannot be silently normalized to a different stored mode") { _ = try await HubAPI(transport: RequestContractTransport(differentMode)).officeReceipt(compatiblePage.items[0]) }
    }
    count += 1

    for (key, value) in [("status", "error"), ("source", "error")] {
        var object = requestEnvelope([]); object[key] = value
        try await rejectsRequest("HTTP 200 error cannot become an empty inbox") { _ = try await HubAPI(transport: RequestContractTransport(object)).officeInbox(scope: .personal, cursor: nil) }
    }
    for key in ["status", "source"] {
        var object = requestEnvelope([]); object[key] = "preview"
        try await rejectsRequest(.preview, "Preview has distinct meaning") { _ = try await HubAPI(transport: RequestContractTransport(object)).officeInbox(scope: .personal, cursor: nil) }
    }
    try await rejectsRequest("Raw envelope errors cannot hide behind transport metadata") {
        _ = try await HubAPI(transport: RequestContractTransport(["status": "error", "items": []], status: "ready", source: "live")).officeInbox(scope: .personal, cursor: nil)
    }
    count += 1

    let mutations: [(String, Any)] = [
        ("scope", "classin"), ("scope", "all"), ("intent", "freeform"), ("intent", "general_chat"),
        ("requestId", "bad-id"), ("ownerId", "unknown"), ("mode", "complete"), ("participants", ["vaporeon"]),
        ("state", "done"), ("state", "running"), ("expired", true),
        ("createdAt", "2026-02-30T00:00:00Z"), ("createdAt", "2026-10-03"),
        ("createdAt", "2026-10-03T24:00:00Z"), ("createdAt", "2026-10-03T00:60:00Z"),
        ("createdAt", "2026-10-03T00:00:00+25:00"), ("expired", 0),
        ("originRef", ["periodStart": "2026-09-21", "periodEnd": "2026-09-28", "timezone": "Asia/Seoul"]),
        ("originRef", ["periodStart": "2026-09-21", "periodEnd": "2026-09-27", "timezone": "unknown"]),
        ("originRef", ["periodStart": "2026-09-21", "periodEnd": "2026-09-27", "timezone": "Asia/Seoul", "body": "private"]),
        ("result", ["artifact": ["body": "private"]]), ("inputSnapshot", ["message": "private"])
    ]
    for (key, value) in mutations {
        var changed = row; changed[key] = value
        try await rejectsRequest("Invalid or overbroad summary \(key)=\(value) must fail closed") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([changed]))).officeInbox(scope: .personal, cursor: nil) }
    }
    for key in ["ownerId", "mode", "participants", "status", "state", "expired", "originRef", "createdAt"] {
        var changed = row; changed.removeValue(forKey: key)
        try await rejectsRequest("Missing \(key) cannot render as a valid summary") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([changed]))).officeInbox(scope: .personal, cursor: nil) }
    }
    try await rejectsRequest("Duplicate IDs rejected") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([row, row]))).officeInbox(scope: .personal, cursor: nil) }
    let many = (0..<21).map { _ in requestRow(stamp: "2026-10-02T00:00:00Z").merging(["requestId": UUID().uuidString.lowercased()]) { _, new in new } }
    try await rejectsRequest("List is bounded to twenty summaries") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope(many))).officeInbox(scope: .personal, cursor: nil) }
    count += 1

    let laterID = UUID(uuidString: "ffffffff-ffff-ffff-ffff-ffffffffffff")!, earlierID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    let tiedRows = [requestRow(id: laterID), requestRow(id: earlierID)]
    _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope(tiedRows))).officeInbox(scope: .personal, cursor: nil)
    try await rejectsRequest("Equal timestamps require descending UUID order") {
        _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope(tiedRows.reversed()))).officeInbox(scope: .personal, cursor: nil)
    }
    let preciseRows = [requestRow(id: earlierID, stamp: "2026-10-03T00:00:00.123457Z"), requestRow(id: laterID, stamp: "2026-10-03T00:00:00.123456Z")]
    let precisePage = try await HubAPI(transport: RequestContractTransport(requestEnvelope(preciseRows))).officeInbox(scope: .personal, cursor: nil)
    try requestCheck(precisePage.items[0].createdAt > precisePage.items[1].createdAt, "Microsecond ordering cannot be collapsed into UUID ordering")
    let preciseAfter = try OfficeRequestCursor(createdAt: "2026-10-03T00:00:00.123457Z", id: earlierID)
    _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([preciseRows[1]]))).officeInbox(scope: .personal, cursor: preciseAfter)
    for key in ["status", "source", "hasMore", "nextCursor"] {
        var object = requestEnvelope([]); object.removeValue(forKey: key)
        try await rejectsRequest("Missing inbox \(key) fails closed") { _ = try await HubAPI(transport: RequestContractTransport(object)).officeInbox(scope: .personal, cursor: nil) }
    }
    for value: Any in [1, "true"] {
        var object = requestEnvelope([]); object["hasMore"] = value
        try await rejectsRequest("Pagination boolean is typed") { _ = try await HubAPI(transport: RequestContractTransport(object)).officeInbox(scope: .personal, cursor: nil) }
    }
    count += 1

    var customer = requestRow(id: id, scope: "classin"); customer["intent"] = "customer_reply"; customer["ownerId"] = "flareon"
    customer["originRef"] = ["entityType": "customer_account", "entityId": id.uuidString]
    let customerPage = try await HubAPI(transport: RequestContractTransport(requestEnvelope([customer]))).officeInbox(scope: .classin, cursor: nil)
    try requestCheck(customerPage.items[0].title == "고객 답장 초안" && customerPage.items[0].originLabel.contains("고객"), "Customer origin is labeled without a fabricated customer name")
    customer["originRef"] = ["entityType": "name", "entityId": "a customer"]
    try await rejectsRequest("Customer origin is a typed UUID reference") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([customer]))).officeInbox(scope: .classin, cursor: nil) }
    count += 1

    let cursor = try OfficeRequestCursor(createdAt: "2026-10-03T00:00:00Z", id: id)
    let older = requestRow(id: UUID(), stamp: "2026-10-02T00:00:00Z")
    var paged = requestEnvelope([older]); paged["hasMore"] = true
    paged["nextCursor"] = ["createdAt": older["createdAt"]!, "id": older["requestId"]!]
    let cursorTransport = try RequestContractTransport(paged)
    let olderPage = try await HubAPI(transport: cursorTransport).officeInbox(scope: .personal, cursor: cursor)
    let cursorCalls = await cursorTransport.calls
    let encoded = URLComponents(string: cursorCalls[0].0)?.queryItems?.first { $0.name == "cursor" }?.value ?? ""
    var base64 = encoded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    let encodedObject = try JSONSerialization.jsonObject(with: Data(base64Encoded: base64) ?? Data()) as? [String: String]
    try requestCheck(!encoded.contains("=") && encodedObject?["createdAt"] == cursor.createdAt && encodedObject?["id"] == id.uuidString.lowercased(), "Cursor uses bounded base64url JSON")
    try requestCheck(olderPage.hasMore && olderPage.nextCursor?.id.uuidString.lowercased() == older["requestId"] as? String, "Stable cursor follows the last returned row")
    let microsecondCursor = try OfficeRequestCursor(createdAt: "2026-10-03T00:00:00.123456Z", id: id)
    let preciseTransport = try RequestContractTransport(requestEnvelope([older]))
    _ = try await HubAPI(transport: preciseTransport).officeInbox(scope: .personal, cursor: microsecondCursor)
    let preciseCall = await preciseTransport.calls
    let preciseEncoded = URLComponents(string: preciseCall[0].0)?.queryItems?.first { $0.name == "cursor" }?.value ?? ""
    var preciseBase64 = preciseEncoded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    preciseBase64 += String(repeating: "=", count: (4 - preciseBase64.count % 4) % 4)
    let preciseObject = try JSONSerialization.jsonObject(with: Data(base64Encoded: preciseBase64) ?? Data()) as? [String: String]
    try requestCheck(preciseObject?["createdAt"] == "2026-10-03T00:00:00.123456Z", "Raw microseconds survive cursor encoding")
    var wrongCursor = paged; wrongCursor["nextCursor"] = ["createdAt": cursor.createdAt, "id": id.uuidString]
    try await rejectsRequest("Cursor must strictly advance and match the last row") { _ = try await HubAPI(transport: RequestContractTransport(wrongCursor)).officeInbox(scope: .personal, cursor: cursor) }
    try await rejectsRequest("Newer rows cannot enter older-page pagination") { _ = try await HubAPI(transport: RequestContractTransport(requestEnvelope([row]))).officeInbox(scope: .personal, cursor: try OfficeRequestCursor(createdAt: "2026-10-01T00:00:00Z", id: id)) }
    count += 1

    let detailTransport = try RequestContractTransport(receiptEnvelope(row))
    let detail = try await HubAPI(transport: detailTransport).officeReceipt(summary)
    let detailCalls = await detailTransport.calls
    try requestCheck(detail.body == "확인한 범위의 결과 🌙\n두 번째 줄" && detail.request.id == summary.id, "Receipt exposes only its verified artifact body")
    try requestCheck(detailCalls.count == 1 && detailCalls[0].0 == "/api/hub/office/requests/\(summary.id.uuidString.lowercased())" && detailCalls[0].1 == "GET" && detailCalls[0].2 == nil, "Reading never mutates, applies, or generates")
    for key in ["requestId", "ownerId", "scope", "originRef", "intent", "mode", "createdAt"] {
        var changed = receiptEnvelope(row)
        let replacements: [String: Any] = ["requestId": UUID().uuidString, "ownerId": "flareon", "scope": "classin", "originRef": ["periodStart": "2026-09-14", "periodEnd": "2026-09-20", "timezone": "Asia/Seoul"], "intent": "customer_reply", "mode": "review", "createdAt": "2026-10-02T00:00:00Z"]
        changed[key] = replacements[key]
        try await rejectsRequest("Receipt \(key) must match selected metadata") { _ = try await HubAPI(transport: RequestContractTransport(changed)).officeReceipt(summary) }
    }
    for (key, value) in [("requestId", UUID().uuidString), ("ownerId", "flareon"), ("scope", "classin"), ("mode", "chat"), ("version", "unknown"), ("status", "error")] {
        var changed = receiptEnvelope(row), result = changed["result"] as! [String: Any]
        result[key] = value; changed["result"] = result
        try await rejectsRequest("Artifact \(key) must match the selected request") { _ = try await HubAPI(transport: RequestContractTransport(changed)).officeReceipt(summary) }
    }
    for (key, value): (String, Any) in [("persistence", ["persisted": false]), ("persistence", ["persisted": 1]), ("resultRevision", 2), ("resultRevision", true)] {
        var changed = receiptEnvelope(row); changed[key] = value
        try await rejectsRequest("Receipt metadata must identify a stored result revision") { _ = try await HubAPI(transport: RequestContractTransport(changed)).officeReceipt(summary) }
    }
    for key in ["persistence", "resultRevision"] {
        var changed = receiptEnvelope(row); changed.removeValue(forKey: key)
        try await rejectsRequest("Missing receipt \(key) cannot imply persisted output") { _ = try await HubAPI(transport: RequestContractTransport(changed)).officeReceipt(summary) }
    }
    var mismatchedRevision = receiptEnvelope(row), mismatchedResult = mismatchedRevision["result"] as! [String: Any]
    mismatchedResult["resultRevision"] = 2; mismatchedRevision["result"] = mismatchedResult
    try await rejectsRequest("Generated artifact revision matches stored receipt") { _ = try await HubAPI(transport: RequestContractTransport(mismatchedRevision)).officeReceipt(summary) }
    var long = receiptEnvelope(row), result = long["result"] as! [String: Any]
    result["artifact"] = ["kind": "markdown", "body": String(repeating: "🌙", count: 12001)]; long["result"] = result
    try await rejectsRequest("Generated body UTF16 budget") { _ = try await HubAPI(transport: RequestContractTransport(long)).officeReceipt(summary) }
    for text in [" \n", String(repeating: "🌙", count: 12000)] {
        var boundary = receiptEnvelope(row), result = boundary["result"] as! [String: Any]
        result["artifact"] = ["kind": "markdown", "body": text]; boundary["result"] = result
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            try await rejectsRequest("Whitespace artifact cannot become a result") { _ = try await HubAPI(transport: RequestContractTransport(boundary)).officeReceipt(summary) }
        } else {
            let value = try await HubAPI(transport: RequestContractTransport(boundary)).officeReceipt(summary)
            try requestCheck(value.body == text, "Exact UTF16 limit remains readable")
        }
    }
    count += 1

    for state in ["running", "unknown", "expired"] {
        var changed = receiptEnvelope(row); changed["status"] = state; changed["state"] = state; changed["expired"] = state == "expired"
        let noBody = try await HubAPI(transport: RequestContractTransport(changed)).officeReceipt(summary)
        try requestCheck(noBody.body == nil && !noBody.request.isReadable, "\(state) never exposes even a supplied body")
    }
    var failed = receiptEnvelope(row); failed["status"] = "error"; failed["state"] = "error"
    try await rejectsRequest("HTTP 200/error receipt is a read failure") { _ = try await HubAPI(transport: RequestContractTransport(failed)).officeReceipt(summary) }
    count += 1
    return count
}
