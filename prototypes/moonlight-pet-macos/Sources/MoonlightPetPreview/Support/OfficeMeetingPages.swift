import Foundation
import CryptoKit

/// Wire limits match the v1 producer in apps/hub/lib/office/meeting-pages.js.
/// No partial buffers survive an operation. A manual reload starts at page zero.
enum OfficeMeetingPageLimits {
    static let envelopeBytes = 262_144
    static let chunkBytes = 180_224
    static let totalBytes = 256 * 1024 * 1024
    static let pages = 2048
    static let turns = 1000
    static let seconds: TimeInterval = 120
}

enum OfficeMeetingReadError: Error, Equatable, LocalizedError {
    case invalidPage, snapshotChanged, snapshotExpired, resourceLimit, timeout
    var errorDescription: String? {
        switch self {
        case .snapshotChanged: return "읽는 동안 회의 기록이 바뀌었어요. 다시 불러와 주세요."
        case .snapshotExpired: return "회의 조회 시간이 만료됐어요. 다시 불러와 주세요."
        case .resourceLimit: return "회의 기록의 조회 한도를 넘었어요. 기존 기록과 입력은 보관돼요."
        case .timeout: return "회의 기록을 끝까지 읽지 못했어요. 다시 불러와 주세요."
        case .invalidPage: return "회의 기록 전체를 확인하지 못했어요. 다시 불러와 주세요."
        }
    }
}

enum OfficeMeetingDeadline {
    static func run<T: Sendable>(seconds: TimeInterval = OfficeMeetingPageLimits.seconds,
                                work: @escaping @Sendable (Date) async throws -> T) async throws -> T {
        guard seconds > 0, seconds <= OfficeMeetingPageLimits.seconds else { throw OfficeMeetingReadError.resourceLimit }
        try Task.checkCancellation()
        let deadline = Date().addingTimeInterval(seconds)
        return try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                let result = try await work(deadline)
                try Task.checkCancellation()
                guard Date() < deadline else { throw OfficeMeetingReadError.timeout }
                return result
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw OfficeMeetingReadError.timeout
            }
            defer { group.cancelAll() }
            guard let result = try await group.next() else { throw CancellationError() }
            return result
        }
    }
}

struct OfficeMeetingUnresolved: Decodable, Sendable, Equatable {
    let running: Int
    let unknown: Int
    let total: Int
    let observedAt: String
}

struct OfficeMeetingRestoration: Sendable {
    let snapshotID: String
    let observedAt: String
    let expiresAt: String
    let pageCount: Int
    let totalBytes: Int
    let totalTurns: Int
}

/// Admission applies across all HubAPI values and origins. These are payload
/// budgets, not a claim about peak RSS (Data/JSON/display projections coexist).
actor OfficeMeetingReadBudget {
    static let shared = OfficeMeetingReadBudget()
    private var leases: [UUID: Int] = [:]
    func acquire() throws -> UUID {
        guard leases.count < 3 else { throw OfficeMeetingReadError.resourceLimit }
        let id = UUID(); leases[id] = 0; return id
    }
    func reserve(_ bytes: Int, for id: UUID) throws {
        guard let current = leases[id], bytes >= current, bytes <= OfficeMeetingPageLimits.totalBytes,
              leases.values.reduce(0, +) - current <= OfficeMeetingPageLimits.totalBytes - bytes else {
            throw OfficeMeetingReadError.resourceLimit
        }
        leases[id] = bytes
    }
    func release(_ id: UUID) { leases.removeValue(forKey: id) }
}

