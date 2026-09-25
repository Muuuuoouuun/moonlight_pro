import Foundation

enum HubDataError: Error, Equatable, LocalizedError {
    case preview, invalidResponse, conflict, invalidTask, invalidMemo, unverifiedSave
    var errorDescription: String? {
        switch self {
        case .preview: return "Hub 데이터 연결이 필요해요. 아직 저장되지 않았어요."
        case .invalidResponse: return "Hub 응답을 확인하지 못했어요. 다시 불러오세요."
        case .conflict: return "Hub에서 내용이 바뀌었어요. 입력은 보관했으니 Hub에서 확인해 주세요."
        case .invalidTask: return "할 일은 1~300자로 적어 주세요."
        case .invalidMemo: return "메모는 1~20,000자로 적어 주세요."
        case .unverifiedSave: return "저장 결과 확인이 필요해요. 같은 요청으로 다시 시도할 수 있어요."
        }
    }
}

struct HubTask: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let title: String
    let status: String
    let updatedAt: String?
    var isDone: Bool { status == "done" }
    var local: LocalTask { LocalTask(id: id, title: title, isDone: isDone) }
    enum CodingKeys: String, CodingKey { case id, title, status, updatedAt, updated_at }
    init(id: UUID, title: String, status: String, updatedAt: String?) {
        self.id = id; self.title = title; self.status = status; self.updatedAt = updatedAt
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        status = try c.decode(String.self, forKey: .status)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? c.decodeIfPresent(String.self, forKey: .updated_at)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(title, forKey: .title)
        try c.encode(status, forKey: .status); try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
    }
}

struct HubTaskPage: Sendable { let tasks: [HubTask]; let partial: Bool }
struct HubCalendarPage: Sendable { let events: [HubCalendarEvent]; let partial: Bool }

struct HubTaskCommand: Codable, Equatable, Sendable {
    let id: String
    let title: String
    let status = "todo"
    let source = "desktop-pet"
    init(title: String) { id = UUID().uuidString.lowercased(); self.title = title }
    // Constant fields are encoded but need not be decoded from pending storage.
    enum CodingKeys: String, CodingKey { case id, title, status, source }
}

indirect enum HubJSON: Codable, Equatable, Sendable {
    case string(String), number(Double), bool(Bool), array([HubJSON]), object([String: HubJSON]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let x = try? c.decode(Bool.self) { self = .bool(x) }
        else if let x = try? c.decode(String.self) { self = .string(x) }
        else if let x = try? c.decode(Double.self) { self = .number(x) }
        else if let x = try? c.decode([HubJSON].self) { self = .array(x) }
        else { self = .object(try c.decode([String: HubJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .string(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .bool(let x): try c.encode(x)
        case .array(let x): try c.encode(x)
        case .object(let x): try c.encode(x)
        }
    }
}

struct HubMemoContext: Codable, Equatable, Sendable { let type: String; let id: String }
struct HubMemoEntry: Codable, Equatable, Sendable {
    let id: UUID
    let body: String
    let title: String
    let occurredAt: String
    let revision: Int
    let noteMeta: [String: HubJSON]
    let contexts: [HubMemoContext]
}
struct HubMemoCommand: Codable, Equatable, Sendable {
    let action: String
    let requestId: String
    let entryId: String
    let expectedRevision: Int
    let body: String
    let title: String
    let occurredAt: String
    let noteMeta: [String: HubJSON]
    let contexts: [HubMemoContext]
    init(body: String, previous: HubMemoEntry?) {
        action = "save"; requestId = UUID().uuidString.lowercased()
        entryId = (previous?.id ?? UUID()).uuidString.lowercased()
        expectedRevision = previous?.revision ?? 0
        self.body = body; title = previous?.title ?? ""
        occurredAt = previous?.occurredAt ?? ISO8601DateFormatter().string(from: Date())
        noteMeta = previous?.noteMeta ?? ["kind": .string("note"), "enhancement": .string("")]
        contexts = previous?.contexts ?? []
    }
}

struct HubPendingState: Codable {
    var task: HubTaskCommand?
    var memo: HubMemoCommand?
    var savedMemo: HubMemoEntry?
}

struct HubCalendarEvent: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let start: Date
    let end: Date?
    let allDay: Bool
    let location: String?

    init(id: String, title: String, startText: String, endText: String?, allDay: Bool, location: String?, calendar: Calendar = .current) throws {
        self.id = id; self.title = title; self.allDay = allDay; self.location = location
        guard let parsed = Self.parse(startText, allDay: allDay, calendar: calendar) else { throw HubDataError.invalidResponse }
        start = parsed
        if let endText, !endText.isEmpty {
            guard let parsedEnd = Self.parse(endText, allDay: allDay, calendar: calendar) else { throw HubDataError.invalidResponse }
            end = parsedEnd
        } else { end = nil }
    }

    func occurs(on date: Date, calendar: Calendar = .current) -> Bool {
        let day = calendar.startOfDay(for: date)
        guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { return false }
        let finish = end ?? (allDay ? calendar.date(byAdding: .day, value: 1, to: start)! : start)
        return start < next && (finish > day || (finish == start && start >= day))
    }
    var timeLabel: String {
        if allDay { return "종일" }
        let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "HH:mm"
        return f.string(from: start)
    }
    private static func parse(_ text: String, allDay: Bool, calendar: Calendar) -> Date? {
        if allDay {
            let parts = text.prefix(10).split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = f.date(from: text) { return date }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: text)
    }
}
