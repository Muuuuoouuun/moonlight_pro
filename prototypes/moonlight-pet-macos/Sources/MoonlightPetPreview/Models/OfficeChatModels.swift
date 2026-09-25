import Foundation

enum OfficeAgent: String, CaseIterable, Codable, Identifiable, Sendable {
    case eevee, vaporeon, jolteon, flareon, espeon, umbreon, leafeon, glaceon, sylveon
    var id: String { rawValue }
    var title: String {
        switch self {
        case .eevee: return "이브이"
        case .vaporeon: return "샤미드"
        case .jolteon: return "쥬피썬더"
        case .flareon: return "부스터"
        case .espeon: return "에브이"
        case .umbreon: return "블래키"
        case .leafeon: return "리피아"
        case .glaceon: return "글레이시아"
        case .sylveon: return "님피아"
        }
    }
    var role: String {
        switch self {
        case .eevee: return "비서실장"
        case .vaporeon: return "운영총괄"
        case .jolteon: return "기술총괄"
        case .flareon: return "매출총괄"
        case .espeon: return "전략총괄"
        case .umbreon: return "리스크총괄"
        case .leafeon: return "재무·자원총괄"
        case .glaceon: return "제품총괄"
        case .sylveon: return "브랜드·마케팅총괄"
        }
    }
}

enum OfficeChatScope: String, CaseIterable, Codable, Identifiable, Sendable {
    case all, classin, personal
    var id: String { rawValue }
    var title: String {
        switch self {
        case .all: return "전체"
        case .classin: return "회사"
        case .personal: return "개인"
        }
    }
}

struct OfficeChatHistory: Codable, Equatable, Sendable {
    let role: String
    let text: String
}

struct OfficeChatCommand: Encodable, Equatable, Sendable {
    static let contractVersion = "2026-09-22.v3"
    let ownerId: OfficeAgent
    let scope: OfficeChatScope
    let message: String
    let history: [OfficeChatHistory]

    init(ownerId: OfficeAgent, scope: OfficeChatScope, message: String, history: [OfficeChatHistory] = []) {
        self.ownerId = ownerId; self.scope = scope; self.message = message; self.history = history
    }
    private enum CodingKeys: String, CodingKey {
        case ownerId, mode, scope, message, participants, lens, history, includeProjects
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ownerId, forKey: .ownerId)
        try container.encode("chat", forKey: .mode)
        try container.encode(scope, forKey: .scope)
        try container.encode(message, forKey: .message)
        try container.encode([String](), forKey: .participants)
        try container.encodeNil(forKey: .lens)
        try container.encode(history, forKey: .history)
        try container.encode(false, forKey: .includeProjects)
    }
    func validate() throws {
        guard Self.validText(message, limit: 6000), history.count <= 8,
              history.allSatisfy({ ["user", "assistant"].contains($0.role) && Self.validText($0.text, limit: 6000) }) else {
            throw OfficeChatError.invalidInput
        }
        // The server measures JSON.stringify after trimming each history item.
        let normalized = history.map { OfficeChatHistory(role: $0.role, text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines)) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = try encoder.encode(normalized)
        guard let text = String(data: data, encoding: .utf8), text.utf16.count <= 20_000 else { throw OfficeChatError.invalidInput }
    }
    static func validText(_ text: String, limit: Int) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= limit
    }
}

struct OfficeChatReply: Equatable, Sendable {
    let answer: String
    let nextAction: String
    let contextNote: String
    let contextSource: String
    let logPersisted: Bool
    let runId: String?
}

enum OfficeChatError: Error, Equatable, LocalizedError {
    case invalidInput, invalidResponse, preview
    var errorDescription: String? {
        switch self {
        case .invalidInput: return "질문은 6,000자 이내로 적어 주세요. 대화가 길어졌다면 새 대화를 시작해 주세요."
        case .invalidResponse: return "담당자의 답변을 확인하지 못했어요. 질문은 보관돼 있어요."
        case .preview: return "Office AI 연결이 아직 준비되지 않았어요. 질문은 그대로 보관돼 있어요."
        }
    }
}
