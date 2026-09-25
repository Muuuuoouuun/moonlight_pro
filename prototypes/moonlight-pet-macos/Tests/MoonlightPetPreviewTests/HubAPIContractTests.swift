import Foundation

private struct HubContractFailure: Error, CustomStringConvertible {
    let description: String
}

private func contractCheck(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw HubContractFailure(description: message) }
}

private func contractRejects<T>(_ message: String, _ operation: () async throws -> T) async throws {
    do {
        _ = try await operation()
    } catch is HubContractFailure {
        throw HubContractFailure(description: "\(message): test script failed")
    } catch {
        return
    }
    throw HubContractFailure(description: message)
}

private actor ScriptedHubTransport: HubTransporting {
    struct Request: Sendable {
        let path: String
        let method: String
        let body: Data?
    }
    enum Reply: Sendable {
        case response(HubResponse)
        case error(HubTransportError)
    }
    private var replies: [Reply]
    private var requests: [Request] = []

    init(_ replies: [Reply]) { self.replies = replies }

    func request(path: String, method: String, body: Data?) async throws -> HubResponse {
        requests.append(Request(path: path, method: method, body: body))
        guard !replies.isEmpty else { throw HubContractFailure(description: "Unexpected Hub request: \(method) \(path)") }
        switch replies.removeFirst() {
        case .response(let response): return response
        case .error(let error): throw error
        }
    }
    func recorded() -> [Request] { requests }
    func sessionStatus() async throws -> HubSessionStatus {
        HubSessionStatus(isAuthenticated: true, configured: true, reason: nil)
    }
    func login(username: String, password: String) async throws {}
    func logout() async throws {}
    func clearSession() async {}
}

private func contractResponse(_ json: [String: Any]) throws -> ScriptedHubTransport.Reply {
    .response(HubResponse(data: try JSONSerialization.data(withJSONObject: json), status: json["status"] as? String, source: json["source"] as? String))
}

private func requestJSON(_ request: ScriptedHubTransport.Request) throws -> [String: Any] {
    guard let body = request.body,
          let object = try JSONSerialization.jsonObject(with: body) as? [String: Any] else {
        throw HubContractFailure(description: "Expected JSON request body")
    }
    return object
}

private func taskJSON(_ id: UUID, title: String = "할 일 계약 확인", status: String = "todo", timestampKey: String = "updatedAt") -> [String: Any] {
    ["id": id.uuidString.lowercased(), "title": title, "status": status, timestampKey: "2026-09-25T01:02:03.123456+00:00"]
}

private func memoJSON(_ command: HubMemoCommand, body: String? = nil, revision: Int? = nil, id: String? = nil) throws -> [String: Any] {
    let encoded = try JSONEncoder().encode(command)
    let object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
    return ["id": id ?? command.entryId, "body": body ?? command.body, "title": command.title,
            "occurredAt": command.occurredAt, "revision": revision ?? (command.expectedRevision + 1),
            "noteMeta": object["noteMeta"]!, "contexts": object["contexts"]!]
}

