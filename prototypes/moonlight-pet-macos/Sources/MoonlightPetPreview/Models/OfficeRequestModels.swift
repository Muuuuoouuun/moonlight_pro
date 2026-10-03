import Foundation

enum OfficeRequestScope: String, CaseIterable, Codable, Identifiable, Sendable {
    case personal, classin
    var id: String { rawValue }
    var title: String { self == .personal ? "개인" : "회사" }
}

enum OfficeRequestIntent: String, Codable, Sendable {
    case weeklyReport = "weekly_report", customerReply = "customer_reply"
    var title: String { self == .weeklyReport ? "주간 정리" : "고객 답장 초안" }
}

enum OfficeRequestState: String, Codable, Sendable {
    case running, generated, unknown, error, expired
    var statusLabel: String {
        switch self {
        case .running: return "생성 중"
        case .generated: return "결과 도착"
        case .unknown, .error: return "확인 필요"
        case .expired: return "본문 보관 종료"
        }
    }
}

// Legacy durable receipts can contain "answer"; preserve the stored mode when
// checking the artifact instead of treating it as a newer chat response.
enum OfficeRequestMode: String, Codable, Sendable { case chat, draft, review, council, answer }
enum OfficeRequestEntityType: String, Codable, Sendable {
    case lead, customerAccount = "customer_account", deal
    var title: String {
        switch self {
        case .lead: return "잠재 고객"
        case .customerAccount: return "고객"
        case .deal: return "거래"
        }
    }
}

enum OfficeRequestOrigin: Equatable, Sendable {
    case weekly(periodStart: String, periodEnd: String, timezone: String)
    case customer(entityType: OfficeRequestEntityType, entityId: UUID)
    var label: String {
        switch self {
        case .weekly(let start, let end, _): return "\(start) – \(end)"
        case .customer(let type, let id): return "\(type.title) · \(id.uuidString.lowercased().prefix(8))"
        }
    }
    func validate(intent: OfficeRequestIntent) throws {
        switch (intent, self) {
        case (.weeklyReport, .weekly(let start, let end, let timezone)):
            guard let startDate = OfficeRequestValidation.day(start), let endDate = OfficeRequestValidation.day(end),
                  endDate.timeIntervalSince(startDate) == 6 * 86_400,
                  !timezone.isEmpty, timezone.utf16.count <= 80, timezone == timezone.trimmingCharacters(in: .whitespacesAndNewlines),
                  TimeZone(identifier: timezone) != nil else { throw OfficeRequestError.invalidResponse }
        case (.customerReply, .customer): break
        default: throw OfficeRequestError.invalidResponse
        }
    }
}

struct OfficeRequestSummary: Identifiable, Equatable, Sendable {
    let id: UUID
    let intent: OfficeRequestIntent
    let scope: OfficeRequestScope
    let owner: OfficeAgent
    let createdAt: Date
    let origin: OfficeRequestOrigin
    let mode: OfficeRequestMode
    let participants: [OfficeAgent]
    let state: OfficeRequestState
    let expired: Bool
    var title: String { intent.title }
    var statusLabel: String { state.statusLabel }
    var originLabel: String { origin.label }
    var isReadable: Bool { state == .generated && !expired }

    init(id: UUID, intent: OfficeRequestIntent, scope: OfficeRequestScope, owner: OfficeAgent, createdAt: Date,
         origin: OfficeRequestOrigin, mode: OfficeRequestMode = .draft, participants: [OfficeAgent] = [],
         state: OfficeRequestState, expired: Bool) throws {
        try origin.validate(intent: intent)
        guard createdAt.timeIntervalSince1970.isFinite, expired == (state == .expired),
              Set(participants).count == participants.count,
              mode == .council ? (2...3).contains(participants.count) && participants.contains(owner) : participants.isEmpty else {
            throw OfficeRequestError.invalidResponse
        }
        self.id = id; self.intent = intent; self.scope = scope; self.owner = owner; self.createdAt = createdAt
        self.origin = origin; self.mode = mode; self.participants = participants; self.state = state; self.expired = expired
    }
    func matchesIdentity(of other: OfficeRequestSummary) -> Bool {
        id == other.id && intent == other.intent && scope == other.scope && owner == other.owner
            && origin == other.origin && createdAt == other.createdAt && mode == other.mode && participants == other.participants
    }
    func isOlder(than other: OfficeRequestSummary) -> Bool {
        createdAt < other.createdAt || (createdAt == other.createdAt && id.uuidString.lowercased() < other.id.uuidString.lowercased())
    }
    func isOlder(than cursor: OfficeRequestCursor) -> Bool {
        createdAt < cursor.date || (createdAt == cursor.date && id.uuidString.lowercased() < cursor.id.uuidString.lowercased())
    }
}

