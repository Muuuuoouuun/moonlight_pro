import Foundation

protocol HubServing: Sendable {
    func login(username: String, password: String) async throws
    func tasks() async throws -> HubTaskPage
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage
    func createTask(_ command: HubTaskCommand) async throws -> HubTask
    func setTask(_ task: HubTask, done: Bool) async throws -> HubTask
    func memo(id: UUID) async throws -> HubMemoEntry
    func saveMemo(_ command: HubMemoCommand) async throws -> HubMemoEntry
}

struct HubAPI: HubServing {
    let transport: any HubTransporting
    func login(username: String, password: String) async throws {
        try await transport.login(username: username, password: password)
    }
    func tasks() async throws -> HubTaskPage {
        struct Page: Decodable { let status: String; let tasks: [HubTask]; let partial: Bool? }
        let p: Page = try await read("/api/hub/tasks")
        return HubTaskPage(tasks: p.tasks, partial: p.status == "partial" || p.partial == true)
    }
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage {
        struct Row: Decodable {
            let id: String; let title: String; let start: String; let end: String?
            let allDay: Bool; let location: String?; let source: String?
        }
        struct Page: Decodable { let status: String; let events: [Row] }
        let formatter = ISO8601DateFormatter()
        var c = URLComponents(); c.path = "/api/calendar/google/event"
        c.queryItems = [URLQueryItem(name: "timeMin", value: formatter.string(from: from)), URLQueryItem(name: "timeMax", value: formatter.string(from: to))]
        let p: Page = try await read(c.string!)
        let events = try p.events.map { row in
            try HubCalendarEvent(id: "\(row.source ?? "calendar"):\(row.id)", title: row.title, startText: row.start, endText: row.end, allDay: row.allDay, location: row.location)
        }.sorted { $0.start < $1.start }
        return HubCalendarPage(events: events, partial: p.status == "partial")
    }
    func createTask(_ command: HubTaskCommand) async throws -> HubTask {
        guard !command.title.isEmpty, command.title.utf16.count <= 300 else { throw HubDataError.invalidTask }
        let task = try await writeTask(method: "POST", body: JSONEncoder().encode(command))
        guard task.id.uuidString.lowercased() == command.id, task.title == command.title, task.status == command.status else { throw HubDataError.unverifiedSave }
        return task
    }
    func setTask(_ task: HubTask, done: Bool) async throws -> HubTask {
        guard let stamp = task.updatedAt, !stamp.isEmpty else { throw HubDataError.conflict }
        let data = try JSONSerialization.data(withJSONObject: ["id": task.id.uuidString.lowercased(), "status": done ? "done" : "todo", "expectedUpdatedAt": stamp])
        let saved = try await writeTask(method: "PATCH", body: data)
        guard saved.id == task.id, saved.isDone == done else { throw HubDataError.unverifiedSave }
        return saved
    }
    func memo(id: UUID) async throws -> HubMemoEntry {
        struct Page: Decodable { let entry: HubMemoEntry? }
        let page: Page = try await read("/api/hub/journal?note=\(id.uuidString.lowercased())")
        guard let entry = page.entry, entry.id == id else { throw HubDataError.unverifiedSave }
        return entry
    }
    func saveMemo(_ command: HubMemoCommand) async throws -> HubMemoEntry {
        guard !command.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              command.body.utf16.count <= 20_000 else { throw HubDataError.invalidMemo }
        let response = try await transport.request(path: "/api/hub/journal", method: "POST", body: JSONEncoder().encode(command))
        try requireSaved(response)
        struct Receipt: Decodable { let entry: HubMemoEntry? }
        let receipt = try JSONDecoder().decode(Receipt.self, from: response.data)
        guard let written = receipt.entry, written.id.uuidString.lowercased() == command.entryId,
              written.body == command.body, written.revision >= command.expectedRevision + 1 else { throw HubDataError.conflict }
        let verified = try await memo(id: written.id)
        guard verified.body == command.body, verified.revision == written.revision else { throw HubDataError.conflict }
        return verified
    }
    private func writeTask(method: String, body: Data) async throws -> HubTask {
        let r = try await transport.request(path: "/api/hub/tasks", method: method, body: body)
        try requireSaved(r)
        struct Receipt: Decodable { let task: HubTask? }
        guard let task = try JSONDecoder().decode(Receipt.self, from: r.data).task else { throw HubDataError.unverifiedSave }
        return task
    }
    private func read<T: Decodable>(_ path: String) async throws -> T {
        let r = try await transport.request(path: path, method: "GET", body: nil)
        if r.isPreview { throw HubDataError.preview }
        guard r.status == "live" || r.status == "partial" else { throw HubDataError.invalidResponse }
        return try JSONDecoder().decode(T.self, from: r.data)
    }
    private func requireSaved(_ r: HubResponse) throws {
        if r.isPreview { throw HubDataError.preview }
        guard r.status == "saved" || r.status == "duplicate" else { throw HubDataError.unverifiedSave }
    }
}
