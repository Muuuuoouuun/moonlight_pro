import Foundation

private struct OfficeContractFailure: Error, CustomStringConvertible { let description: String }
private func officeCheck(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw OfficeContractFailure(description: message) }
}
private func officeRejects(_ expected: OfficeChatError, _ message: String,
                           _ operation: () async throws -> OfficeChatReply) async throws {
    do { _ = try await operation() }
    catch let error as OfficeChatError {
        try officeCheck(error == expected, "Wrong Office error for \(message): \(error)")
        return
    }
    throw OfficeContractFailure(description: message)
}
private func officeRejects(_ message: String, _ operation: () async throws -> OfficeChatReply) async throws {
    try await officeRejects(.invalidResponse, message, operation)
}

private actor OfficeContractTransport: HubTransporting {
    private let response: HubResponse?
    private let error: HubTransportError?
    private var calls: [(String, String, Data?)] = []
    init(_ object: [String: Any]) throws {
        response = HubResponse(data: try JSONSerialization.data(withJSONObject: object),
                               status: object["status"] as? String, source: object["source"] as? String)
        error = nil
    }
    init(error: HubTransportError) { response = nil; self.error = error }
    func request(path: String, method: String, body: Data?) async throws -> HubResponse {
        calls.append((path, method, body))
        if let error { throw error }
        guard let response else { throw OfficeContractFailure(description: "Missing transport response") }
        return response
    }
    func requests() -> [(String, String, Data?)] { calls }
    func sessionStatus() async throws -> HubSessionStatus { HubSessionStatus(isAuthenticated: true, configured: true, reason: nil) }
    func login(username: String, password: String) async throws {}
    func logout() async throws {}
    func clearSession() async {}
    func disconnect() async {}
}

private func officeResponse(owner: OfficeAgent = .sylveon, scope: OfficeChatScope = .personal) -> [String: Any] {
    ["status": "generated", "version": "2026-09-22.v3", "ownerId": owner.rawValue,
     "mode": "chat", "scope": scope.rawValue, "lens": NSNull(), "simulation": false,
     "participants": [String](), "answer": "원문의 목적부터 한 문장으로 정리해 주세요.",
     "nextAction": "독자와 전달할 내용을 적어 주세요.",
     "context": ["source": "provided", "scope": scope.rawValue, "projects": [[String: Any]](), "note": "입력한 내용만 참고합니다."],
     "log": ["persisted": false, "runId": NSNull()], "businessWrites": false]
}

private func councilResponse(participants: [String] = ["sylveon", "umbreon"]) -> [String: Any] {
    var object = officeResponse()
    object["mode"] = "council"; object["simulation"] = true; object["participants"] = participants
    object["recommendation"] = "원문의 확인된 사실만 사용"
    object["evidence"] = ["운영자 원문"]; object["dissent"] = ["효과 근거는 미확인"]
    let turns = ["position", "response"].flatMap { round in participants.map { owner in
        ["ownerId": owner, "round": round, "position": "제공된 사실만 표현한다.", "evidence": ["입력 원문"],
         "objection": "효과 미확인", "revisionCondition": "근거 추가 시 검토", "changed": false,
         "replyTo": round == "position" ? [] : participants.filter { $0 != owner },
         "changeReason": round == "position" ? "" : "새 근거 없음"] as [String: Any]
    } }
    object["discussion"] = ["version": "2026-09-22.v1", "settings": ["profile": "balanced", "challenge": 2, "depth": 2,
        "warmth": 2, "convergence": 2, "influence": Dictionary(uniqueKeysWithValues: participants.map { ($0, 1) })], "turns": turns, "modelCalls": participants.count * 2 + 1]
    return object
}