struct OfficeRequestCursor: Equatable, Sendable {
    let createdAt: String
    let id: UUID
    let date: Date
    init(createdAt: String, id: UUID) throws {
        guard let date = OfficeRequestValidation.timestamp(createdAt) else { throw OfficeRequestError.invalidResponse }
        self.createdAt = createdAt; self.id = id; self.date = date
    }
    func encoded() throws -> String {
        let data = try JSONSerialization.data(withJSONObject: ["createdAt": createdAt, "id": id.uuidString.lowercased()], options: [.sortedKeys])
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

struct OfficeRequestPage: Equatable, Sendable {
    let items: [OfficeRequestSummary]
    let hasMore: Bool
    let nextCursor: OfficeRequestCursor?
    func validate(scope: OfficeRequestScope, after cursor: OfficeRequestCursor?) throws {
        guard items.count <= 20, items.allSatisfy({ $0.scope == scope }), Set(items.map(\.id)).count == items.count,
              hasMore == (nextCursor != nil), !hasMore || !items.isEmpty else { throw OfficeRequestError.invalidResponse }
        for pair in zip(items, items.dropFirst()) {
            guard pair.1.isOlder(than: pair.0) else { throw OfficeRequestError.invalidResponse }
        }
        if let cursor, !items.allSatisfy({ $0.isOlder(than: cursor) }) { throw OfficeRequestError.invalidResponse }
        if let nextCursor {
            guard let last = items.last, nextCursor.id == last.id, nextCursor.date == last.createdAt else { throw OfficeRequestError.invalidResponse }
        }
    }
}

struct OfficeRequestDetail: Equatable, Sendable {
    let request: OfficeRequestSummary
    let body: String?
    func validate(for selected: OfficeRequestSummary) throws {
        guard request.matchesIdentity(of: selected) else { throw OfficeRequestError.invalidResponse }
        if request.isReadable {
            guard let body, OfficeRequestValidation.text(body, limit: 24_000) else { throw OfficeRequestError.invalidResponse }
        } else if body != nil { throw OfficeRequestError.invalidResponse }
    }
}

enum OfficeRequestError: Error, Equatable, LocalizedError {
    case invalidResponse, preview
    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Office 요청을 확인하지 못했어요. 다시 불러와 주세요."
        case .preview: return "연결된 업무 데이터가 없어요. Hub 연결 상태를 확인해 주세요."
        }
    }
}

enum OfficeRequestValidation {
    static func text(_ value: String, limit: Int) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= limit
    }
    static func uuid(_ value: String) -> UUID? {
        guard value.count == 36, let id = UUID(uuidString: value), id.uuidString.lowercased() == value.lowercased() else { return nil }
        return id
    }
    static func day(_ value: String) -> Date? {
        guard value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { return nil }
        let format = DateFormatter()
        format.calendar = Calendar(identifier: .gregorian); format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = TimeZone(secondsFromGMT: 0); format.dateFormat = "yyyy-MM-dd"; format.isLenient = false
        guard let date = format.date(from: value), format.string(from: date) == value else { return nil }
        return date
    }
    static func timestamp(_ value: String) -> Date? {
        guard value.utf16.count <= 40, value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$", options: .regularExpression) != nil,
              day(String(value.prefix(10))) != nil else { return nil }
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime]
        let zoneLength = value.hasSuffix("Z") ? 1 : 6
        guard let whole = format.date(from: String(value.prefix(19)) + String(value.suffix(zoneLength))) else { return nil }
        // ISO8601DateFormatter truncates fractions to milliseconds on macOS.
        // Postgres inbox cursors retain microseconds, which must sort before UUIDs.
        let fractionText = String(value.dropFirst(19).dropLast(zoneLength))
        if fractionText.isEmpty { return whole }
        guard let fraction = Double("0" + fractionText) else { return nil }
        return whole.addingTimeInterval(fraction)
    }
}