/// Foundation-only suite: the macOS CLT SDK does not ship XCTest/Swift Testing.
/// All responses are scripted in memory; no Hub records or network are touched.
func runHubAPIContractTests() async throws -> Int {
    var count = 0

    // Both task read and save response shapes retain PostgreSQL microseconds.
    do {
        let id = UUID()
        for key in ["updatedAt", "updated_at"] {
            let transport = ScriptedHubTransport([try contractResponse(["status": "live", "tasks": [taskJSON(id, timestampKey: key)]])])
            let result = try await HubAPI(transport: transport).tasks()
            try contractCheck(result.tasks.count == 1 && result.tasks[0].id == id, "Live task identity must decode")
            try contractCheck(result.tasks[0].updatedAt == "2026-09-25T01:02:03.123456+00:00", "Task timestamp must preserve microseconds and offset verbatim")
            try contractCheck(!result.partial, "A complete live page cannot be marked partial")
            let request = await transport.recorded()[0]
            try contractCheck(request.path == "/api/hub/tasks" && request.method == "GET" && request.body == nil, "Task read must reuse existing GET route")
        }
        count += 1
    }

    do {
        for envelope in [["status": "partial", "tasks": []], ["status": "live", "partial": true, "tasks": []]] as [[String: Any]] {
            let transport = ScriptedHubTransport([try contractResponse(envelope)])
            let result = try await HubAPI(transport: transport).tasks()
            try contractCheck(result.partial, "Partial task results must remain distinguishable")
        }
        count += 1
    }

    do {
        for envelope in [["status": "preview", "tasks": []], ["status": "live", "source": "preview", "tasks": []], ["status": "error", "tasks": []], ["status": "unknown", "tasks": []]] as [[String: Any]] {
            let transport = ScriptedHubTransport([try contractResponse(envelope)])
            try await contractRejects("Preview/error/unknown task envelopes must not become an empty success") { try await HubAPI(transport: transport).tasks() }
        }
        // Transport owns HTTP 200 + source:error rejection. Preserve that failure.
        let transport = ScriptedHubTransport([.error(.server(statusCode: 200))])
        do { _ = try await HubAPI(transport: transport).tasks(); throw HubContractFailure(description: "Transport envelope error was swallowed") }
        catch let error as HubTransportError { try contractCheck(error == .server(statusCode: 200), "Transport error must propagate unchanged") }
        count += 1
    }

    do {
        let command = HubTaskCommand(title: "할 일 계약 확인")
        let id = UUID(uuidString: command.id)!
        for status in ["saved", "duplicate"] {
            let transport = ScriptedHubTransport([try contractResponse(["status": status, "task": taskJSON(id, timestampKey: "updated_at")])])
            let task = try await HubAPI(transport: transport).createTask(command)
            try contractCheck(task.id == id && task.title == command.title && !task.isDone, "Saved or duplicate task must match submitted identity/content")
            let request = await transport.recorded()[0]
            let body = try requestJSON(request)
            try contractCheck(request.method == "POST" && request.path == "/api/hub/tasks", "Task creation must use existing POST")
            try contractCheck(body["id"] as? String == command.id.lowercased(), "Task request UUID must be lowercase")
            try contractCheck(body["title"] as? String == command.title && body["status"] as? String == "todo" && body["source"] as? String == "desktop-pet", "Task retry payload must preserve canonical defaults")
        }
        let restored = try JSONDecoder().decode(HubTaskCommand.self, from: JSONEncoder().encode(command))
        try contractCheck(restored == command, "Task pending command must retain identity across persistence")
        count += 1
    }

    do {
        let command = HubTaskCommand(title: "할 일 계약 확인")
        let id = UUID(uuidString: command.id)!
        let badReceipts: [[String: Any]] = [
            ["status": "saved"],
            ["status": "preview", "task": taskJSON(id)],
            ["status": "saved", "task": taskJSON(UUID())],
            ["status": "saved", "task": taskJSON(id, title: "다른 내용")],
            ["status": "saved", "task": taskJSON(id, status: "done")],
        ]
        let reasons = ["missing task", "preview", "different ID", "different title", "different status"]
        for (index, receipt) in badReceipts.enumerated() {
            let transport = ScriptedHubTransport([try contractResponse(receipt)])
            try await contractRejects("Task receipt must reject: \(reasons[index])") { try await HubAPI(transport: transport).createTask(command) }
        }
        count += 1
    }

    do {
        let id = UUID(), stamp = "2026-09-25T01:02:03.123456+00:00"
        let task = HubTask(id: id, title: "할 일 계약 확인", status: "todo", updatedAt: stamp)
        let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "task": taskJSON(id, status: "done", timestampKey: "updated_at")])])
        let saved = try await HubAPI(transport: transport).setTask(task, done: true)
        try contractCheck(saved.isDone, "Task status receipt should apply requested completion")
        let request = await transport.recorded()[0], body = try requestJSON(request)
        try contractCheck(request.method == "PATCH" && request.path == "/api/hub/tasks", "Task completion must use PATCH")
        try contractCheck(body["expectedUpdatedAt"] as? String == stamp, "Optimistic lock must retain exact timestamp, including microseconds")
        try contractCheck(body["id"] as? String == id.uuidString.lowercased() && body["status"] as? String == "done", "Task status request must carry lowercase id")
        try contractCheck(body.count == 3, "Status updates must not overwrite unrelated task fields")
        count += 1
    }

    do {
        let task = HubTask(id: UUID(), title: "할 일 계약 확인", status: "todo", updatedAt: nil)
        let transport = ScriptedHubTransport([])
        try await contractRejects("Task with missing version must not write without concurrency guard") { try await HubAPI(transport: transport).setTask(task, done: true) }
        let requests = await transport.recorded()
        try contractCheck(requests.isEmpty, "Missing task version must fail before sending")
        let conflict = ScriptedHubTransport([.error(.server(statusCode: 409))])
        let versioned = HubTask(id: task.id, title: task.title, status: task.status, updatedAt: "2026-09-25T01:02:03.123456+00:00")
        try await contractRejects("409 task conflict must not become successful completion") { try await HubAPI(transport: conflict).setTask(versioned, done: true) }
        let calls = await conflict.recorded()
        try contractCheck(calls.count == 1, "Task conflict must not silently retry with a newer version")
        count += 1
    }

    do {
        let command = HubMemoCommand(body: "  원문 유지\n두 번째 줄 🌓  ", previous: nil)
        for status in ["saved", "duplicate"] {
            let entry = try memoJSON(command)
            let transport = ScriptedHubTransport([try contractResponse(["status": status, "entry": entry]), try contractResponse(["status": "live", "entry": entry])])
            let saved = try await HubAPI(transport: transport).saveMemo(command)
            try contractCheck(saved.id.uuidString.lowercased() == command.entryId && saved.body == command.body && saved.revision == 1, "Memo acknowledgement and detail read must agree")
            let requests = await transport.recorded()
            try contractCheck(requests.count == 2 && requests[0].method == "POST" && requests[0].path == "/api/hub/journal", "Memo must use journal save route")
            try contractCheck(requests[1].method == "GET" && requests[1].path == "/api/hub/journal?note=\(command.entryId)", "Memo must read back its exact journal ID")
            let body = try requestJSON(requests[0])
            try contractCheck(body["requestId"] as? String == command.requestId.lowercased() && body["entryId"] as? String == command.entryId.lowercased(), "Memo IDs must be lowercase in actual JSON")
            try contractCheck(body["body"] as? String == command.body && body["occurredAt"] as? String == command.occurredAt, "Memo submission must preserve whitespace and timestamp")
            try contractCheck(body["expectedRevision"] as? Int == 0, "New memo must require initial revision zero")
        }
        count += 1
    }

    do {
        let command = HubMemoCommand(body: "원문", previous: nil)
        let entry = try memoJSON(command)
        let badReads = [
            try memoJSON(command, body: "다른 원문"),
            try memoJSON(command, revision: 2),
            try memoJSON(command, id: UUID().uuidString.lowercased()),
        ]
        for detail in badReads {
            let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": entry]), try contractResponse(["status": "live", "entry": detail])])
            try await contractRejects("Memo readback identity, body or revision mismatch must preserve unresolved state") { try await HubAPI(transport: transport).saveMemo(command) }
        }
        for status in ["preview", "error"] {
            let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": entry]), try contractResponse(["status": status, "entry": entry])])
            try await contractRejects("Unverified memo readback must not report saved") { try await HubAPI(transport: transport).saveMemo(command) }
        }
        count += 1
    }

    do {
        let command = HubMemoCommand(body: "원문", previous: nil)
        let receipts: [[String: Any]] = [
            ["status": "saved"],
            ["status": "preview"],
            ["status": "conflict", "entry": try memoJSON(command, body: "Hub 변경")],
            ["status": "duplicate", "entry": try memoJSON(command, body: "나중에 Hub에서 수정")],
            ["status": "saved", "entry": try memoJSON(command, id: UUID().uuidString.lowercased())],
        ]
        for receipt in receipts {
            let transport = ScriptedHubTransport([try contractResponse(receipt)])
            try await contractRejects("Missing, mismatched or conflicting memo receipt must not be accepted") { try await HubAPI(transport: transport).saveMemo(command) }
            let requests = await transport.recorded()
            try contractCheck(requests.count == 1, "Invalid memo acknowledgement must fail before readback")
        }
        count += 1
    }

    do {
        let previous = HubMemoEntry(id: UUID(), body: "이전 원문", title: "기존 제목", occurredAt: "2026-09-24T03:04:05.123456+09:00", revision: 4,
                                    noteMeta: ["kind": .string("idea"), "enhancement": .string("기존 보강"), "tags": .array([.string("기록"), .string("검토")])],
                                    contexts: [HubMemoContext(type: "project", id: UUID().uuidString.lowercased())])
        let command = HubMemoCommand(body: "수정 원문", previous: previous)
        let restored = try JSONDecoder().decode(HubMemoCommand.self, from: JSONEncoder().encode(command))
        try contractCheck(restored == command, "Pending memo must retain whole immutable command across restart")
        let entry = try memoJSON(command)
        let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": entry]), try contractResponse(["status": "live", "entry": entry])])
        let saved = try await HubAPI(transport: transport).saveMemo(restored)
        let request = await transport.recorded()[0], json = try requestJSON(request)
        let actual = try JSONDecoder().decode(HubMemoCommand.self, from: request.body!)
        try contractCheck(actual.noteMeta == previous.noteMeta && actual.contexts == previous.contexts, "Editing from widget must preserve existing metadata and contexts")
        try contractCheck(actual.title == previous.title && actual.occurredAt == previous.occurredAt && actual.expectedRevision == 4, "Editing must preserve title/date and use latest known version")
        try contractCheck(actual.entryId == previous.id.uuidString.lowercased() && json["body"] as? String == "수정 원문", "Editing must target existing memo and updated body")
        try contractCheck(saved.revision == 5 && saved.noteMeta == previous.noteMeta, "Readback must carry saved revision and preserved metadata")
        count += 1
    }

    do {
        let command = HubMemoCommand(body: "원문", previous: nil)
        for badRevision in [0, -1] {
            let entry = try memoJSON(command, revision: badRevision)
            let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": entry]), try contractResponse(["status": "live", "entry": entry])])
            try await contractRejects("A nonpositive memo revision cannot prove durable save") { try await HubAPI(transport: transport).saveMemo(command) }
        }
        let previous = HubMemoEntry(id: UUID(), body: "이전 원문", title: "", occurredAt: command.occurredAt, revision: 4, noteMeta: command.noteMeta, contexts: [])
        let edit = HubMemoCommand(body: "수정", previous: previous)
        let unchanged = try memoJSON(edit, revision: 4)
        let transport = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": unchanged]), try contractResponse(["status": "live", "entry": unchanged])])
        try await contractRejects("Memo save must advance beyond expected revision") { try await HubAPI(transport: transport).saveMemo(edit) }
        count += 1
    }

    do {
        let from = ISO8601DateFormatter().date(from: "2026-09-20T15:00:00Z")!
        let to = ISO8601DateFormatter().date(from: "2026-09-27T15:00:00Z")!
        let events: [[String: Any]] = [
            ["id": "same-id", "source": "personal", "title": "개인 일정", "start": "2026-09-25T09:00:00+09:00", "end": "2026-09-25T10:00:00+09:00", "allDay": false],
            ["id": "same-id", "source": "company", "title": "업무 일정", "start": "2026-09-25T11:00:00+09:00", "end": "2026-09-25T12:00:00+09:00", "allDay": false],
        ]
        let transport = ScriptedHubTransport([try contractResponse(["status": "partial", "events": events])])
        let page = try await HubAPI(transport: transport).calendar(from: from, to: to)
        try contractCheck(page.partial && page.events.count == 2, "Calendar partial status must survive event decoding")
        try contractCheck(Set(page.events.map(\.id)).count == 2, "Different calendar sources must not collide on event IDs")
        let request = await transport.recorded()[0]
        let components = URLComponents(string: request.path)!
        let params = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        try contractCheck(request.method == "GET" && components.path == "/api/calendar/google/event", "Calendar remains read-only on existing route")
        try contractCheck(params["timeMin"] == "2026-09-20T15:00:00Z" && params["timeMax"] == "2026-09-27T15:00:00Z", "Calendar must send exact requested range")
        count += 1
    }

    do {
        let command = HubMemoCommand(body: "충돌 분류", previous: nil)
        let changed = ScriptedHubTransport([try contractResponse(["status": "duplicate", "entry": try memoJSON(command, body: "원격 변경")])])
        do {
            _ = try await HubAPI(transport: changed).saveMemo(command)
            throw HubContractFailure(description: "Changed duplicate must report a confirmed conflict")
        } catch HubDataError.conflict {}
        let unrelated = ScriptedHubTransport([try contractResponse(["status": "saved", "entry": try memoJSON(command, id: UUID().uuidString.lowercased())])])
        do {
            _ = try await HubAPI(transport: unrelated).saveMemo(command)
            throw HubContractFailure(description: "Unrelated receipt must remain unverified")
        } catch HubDataError.unverifiedSave {}
        count += 1
    }
    return count
}
