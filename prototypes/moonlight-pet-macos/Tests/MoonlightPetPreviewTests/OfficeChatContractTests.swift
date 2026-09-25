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
}

private func officeResponse(owner: OfficeAgent = .sylveon, scope: OfficeChatScope = .personal) -> [String: Any] {
    ["status": "generated", "version": "2026-09-22.v3", "ownerId": owner.rawValue,
     "mode": "chat", "scope": scope.rawValue, "lens": NSNull(), "simulation": false,
     "participants": [String](), "answer": "원문의 목적부터 한 문장으로 정리해 주세요.",
     "nextAction": "독자와 전달할 내용을 적어 주세요.",
     "context": ["source": "provided", "scope": scope.rawValue, "projects": [[String: Any]](), "note": "입력한 내용만 참고합니다."],
     "log": ["persisted": false, "runId": NSNull()], "businessWrites": false]
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
        try officeCheck(OfficeAgent.allCases.map(\.title) == ["이브이", "샤미드", "쥬피썬더", "부스터", "에브이", "블래키", "리피아", "글레이시아", "님피아"], "Names must match the authoritative Office roster")
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
    return count
}