struct OfficeMeetingPageAssembly {
    private struct Envelope: Decodable { let status: String; let persisted: Bool; let historyComplete: Bool; let page: Page; let unresolved: OfficeMeetingUnresolved }
    private struct Page: Decodable {
        let version: Int; let meetingId: String; let scope: String
        let binding: String; let snapshotId: String; let payloadHash: String
        let observedAt: String; let expiresAt: String
        let index: Int; let pageCount: Int; let totalBytes: Int; let totalTurns: Int
        let offset: Int; let chunkBytes: Int; let chunkHash: String; let encoding: String; let data: String; let nextCursor: String?
    }
    private let id: String
    private let scope: String
    private var first: Page?
    private(set) var unresolved: OfficeMeetingUnresolved?
    private(set) var nextCursor: String?
    private(set) var verifiedPages = 0
    private var cursors = Set<String>()
    private var body = Data()
    var totalBytes: Int? { first?.totalBytes }
    var restoration: OfficeMeetingRestoration? {
        first.map { OfficeMeetingRestoration(snapshotID: $0.snapshotId, observedAt: $0.observedAt, expiresAt: $0.expiresAt,
                                             pageCount: $0.pageCount, totalBytes: $0.totalBytes, totalTurns: $0.totalTurns) }
    }
    init(id: UUID, scope: OfficeChatScope) { self.id = id.uuidString.lowercased(); self.scope = scope.rawValue }
    func validateCompletion(now: Date = Date()) throws {
        try Task.checkCancellation()
        guard let first, verifiedPages == first.pageCount, nextCursor == nil,
              let expires = Self.date(first.expiresAt), now < expires else { throw OfficeMeetingReadError.snapshotExpired }
    }

