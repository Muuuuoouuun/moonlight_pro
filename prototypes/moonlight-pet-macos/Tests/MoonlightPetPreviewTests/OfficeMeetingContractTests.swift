import Foundation

private func requireMeeting(_ value: Bool, _ message: String) throws {
    if !value { throw NSError(domain: "OfficeMeetingChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
private actor MeetingTransport: HubTransporting {
    let response: HubResponse
    private(set) var calls: [(String, String, Data?)] = []
    init(_ object: [String: Any]) throws {
        response = HubResponse(data: try JSONSerialization.data(withJSONObject: object), status: object["status"] as? String, source: nil)
    }
    func request(path: String, method: String, body: Data?) async throws -> HubResponse { calls.append((path, method, body)); return response }
    func sessionStatus() async throws -> HubSessionStatus { HubSessionStatus(isAuthenticated: true, configured: true, reason: nil) }
    func login(username: String, password: String) async throws {}
    func logout() async throws {}
    func clearSession() async {}
    func disconnect() async {}
}
@main private enum MeetingContractChecks {
    static func main() async throws {
        let id = UUID(), requestID = UUID()
        let row: [String: Any] = ["meetingId": id.uuidString, "title": "이어갈 회의", "scope": "personal", "ownerId": "eevee", "reviewers": [], "mode": "chat", "revision": 3, "state": "open", "createdAt": "2026-10-04T01:00:00Z", "updatedAt": "2026-10-04T01:00:00Z", "sourceTask": NSNull(), "decisionContext": NSNull(), "turnCount": 0]
        let listTransport = try MeetingTransport(["status": "ready", "meetings": [row], "nextCursor": NSNull()])
        let list = try await HubAPI(transport: listTransport).officeMeetings(scope: .personal)
        try requireMeeting(list.count == 1 && list[0].meetingId == id, "list decodes durable identity")
        let calls = await listTransport.calls
        try requireMeeting(calls.first?.0 == "/api/hub/office/meetings?scope=personal&limit=20", "list uses explicit lane")
        let detailTransport = try MeetingTransport(["status": "ready", "persisted": true, "meeting": row, "turns": [], "skillRequests": []])
        let api = HubAPI(transport: detailTransport)
        let detail = try await api.officeMeeting(id: id)
        try requireMeeting(detail.meeting.revision == 3, "detail retains concurrency revision")
        _ = try await api.createOfficeMeeting(id: id, title: "이어갈 회의", scope: .personal, owner: .eevee, sourceTaskID: nil)
        let turnTransport = try MeetingTransport(["status": "generated", "persisted": true, "meeting": row, "turns": [], "skillRequests": []])
        _ = try await HubAPI(transport: turnTransport).sendOfficeMeeting(id: id, requestID: requestID, revision: 3, message: "다음 질문")
        let bodies = await turnTransport.calls
        let sent = try JSONSerialization.jsonObject(with: bodies[0].2!) as! [String: Any]
        try requireMeeting(sent["requestId"] as? String == requestID.uuidString.lowercased() && sent["expectedRevision"] as? Int == 3, "turn carries stable request ID and revision")
        try requireMeeting(sent["history"] == nil && sent["sourceTask"] == nil && sent["message"] as? String == "다음 질문", "server owns history and task provenance")
        let link = try detail.meeting.hubURL(baseURL: "https://hub.example")
        let components = URLComponents(url: link, resolvingAgainstBaseURL: false)!
        try requireMeeting(components.path == "/dashboard/agents/office-council" && components.queryItems?.first?.value == id.uuidString.lowercased(), "Hub resumes same meeting")
        for status in ["running", "unknown", "error", "preview"] {
            let rejected = try HubAPI(transport: MeetingTransport(["status": status, "meetings": []]))
            do { _ = try await rejected.officeMeetings(scope: .personal); throw NSError(domain: "ExpectedFailure", code: 1) }
            catch is OfficeChatError {} catch is HubTransportError {} catch { throw error }
        }
        let generatedRound: [String: Any] = ["id": requestID.uuidString, "roundNumber": 1, "state": "generated", "request": ["message": "질문", "ownerId": "eevee", "mode": "chat"], "result": ["answer": "저장된 답", "nextAction": "확인", "ownerId": "eevee", "scope": "personal", "mode": "chat"]]
        let errorRound: [String: Any] = ["id": UUID().uuidString, "roundNumber": 2, "state": "error", "request": ["message": "후속 질문", "ownerId": "eevee", "mode": "chat"], "result": ["status": "error", "error": "office-generation-failed"]]
        let failedHistory = try MeetingTransport(["status": "ready", "persisted": true, "meeting": row, "turns": [generatedRound, errorRound]])
        let restored = try await HubAPI(transport: failedHistory).officeMeeting(id: id)
        try requireMeeting(restored.turns.count == 2 && restored.turns[1].result == nil, "failed round cannot hide preceding saved history")
        for (field, value) in [("ownerId", "umbreon"), ("scope", "classin"), ("mode", "review")] {
            var invalidRound = generatedRound
            var invalidResult = generatedRound["result"] as! [String: Any]
            invalidResult[field] = value; invalidRound["result"] = invalidResult
            let invalidTransport = try MeetingTransport(["status": "ready", "persisted": true, "meeting": row, "turns": [invalidRound]])
            do { _ = try await HubAPI(transport: invalidTransport).officeMeeting(id: id); throw NSError(domain: "ExpectedAuthorityFailure", code: 1) }
            catch OfficeChatError.invalidResponse {}
        }
        let sourceID = UUID()
        _ = try await api.createOfficeMeeting(id: id, title: "할 일 회의", scope: .personal, owner: .eevee, sourceTaskID: sourceID)
        let creationCalls = await detailTransport.calls
        let creationBody = try JSONSerialization.jsonObject(with: creationCalls.last!.2!) as! [String: Any]
        try requireMeeting(creationBody["sourceTaskId"] as? String == sourceID.uuidString.lowercased() && creationBody["sourceTask"] == nil, "task handoff sends identity only for server validation")
        do { _ = try await api.officeMeetings(scope: .all); throw NSError(domain: "ExpectedLaneFailure", code: 1) }
        catch OfficeChatError.invalidInput {}
        print("PASS: Office meeting API contracts")
    }
}