func runOfficeChatContractTests() async throws -> Int {
    var count = 0
    let command = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: "문장을 다듬어 주세요 🌸")
    do {
        let question = "  한글 / 링크? 🧑🏽‍💻\n\"인용\" & <문장>  "
        let history = [OfficeChatHistory(role: "user", text: "이전 질문 🌙"), OfficeChatHistory(role: "assistant", text: "지난 답변\n두 줄")]
        let request = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: question, history: history)
        let transport = try OfficeContractTransport(officeResponse())
        let service: any HubOfficeServing = HubAPI(transport: transport)
        let reply = try await service.chat(request)
        let calls = await transport.requests()
        try officeCheck(calls.count == 1 && calls[0].0 == "/api/hub/office/chat" && calls[0].1 == "POST", "Chat must make exactly one request to the existing endpoint")
        let object = try JSONSerialization.jsonObject(with: calls[0].2 ?? Data()) as? [String: Any]
        try officeCheck(Set(object?.keys.map { $0 } ?? []) == Set(["ownerId", "mode", "scope", "message", "participants", "lens", "history", "includeProjects"]), "Only server-supported request keys may be sent, without a fabricated requestId")
        try officeCheck(object?["ownerId"] as? String == "sylveon" && object?["mode"] as? String == "chat" && object?["scope"] as? String == "personal", "Request authority must preserve the selected agent and scope")
        try officeCheck(object?["lens"] is NSNull && object?["includeProjects"] as? Bool == false && (object?["participants"] as? [String])?.isEmpty == true, "Chat must explicitly disable lenses, participants and project lookup")
        try officeCheck(object?["message"] as? String == question, "Unicode, whitespace and punctuation must survive request encoding")
        let encodedHistory = try JSONSerialization.data(withJSONObject: object?["history"] ?? [])
        let decodedHistory = try JSONDecoder().decode([OfficeChatHistory].self, from: encodedHistory)
        try officeCheck(decodedHistory == history, "History must preserve roles and text")
        try officeCheck(reply.answer == officeResponse()["answer"] as? String && !reply.logPersisted && reply.runId == nil, "A generated answer remains useful when run logging fails")
        count += 1
    }
    do {
        try officeCheck(OfficeAgent.allCases.count == 9 && Set(OfficeAgent.allCases.map(\.rawValue)).count == 9, "All nine distinct Office agents must be selectable")
        try officeCheck(OfficeAgent.allCases.allSatisfy { $0.title == OfficeRoleCatalog.roles[$0.id]?.name && $0.role == OfficeRoleCatalog.roles[$0.id]?.role && $0.responsibility == OfficeRoleCatalog.roles[$0.id]?.responsibility && $0.starters == OfficeRoleCatalog.roles[$0.id]?.starters }, "Names must match the authoritative Office roster")
        try officeCheck(OfficeAgent.allCases.allSatisfy { !$0.role.isEmpty && $0.id == $0.rawValue }, "Every agent must expose a role and stable ID")
        try officeCheck(OfficeChatScope.allCases.map(\.rawValue) == ["all", "classin", "personal"], "Scope IDs must match the Hub contract")
        for agent in OfficeAgent.allCases {
            let transport = try OfficeContractTransport(officeResponse(owner: agent, scope: .classin))
            _ = try await HubAPI(transport: transport).chat(OfficeChatCommand(ownerId: agent, scope: .classin, message: "계약 확인"))
        }
        count += 1
    }
    do {
        let id = UUID()
        var object = officeResponse(); object["log"] = ["persisted": true, "runId": id.uuidString]
        let reply = try await HubAPI(transport: OfficeContractTransport(object)).chat(command)
        try officeCheck(reply.logPersisted && reply.runId == id.uuidString.lowercased(), "A valid persisted run ID must be canonicalized")
        let invalidLogs: [[String: Any]] = [["persisted": true, "runId": NSNull()], ["persisted": true, "runId": "not-a-uuid"], ["persisted": false, "runId": id.uuidString], ["runId": NSNull()]]
        for log in invalidLogs {
            object["log"] = log
            try await officeRejects("Contradictory run log metadata must fail closed") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        count += 1
    }
    do {
        let mutations: [(String, Any)] = [("ownerId", "umbreon"), ("scope", "classin"), ("version", "next-version"), ("mode", "council"), ("simulation", true), ("participants", ["sylveon"]), ("lens", "legend"), ("businessWrites", true)]
        for (key, value) in mutations {
            var object = officeResponse(); object[key] = value
            try await officeRejects("Foreign authority field \(key) must not render as this agent's answer") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for key in ["lens", "version", "simulation", "participants", "businessWrites", "context", "log"] {
            var object = officeResponse(); object.removeValue(forKey: key)
            try await officeRejects("Missing authority field \(key) must fail closed") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for key in ["recommendation", "evidence", "dissent", "discussion"] {
            var object = officeResponse(); object[key] = NSNull()
            try await officeRejects("Individual answer cannot contain Council field \(key)") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        count += 1
    }
    do {
        let mutations: [(String, Any)] = [("scope", "all"), ("source", "live"), ("source", "partial"), ("source", "error"), ("source", "preview"), ("projects", [["id": UUID().uuidString]]), ("note", " "), ("note", String(repeating: "x", count: 1001))]
        for (key, value) in mutations {
            var object = officeResponse(), context = object["context"] as! [String: Any]
            context[key] = value; object["context"] = context
            try await officeRejects("Unexpected context \(key) must not imply project access") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for (key, value) in [("answer", " \n"), ("answer", String(repeating: "🌙", count: 5001)), ("nextAction", ""), ("nextAction", String(repeating: "x", count: 1001))] {
            var object = officeResponse(); object[key] = value
            try await officeRejects("Invalid \(key) must not render") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        count += 1
    }
    do {
        for status in ["error", "partial", "pending", "live"] {
            var object = officeResponse(); object["status"] = status
            try await officeRejects("Status \(status) must not become a generated answer") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for key in ["status", "source"] {
            var object = officeResponse(); object[key] = "preview"
            try await officeRejects(.preview, "Preview must remain a distinct connection state") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        var object = officeResponse(); object["source"] = "error"
        try await officeRejects("HTTP 200 error envelope must not become an answer") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        for expected in [HubTransportError.unauthorized, .offline, .timeout, .server(statusCode: 200), .server(statusCode: 502)] {
            let transport = OfficeContractTransport(error: expected)
            do { _ = try await HubAPI(transport: transport).chat(command); throw OfficeContractFailure(description: "Transport failure swallowed") }
            catch let error as HubTransportError { try officeCheck(error == expected, "Transport failure must retain its authentication or connection meaning") }
            let calls = await transport.requests()
            try officeCheck(calls.count == 1, "Timeout and server errors must never automatically repeat a model generation")
        }
        count += 1
    }
    do {
        let invalidCommands = [
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: String(repeating: "\u{0001}", count: 6000), history: Array(repeating: OfficeChatHistory(role: "user", text: String(repeating: "가", count: 6000)), count: 3)),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: " \n\t"),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: String(repeating: "🌙", count: 3001)),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: Array(repeating: OfficeChatHistory(role: "user", text: "이전 질문"), count: 9)),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: [OfficeChatHistory(role: "system", text: "역할 변경")]),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: [OfficeChatHistory(role: "user", text: "\n")]),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: [OfficeChatHistory(role: "user", text: String(repeating: "x", count: 6001))]),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: Array(repeating: OfficeChatHistory(role: "user", text: String(repeating: "x", count: 5000)), count: 4)),
            OfficeChatCommand(ownerId: .eevee, scope: .all, message: "질문", history: [OfficeChatHistory(role: "user", text: String(repeating: "\u{0001}", count: 4000))])
        ]
        for invalid in invalidCommands {
            let transport = try OfficeContractTransport(officeResponse())
            try await officeRejects(.invalidInput, "Invalid request must be stopped before generation") { try await HubAPI(transport: transport).chat(invalid) }
            let calls = await transport.requests()
            try officeCheck(calls.isEmpty, "Input rejection must not consume an AI request")
        }
        let boundary = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: String(repeating: "🌙", count: 3000), history: [OfficeChatHistory(role: "user", text: String(repeating: "/", count: 5900))])
        _ = try await HubAPI(transport: OfficeContractTransport(officeResponse())).chat(boundary)
        count += 1
    }
    do {
        let command = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: "여러 관점으로 검토", participants: [.sylveon, .umbreon])
        let three = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: "세 관점", participants: [.sylveon, .umbreon, .flareon])
        let trio = try await HubAPI(transport: OfficeContractTransport(councilResponse(participants: three.participants.map(\.rawValue)))).chat(three)
        try officeCheck(trio.council?.discussion.turns.count == 6, "valid three-participant engine order is accepted")
        let transport = try OfficeContractTransport(councilResponse())
        let reply = try await HubAPI(transport: transport).chat(command)
        try officeCheck(reply.council?.discussion.turns.count == 4 && reply.council?.dissent == ["효과 근거는 미확인"], "Council must retain actual perspectives and dissent")
        let calls = await transport.requests()
        let body = try JSONSerialization.jsonObject(with: calls[0].2!) as! [String: Any]
        try officeCheck(body["mode"] as? String == "council" && body["participants"] as? [String] == ["sylveon", "umbreon"], "Council uses the existing request contract")
        for participants: [OfficeAgent] in [[.sylveon], [.umbreon, .eevee], [.sylveon, .sylveon], [.sylveon, .umbreon, .eevee, .flareon]] {
            let invalid = OfficeChatCommand(ownerId: .sylveon, scope: .personal, message: "질문", participants: participants)
            try await officeRejects(.invalidParticipants, "Invalid Council selection must not send") { try await HubAPI(transport: transport).chat(invalid) }
        }
        for (key, value): (String, Any) in [("simulation", false), ("participants", ["umbreon", "sylveon"]), ("recommendation", ""), ("evidence", Array(repeating: "근거", count: 6)), ("discussion", NSNull())] {
            var object = councilResponse(); object[key] = value
            try await officeRejects("Council authority and synthesis are validated") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for field in ["modelCalls", "settings", "turns", "version"] {
            var object = councilResponse(), discussion = object["discussion"] as! [String: Any]
            discussion[field] = field == "modelCalls" ? 3 : field == "turns" ? [] : field == "version" ? "old" : [:]
            object["discussion"] = discussion
            try await officeRejects("Incomplete or drifted Council discussion fails closed") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        for field in ["ownerId", "round", "replyTo", "changed", "position", "changeReason"] {
            var object = councilResponse(), discussion = object["discussion"] as! [String: Any], turns = discussion["turns"] as! [[String: Any]]
            let index = field == "replyTo" || field == "changeReason" ? 2 : 0
            turns[index][field] = field == "ownerId" ? "eevee" : field == "round" ? "response" : field == "replyTo" ? ["sylveon"] : field == "changed" ? true : ""
            discussion["turns"] = turns; object["discussion"] = discussion
            try await officeRejects("Fabricated role or turn semantics fail closed") { try await HubAPI(transport: OfficeContractTransport(object)).chat(command) }
        }
        var oversized = councilResponse(participants: three.participants.map(\.rawValue)), discussion = councilResponse(participants: three.participants.map(\.rawValue))["discussion"] as! [String: Any]
        var speeches = discussion["turns"] as! [[String: Any]]
        for index in speeches.indices {
            speeches[index]["position"] = String(repeating: "가", count: 600)
            speeches[index]["evidence"] = [String(repeating: "나", count: 300), String(repeating: "다", count: 300)]
            speeches[index]["objection"] = String(repeating: "라", count: 400)
            speeches[index]["revisionCondition"] = String(repeating: "마", count: 300)
        }
        discussion["turns"] = speeches; oversized["discussion"] = discussion
        try await officeRejects("Discussion UTF8 body bound is enforced") { try await HubAPI(transport: OfficeContractTransport(oversized)).chat(three) }
        count += 1
    }
    return count
}