    static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    static func isUTF8JSON(_ data: Data) -> Bool {
        // Foundation auto-detects UTF16/32. Raw NUL is illegal in UTF8 JSON,
        // while an escaped \\u0000 remains valid and must be preserved.
        !data.contains(0) && !data.starts(with: [0xef, 0xbb, 0xbf]) && String(data: data, encoding: .utf8) != nil
    }
    private static func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
    private static func date(_ value: String) -> Date? {
        guard matches(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$") else { return nil }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
        return date
    }
    static func advertisedBytes(_ data: Data) throws -> Int {
        struct Size: Decodable { struct Page: Decodable { let totalBytes: Int }; let page: Page }
        let size = try JSONDecoder().decode(Size.self, from: data).page.totalBytes
        guard (1...OfficeMeetingPageLimits.totalBytes).contains(size) else { throw OfficeMeetingReadError.resourceLimit }
        return size
    }
    static func checkError(_ data: Data) throws {
        guard isUTF8JSON(data) else { throw OfficeMeetingReadError.invalidPage }
        struct Failure: Decodable { let status: String?; let source: String?; let error: String? }
        let value = try JSONDecoder().decode(Failure.self, from: data)
        guard value.status == "error" || value.source == "error" else { return }
        switch value.error {
        case "office-meeting-snapshot-changed": throw OfficeMeetingReadError.snapshotChanged
        case "office-meeting-snapshot-expired": throw OfficeMeetingReadError.snapshotExpired
        case "office-meeting-turn-limit", "office-meeting-restoration-limit": throw OfficeMeetingReadError.resourceLimit
        default: throw OfficeMeetingReadError.invalidPage
        }
    }

    mutating func accept(_ data: Data, now: Date = Date()) throws -> Data? {
        try Task.checkCancellation()
        guard data.count <= OfficeMeetingPageLimits.envelopeBytes else { throw OfficeMeetingReadError.resourceLimit }
        guard Self.isUTF8JSON(data) else { throw OfficeMeetingReadError.invalidPage }
        try Self.checkError(data)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pageObject = object["page"] as? [String: Any], pageObject.keys.contains("nextCursor") else {
            throw OfficeMeetingReadError.invalidPage
        }
        let envelope: Envelope
        do { envelope = try JSONDecoder().decode(Envelope.self, from: data) } catch { throw OfficeMeetingReadError.invalidPage }
        let p = envelope.page, u = envelope.unresolved
        let limit = OfficeMeetingPageLimits.self
        guard envelope.status == "ready", envelope.persisted, !envelope.historyComplete,
              p.version == 1, p.meetingId == id, p.scope == scope,
              [p.binding, p.snapshotId, p.payloadHash, p.chunkHash].allSatisfy({ Self.matches($0, "^[a-f0-9]{64}$") }),
              (1...limit.totalBytes).contains(p.totalBytes), (1...limit.pages).contains(p.pageCount),
              p.pageCount == (p.totalBytes + limit.chunkBytes - 1) / limit.chunkBytes,
              (0...limit.turns).contains(p.totalTurns), p.index == verifiedPages, p.index < p.pageCount,
              p.offset == verifiedPages * limit.chunkBytes, p.offset < p.totalBytes,
              p.chunkBytes == min(limit.chunkBytes, p.totalBytes - p.offset), p.encoding == "base64",
              let observed = Self.date(p.observedAt), let expires = Self.date(p.expiresAt),
              abs(expires.timeIntervalSince(observed) - 300) < 0.001, observed <= now.addingTimeInterval(30),
              (0...p.totalTurns).contains(u.running), (0...p.totalTurns).contains(u.unknown),
              u.total == u.running + u.unknown, u.total <= p.totalTurns, u.observedAt == p.observedAt else { throw OfficeMeetingReadError.invalidPage }
        guard now < expires else { throw OfficeMeetingReadError.snapshotExpired }
        let last = p.index == p.pageCount - 1
        if last { guard p.nextCursor == nil else { throw OfficeMeetingReadError.invalidPage } }
        else {
            guard let cursor = p.nextCursor, !cursor.isEmpty, cursor.utf8.count <= 2048,
                  Self.matches(cursor, "^[A-Za-z0-9_-]+$"), !cursors.contains(cursor) else { throw OfficeMeetingReadError.invalidPage }
        }
        if let f = first {
            guard p.binding == f.binding, p.snapshotId == f.snapshotId, p.payloadHash == f.payloadHash,
                  p.observedAt == f.observedAt, p.expiresAt == f.expiresAt, p.pageCount == f.pageCount,
                  p.totalBytes == f.totalBytes, p.totalTurns == f.totalTurns, u == unresolved else { throw OfficeMeetingReadError.snapshotChanged }
        }
        let identity = Data("[1,\"\(p.binding)\",\"\(p.payloadHash)\"]".utf8)
        guard Self.hash(identity) == p.snapshotId, let chunk = Data(base64Encoded: p.data),
              chunk.count == p.chunkBytes, chunk.base64EncodedString() == p.data, Self.hash(chunk) == p.chunkHash else { throw OfficeMeetingReadError.invalidPage }
        if first == nil { first = p; unresolved = u }
        body.append(chunk); verifiedPages += 1; nextCursor = p.nextCursor
        if let cursor = nextCursor { cursors.insert(cursor); return nil }
        guard body.count == p.totalBytes, verifiedPages == p.pageCount, Self.hash(body) == p.payloadHash,
              Self.isUTF8JSON(body) else { throw OfficeMeetingReadError.invalidPage }
        try Self.validateBody(body, id: id, scope: scope, totalTurns: p.totalTurns, unresolved: u)
        try Task.checkCancellation()
        return body
    }

    static func validateBody(_ data: Data, id: String, scope: String, totalTurns: Int? = nil,
                             unresolved: OfficeMeetingUnresolved? = nil, statuses: Set<String> = ["ready"]) throws {
        struct Body: Decodable {
            struct Meeting: Decodable { let meetingId: String; let scope: String }
            struct Turn: Decodable { let id: String; let roundNumber: Int; let state: String }
            let status: String; let source: String?; let persisted: Bool; let meeting: Meeting; let turns: [Turn]; let historyComplete: Bool?
        }
        guard Self.isUTF8JSON(data) else { throw OfficeMeetingReadError.invalidPage }
        let detail: Body
        do { detail = try JSONDecoder().decode(Body.self, from: data) } catch { throw OfficeMeetingReadError.invalidPage }
        guard statuses.contains(detail.status), !["preview", "error"].contains(detail.source ?? ""), detail.persisted, detail.historyComplete != false,
              detail.meeting.meetingId.lowercased() == id, detail.meeting.scope == scope,
              detail.turns.count <= OfficeMeetingPageLimits.turns, totalTurns == nil || detail.turns.count == totalTurns else { throw OfficeMeetingReadError.invalidPage }
        var seen = Set<UUID>(), previous = 0
        for turn in detail.turns {
            guard Self.matches(turn.id, "^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$"),
                  let key = UUID(uuidString: turn.id), seen.insert(key).inserted, turn.roundNumber > previous, turn.roundNumber <= 9_007_199_254_740_991,
                  ["generated", "error", "running", "unknown"].contains(turn.state) else { throw OfficeMeetingReadError.invalidPage }
            previous = turn.roundNumber
        }
        if let u = unresolved {
            guard detail.turns.filter({ $0.state == "running" }).count == u.running,
                  detail.turns.filter({ $0.state == "unknown" }).count == u.unknown else { throw OfficeMeetingReadError.invalidPage }
        }
    }
}
